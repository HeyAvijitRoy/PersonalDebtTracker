import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { SessionScope } from '../src/session-scope.mjs';
const source=await readFile('app.js','utf8');
const setup=source.slice(source.indexOf('async function createCryptoMeta('),source.indexOf('// Returning session:'));
const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
function harness(exists,changeSession=false){
 let writes=0;const state={crypto,sessionScope:new SessionScope(),userId:'owner',cryptoKey:null,deriveKey:async()=>key,textEnc:new TextEncoder(),VERIFY_TOKEN:'synthetic',toB64:bytes=>Buffer.from(bytes).toString('base64'),db:{},metaDocRef:()=>({}),runTransaction:async(_db,callback)=>{if(changeSession)state.sessionScope.invalidate();return callback({get:async()=>({exists:()=>exists}),set:()=>writes++});}};
 vm.createContext(state);vm.runInContext(setup,state);return {state,writes:()=>writes};
}
test('first-time setup cannot overwrite encryption settings created by another session',async()=>{
 const h=harness(true);await assert.rejects(h.state.createCryptoMeta('owner','synthetic'),/already exist/);assert.equal(h.writes(),0);assert.equal(h.state.cryptoKey,null);
});
test('a changed sign-in session cannot create new encryption settings or restore a key',async()=>{
 const h=harness(false,true);await assert.rejects(h.state.createCryptoMeta('owner','synthetic'),/Session changed/);assert.equal(h.writes(),0);assert.equal(h.state.cryptoKey,null);
});
