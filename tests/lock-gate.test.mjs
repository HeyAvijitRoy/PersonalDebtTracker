import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLockMetadata } from '../src/lock-gate.mjs';
const meta={v:1,salt:'A'.repeat(24),verifier:{iv:'A'.repeat(16),data:'A'.repeat(60)}};
test('cached existing encryption settings show unlock without waiting for a server',async()=>{
 let serverCalled=false;assert.equal(await loadLockMetadata({cached:async()=>meta,server:async()=>{serverCalled=true;return new Promise(()=>{});}}),meta);assert.equal(serverCalled,false);
});
test('cached absence cannot trigger setup without server confirmation',async()=>{
 assert.equal(await loadLockMetadata({cached:async()=>null,server:async()=>meta}),meta);
 assert.equal(await loadLockMetadata({cached:async()=>null,server:async()=>null}),null);
});
test('hanging cache/server and permission failures stop loading rather than fabricate setup',async()=>{
 await assert.rejects(loadLockMetadata({cached:async()=>null,server:()=>new Promise(()=>{}),timeoutMs:5}),/did not respond/);
 assert.equal(await loadLockMetadata({cached:()=>new Promise(()=>{}),server:async()=>meta,cacheTimeoutMs:5}),meta);
 await assert.rejects(loadLockMetadata({cached:async()=>null,server:async()=>{throw Object.assign(new Error('Denied'),{code:'permission-denied'});}}),/Denied/);
 await assert.rejects(loadLockMetadata({cached:async()=>null,server:async()=>({v:99})}),/No settings were changed/);
});
