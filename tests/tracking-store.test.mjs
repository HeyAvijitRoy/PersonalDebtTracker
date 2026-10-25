import test from "node:test";
import assert from "node:assert/strict";
import { TrackingStore, revisionOf, decryptEvent } from "../src/tracking-store.mjs";
import { memoryOutbox } from "../src/outbox.mjs";
import { createAccount } from "../src/account-model.mjs";
import { decryptAccount } from "../src/account-crypto.mjs";
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
