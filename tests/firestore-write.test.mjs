import test from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreWriteClient } from '../src/firestore-write.mjs';
const namespace='artifacts/project/users/owner',resource='projects/project/databases/(default)/documents/'+namespace;
const envelope={v:2,iv:'A'.repeat(16),data:'A'.repeat(24),revision:'one',purging:false};
function setup(handle){const calls=[];let active=true;const reader={namespace,resource,isActive:()=>active,active:()=>{if(!active)throw new Error('Session changed');},decode:document=>({data:document.fields}),request:async(operation,options)=>{calls.push({operation,options});return handle(operation,options,calls,()=>active=false);}};return {writer:new FirestoreWriteClient(reader),calls};}
test('HTTPS writer restricts owner paths and rejects plaintext fields',()=>{
 const {writer}=setup(()=>{});
 for(const path of ['artifacts/project/users/other/cards/one',namespace+'/cards/one/../../meta/crypto',namespace+'/meta/crypto'])assert.throws(()=>writer.name(path),/path/);
 assert.throws(()=>writer.fields({...envelope,balance:500}),/encrypted/);
 assert.deepEqual(writer.fields(envelope).v,{integerValue:'2'});
});
test('only a complete commit acknowledgement resolves a save; failed reads are never absence',async()=>{
 const {writer}=setup(operation=>operation===':beginTransaction'?{transaction:'transaction'}:operation===':batchGet'?[]:{});
 await assert.rejects(writer.transact(tx=>tx.get(namespace+'/cards/one')),/confirm whether/);
 const partial=setup(operation=>operation===':beginTransaction'?{transaction:'transaction'}:{});
 await assert.rejects(partial.writer.transact(async tx=>tx.set(namespace+'/cards/one',envelope)),/confirmation/);
});
test('aborted commits retry the whole transaction and never resolve after session changes',async()=>{
 let commits=0,runs=0;
 const {writer}=setup(operation=>{if(operation===':beginTransaction')return {transaction:'transaction'};if(operation===':commit'){if(++commits===1){const error=new Error('Contention');error.code='aborted';throw error;}return {commitTime:'now',writeResults:[{}]};}return {};});
 const value=await writer.transact(async tx=>{runs++;tx.set(namespace+'/cards/one',envelope);return 'saved';});assert.equal(value,'saved');assert.equal(runs,2);
 const late=setup((operation,options,calls,deactivate)=>{if(operation===':beginTransaction')return {transaction:'transaction'};if(operation===':commit'){deactivate();return {commitTime:'now',writeResults:[{}]};}return {};});
 await assert.rejects(late.writer.transact(async tx=>tx.set(namespace+'/cards/one',envelope)),/Session changed/);
});
