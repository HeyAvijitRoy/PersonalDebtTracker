import { before,after,beforeEach,test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeTestEnvironment,assertSucceeds,assertFails } from "@firebase/rules-unit-testing";
import { doc,setDoc,getDoc,deleteDoc,writeBatch } from "firebase/firestore";
let env;
const path="artifacts/demo-pdt/users/owner/cards/card";
const card=(revision,purging=false)=>({v:2,iv:"AAAAAAAAAAAAAAAA",data:"A".repeat(24),revision,purging});
const event=(revision,previous)=>({v:2,iv:"AAAAAAAAAAAAAAAA",data:"A".repeat(24),revision,previous});
before(async()=>{env=await initializeTestEnvironment({projectId:"demo-pdt",firestore:{host:"127.0.0.1",port:8085,rules:await readFile("firestore.rules","utf8")}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{await env.clearFirestore();});
function paired(db,revision,previous="absent",purging=false){const batch=writeBatch(db);batch.set(doc(db,path),card(revision,purging));batch.set(doc(db,`${path}/events/${revision}`),event(revision,previous));return batch.commit();}
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
