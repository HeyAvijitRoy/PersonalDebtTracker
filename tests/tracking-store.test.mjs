import test from "node:test";
import assert from "node:assert/strict";
import { TrackingStore, revisionOf, decryptEvent } from "../src/tracking-store.mjs";
import { memoryOutbox } from "../src/outbox.mjs";
import { createAccount } from "../src/account-model.mjs";
import { decryptAccount } from "../src/account-crypto.mjs";
import { restoreBackup } from "../src/account-tools.mjs";
import { BACKUP_FORMAT } from "../src/backup.mjs";
const namespace="artifacts/test/users/owner";
const key=await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const account=createAccount({name:"Private",creditLimit:1000,availableCredit:200,apr:12});
function setup(){const docs=new Map();const adapter={transact:async run=>{const writes=[];await run({get:async path=>docs.get(path)??null,set:(path,data)=>writes.push([path,data])});writes.forEach(([p,v])=>docs.set(p,v));}};const outbox=memoryOutbox();return {docs,outbox,store:new TrackingStore({namespace,key,adapter,outbox})};}
test("account and encrypted event commit together; replay is idempotent",async()=>{
  const {docs,outbox,store}=setup();const view=await store.enqueue(null,account,"add");
  const [pending]=await outbox.list(namespace);
  assert.equal(JSON.stringify(pending).includes("Private"),false);
  await store.flush();assert.equal(docs.size,2);assert.equal((await store.pending()).length,0);
  const path=`${namespace}/cards/${view.id}`;
  assert.deepEqual(await decryptAccount(docs.get(path),key,path),account);
  const eventPath=`${path}/events/${view._revision}`;
  assert.equal((await decryptEvent(docs.get(eventPath),key,eventPath)).type,"add");
  await outbox.put(pending);await store.flush();assert.equal(docs.size,2);
});
test("stale drafts stay encrypted and do not overwrite another device",async()=>{
  const {docs,store}=setup();const view=await store.enqueue(null,account,"add");await store.flush();
  const path=`${namespace}/cards/${view.id}`;
  const stale={...view,_revision:"stale"};
  await store.enqueue(stale,{...account,note:"draft"},"edit");
  const before=structuredClone(docs.get(path));await store.flush();
  assert.deepEqual(docs.get(path),before);assert.equal((await store.pending())[0].status,"conflict");
  await store.discard(view.id);assert.equal((await store.pending()).length,0);
});
test("context binding rejects moving ciphertext to another account or user",async()=>{
  const {docs,store}=setup();const view=await store.enqueue(null,account,"add");await store.flush();
  const path=`${namespace}/cards/${view.id}`;
  await assert.rejects(decryptAccount(docs.get(path),key,`${namespace}/cards/other`));
  assert.equal(revisionOf(null),"absent");store.close();await assert.rejects(store.pending());
});
test("linked transfers commit both accounts together and fees increase total balances",async()=>{
 const {docs,store}=setup();const source=await store.enqueue(null,account,'add');
 const targetAccount=createAccount({name:'Target',creditLimit:1000,availableCredit:800,apr:0});const target=await store.enqueue(null,targetAccount,'add');await store.flush();
 const sourceAfter={...account,balance:700,availableCredit:300},targetAfter={...targetAccount,balance:310,availableCredit:690};
 await store.enqueue(source,sourceAfter,'transfer',{amountCents:10000,feeCents:1000,other:{id:target.id,base:target._revision,after:targetAfter}});await store.flush();
 const a=await decryptAccount(docs.get(`${namespace}/cards/${source.id}`),key,`${namespace}/cards/${source.id}`),b=await decryptAccount(docs.get(`${namespace}/cards/${target.id}`),key,`${namespace}/cards/${target.id}`);
 assert.equal(a.balance+b.balance,1010);
 const old=structuredClone(docs.get(`${namespace}/cards/${source.id}`));
 await store.enqueue({...source,_revision:revisionOf(old)},sourceAfter,'transfer',{amountCents:1,feeCents:0,other:{id:target.id,base:'stale',after:targetAfter}});await store.flush();
 assert.deepEqual(docs.get(`${namespace}/cards/${source.id}`),old);assert.equal((await store.pending())[0].status,'conflict');
});
test("unchanged edits skip history and oversized encrypted records fail before entering the outbox",async()=>{
 const {store}=setup();const view=await store.enqueue(null,account,'add');await store.flush();
 assert.equal(await store.enqueue(view,{...account,updatedAt:'2026-10-25T12:00:00.000Z'},'edit'),null);
 await assert.rejects(store.enqueue(view,{...account,note:'changed'},'edit',{note:'x'.repeat(32768)}),/storage limit/);
 assert.equal((await store.pending()).length,0);
});
test("a complete backup restores into an empty account under a new key and namespace",async()=>{
 const source=setup();const original=await source.store.enqueue(null,account,'add');await source.store.flush();
 const eventPath=`${namespace}/cards/${original.id}/events/${original._revision}`;
 const event=await decryptEvent(source.docs.get(eventPath),key,eventPath);
 const backup={format:BACKUP_FORMAT,version:1,accounts:[{id:original.id,account,events:[event]}]};
 const target=setup(),newNamespace='artifacts/test/users/new-owner';const newKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const store=new TrackingStore({namespace:newNamespace,key:newKey,adapter:target.store.adapter,outbox:target.outbox});
 await restoreBackup(store,backup,[]);await store.flush();
 const path=`${newNamespace}/cards/${original.id}`,raw=target.docs.get(path);
 assert.deepEqual(await decryptAccount(raw,newKey,path),account);await assert.rejects(decryptAccount(raw,key,path));
 const count=target.docs.size;
 await restoreBackup(store,backup,[{...account,id:original.id,_revision:revisionOf(raw)}]);await store.flush();assert.equal(target.docs.size,count);
 assert.equal((await store.pending()).length,0);
});
