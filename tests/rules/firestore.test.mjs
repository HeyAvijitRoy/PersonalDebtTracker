import { before,after,beforeEach,test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment,assertSucceeds,assertFails } from "@firebase/rules-unit-testing";
import { doc,setDoc,getDoc,getDocs,collection,deleteDoc,writeBatch } from "firebase/firestore";
import { createMockUserToken } from '@firebase/util';
import { FirestoreReadClient } from '../../src/firestore-read.mjs';
import { FirestoreWriteClient } from '../../src/firestore-write.mjs';
import { TrackingStore } from '../../src/tracking-store.mjs';
import { memoryOutbox } from '../../src/outbox.mjs';
import { createAccount } from '../../src/account-model.mjs';
import assert from 'node:assert/strict';
let env;
const path="artifacts/demo-pdt/users/owner/cards/card";
const card=(revision,purging=false)=>({v:2,iv:"AAAAAAAAAAAAAAAA",data:"A".repeat(24),revision,purging});
const event=(revision,previous)=>({v:2,iv:"AAAAAAAAAAAAAAAA",data:"A".repeat(24),revision,previous});
before(async()=>{env=await initializeTestEnvironment({projectId:"demo-pdt",firestore:{host:"127.0.0.1",port:8085,rules:await readFile("firestore.rules","utf8")}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{await env.clearFirestore();});
function paired(db,revision,previous="absent",purging=false){const batch=writeBatch(db);batch.set(doc(db,path),card(revision,purging));batch.set(doc(db,`${path}/events/${revision}`),event(revision,previous));return batch.commit();}
test('HTTPS transactions replay encrypted drafts atomically, retain rejected drafts, and preserve idempotence',async()=>{
 const reader=uid=>new FirestoreReadClient({projectId:'demo-pdt',uid:'owner',getUser:()=>({uid:'owner',getIdToken:async()=>createMockUserToken({sub:uid},'demo-pdt')}),fetcher:(url,options)=>fetch(url.replace('https://firestore.googleapis.com','http://127.0.0.1:8085'),options)});
 const client=reader('owner'),writer=new FirestoreWriteClient(client),key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const outbox=memoryOutbox(),confirmed=[];
 const store=new TrackingStore({namespace:client.namespace,key,outbox,adapter:writer,onCommitted:views=>confirmed.push(...views)});
 const account=createAccount({name:'Synthetic HTTPS account',creditLimit:1000,availableCredit:200,apr:12});
 const view=await store.enqueue(null,account,'add'),[draft]=await outbox.list(client.namespace);
 await store.flush();assert.equal((await store.pending()).length,0);assert.equal(confirmed[0].balance,800);
 assert.equal((await client.accounts()).length,1);assert.equal((await client.history(view.id)).rows.length,1);
 await outbox.put(draft);await store.flush();assert.equal((await store.pending()).length,0);assert.equal((await client.history(view.id)).rows.length,1);
 store.adapter=new FirestoreWriteClient(reader('other'));await store.enqueue(view,{...account,note:'Permission failure'},'edit');await store.flush();
 assert.equal((await store.pending())[0].error,'rules');assert.equal((await client.history(view.id)).rows.length,1);
 store.adapter=writer;await store.flush();assert.equal((await store.pending()).length,0);
 const db=env.authenticatedContext('owner').firestore();
 const current=(await client.accounts())[0];
 await assertFails(writer.transact(async tx=>{await tx.get(`${client.namespace}/cards/${view.id}`);tx.set(`${client.namespace}/cards/${view.id}`,{...current.data,revision:'unpaired'});}));
 assert.equal((await getDoc(doc(db,`${client.namespace}/cards/${view.id}`))).data().revision,current.data.revision);
});
test('HTTPS account listing and history cursors obey owner rules',async()=>{
 const db=env.authenticatedContext('owner').firestore();await paired(db,'first');await paired(db,'second','first');
 const reader=uid=>new FirestoreReadClient({projectId:'demo-pdt',uid:'owner',getUser:()=>({uid:'owner',getIdToken:async()=>createMockUserToken({sub:uid},'demo-pdt')}),fetcher:(url,options)=>fetch(url.replace('https://firestore.googleapis.com','http://127.0.0.1:8085'),options)});
 const owner=reader('owner');const accounts=await owner.accounts();if(accounts.length!==1)throw new Error('Expected one owner account');
 const page=await owner.history('card',null,1);if(page.rows[0].id!=='second')throw new Error('Expected descending history');
 const next=await owner.history('card',page.cursor,1);if(next.rows[0].id!=='first')throw new Error('Expected cursor to skip previous event');
 await assertFails(reader('other').accounts());await assertFails(reader('other').history('card'));
});
test("owner can atomically create/read a snapshot and history event",async()=>{
 const db=env.authenticatedContext("owner").firestore();await assertSucceeds(paired(db,"first"));
 await assertSucceeds(getDoc(doc(db,path)));await assertSucceeds(getDoc(doc(db,`${path}/events/first`)));
 await assertSucceeds(paired(db,"second","first"));
});
test("anonymous and other users cannot read or write the owner's account or history",async()=>{
 const db=env.authenticatedContext("owner").firestore();await paired(db,"first");
 for(const context of [env.unauthenticatedContext(),env.authenticatedContext("other")]) {
   const foreign=context.firestore();await assertFails(getDoc(doc(foreign,path)));
   await assertFails(getDoc(doc(foreign,`${path}/events/first`)));await assertFails(paired(foreign,"bad","first"));
   await assertFails(deleteDoc(doc(foreign,path)));
 }
});
test("standalone snapshots/events, plaintext fields, oversized ciphertext and stale revisions are denied",async()=>{
 const db=env.authenticatedContext("owner").firestore();
 await assertFails(setDoc(doc(db,path),card("first")));
 await assertFails(setDoc(doc(db,`${path}/events/first`),event("first","absent")));
 await paired(db,"first");await assertFails(paired(db,"stale","wrong"));
 const batch=writeBatch(db);batch.set(doc(db,path),{...card("bad"),balance:100});batch.set(doc(db,`${path}/events/bad`),event("bad","first"));await assertFails(batch.commit());
 const huge=writeBatch(db);huge.set(doc(db,path),{...card("huge"),data:"A".repeat(8193)});huge.set(doc(db,`${path}/events/huge`),event("huge","first"));await assertFails(huge.commit());
});
test("history cannot be overwritten or removed before a terminal purge",async()=>{
 const db=env.authenticatedContext("owner").firestore();await paired(db,"first");
 await assertFails(setDoc(doc(db,`${path}/events/first`),event("first","absent")));
 await assertFails(deleteDoc(doc(db,`${path}/events/first`)));await assertFails(deleteDoc(doc(db,path)));
 await assertSucceeds(paired(db,"purge","first",true));
 await assertFails(paired(db,"restore","purge"));
 await assertSucceeds(deleteDoc(doc(db,`${path}/events/first`)));
 await assertSucceeds(deleteDoc(doc(db,`${path}/events/purge`)));await assertSucceeds(deleteDoc(doc(db,path)));
});
test("legacy data remains readable but can only upgrade through a paired write",async()=>{
 const legacy={v:1,iv:"AAAAAAAAAAAAAAAA",data:"A".repeat(24)};
 await env.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),path),legacy));
 const db=env.authenticatedContext("owner").firestore();await assertSucceeds(getDoc(doc(db,path)));
 await assertFails(setDoc(doc(db,path),legacy));await assertSucceeds(paired(db,"upgraded","legacy"));
 await assertFails(setDoc(doc(db,path),legacy));
});
test("backup history is owner-only and immutable until purge",async()=>{
 const db=env.authenticatedContext('owner').firestore();await paired(db,'first');
 const restored=doc(db,`${path}/restored/imported`);
 await assertSucceeds(setDoc(restored,event('imported','backup')));
 await assertFails(setDoc(restored,event('imported','backup')));
 await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(),`${path}/restored/imported`)));
 await assertFails(deleteDoc(restored));await paired(db,'purge','first',true);await assertSucceeds(deleteDoc(restored));
});
test("two linked account updates and their events can commit in one atomic transfer",async()=>{
 const db=env.authenticatedContext('owner').firestore();await paired(db,'first');
 const target=path.slice(0,-4)+'target';
 const create=writeBatch(db);create.set(doc(db,target),card('target-first'));create.set(doc(db,`${target}/events/target-first`),event('target-first','absent'));await assertSucceeds(create.commit());
 const transfer=writeBatch(db);for(const [p,previous] of [[path,'first'],[target,'target-first']]){transfer.set(doc(db,p),card('transfer'));transfer.set(doc(db,`${p}/events/transfer`),event('transfer',previous));}
 await assertSucceeds(transfer.commit());
});
test("purge can remove history across multiple bounded batches",async()=>{
 await env.withSecurityRulesDisabled(async context=>{const db=context.firestore(),batch=writeBatch(db);batch.set(doc(db,path),card('purge',true));for(let i=0;i<420;i++)batch.set(doc(db,`${path}/events/event-${i}`),event(`event-${i}`,'absent'));await batch.commit();});
 const db=env.authenticatedContext('owner').firestore();const records=await getDocs(collection(db,`${path}/events`));
 for(let index=0;index<records.docs.length;index+=200){const batch=writeBatch(db);records.docs.slice(index,index+200).forEach(row=>batch.delete(row.ref));await assertSucceeds(batch.commit());}
 await assertSucceeds(deleteDoc(doc(db,path)));
});
test('owner can create/read passphrase metadata; foreign users and malformed metadata are denied',async()=>{
 const db=env.authenticatedContext('owner').firestore();const metadataPath='artifacts/demo-pdt/users/owner/meta/crypto';
 await assertSucceeds(setDoc(doc(db,metadataPath),{v:1,salt:'A'.repeat(24),verifier:{iv:'A'.repeat(16),data:'A'.repeat(24)}}));
 await assertSucceeds(getDoc(doc(db,metadataPath)));
 await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(),metadataPath)));
 await assertFails(setDoc(doc(db,metadataPath),{v:1,salt:'A'.repeat(24)}));
});
