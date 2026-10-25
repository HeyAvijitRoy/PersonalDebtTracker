import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCryptoMetadata,fallbackAfter,metadataCache } from '../src/metadata-transport.mjs';
const meta={v:1,salt:'A'.repeat(24),verifier:{iv:'A'.repeat(16),data:'A'.repeat(60)}};
const user={uid:'owner',getIdToken:async()=> 'synthetic-token'};
const encoded={fields:{v:{integerValue:'1'},salt:{stringValue:meta.salt},verifier:{mapValue:{fields:{iv:{stringValue:meta.verifier.iv},data:{stringValue:meta.verifier.data}}}}}};
test('metadata fallback authenticates over HTTPS without putting the token in URLs',async()=>{
 let requested;
 const value=await fetchCryptoMetadata({projectId:'project',uid:'owner',user,fetcher:async(url,options)=>{requested={url,options};return {ok:true,status:200,json:async()=>encoded};}});
 assert.deepEqual(value,meta);assert.ok(requested.url.startsWith('https://firestore.googleapis.com/'));assert.ok(!requested.url.includes('synthetic-token'));assert.equal(requested.options.headers.Authorization,'Bearer synthetic-token');assert.equal(requested.options.cache,'no-store');
});
test('permission/session/configuration errors never become a missing-metadata result',async()=>{
 await assert.rejects(fetchCryptoMetadata({projectId:'p',uid:'other',user}),/session changed/);
 for(const status of [401,403,500])await assert.rejects(fetchCryptoMetadata({projectId:'p',uid:'owner',user,fetcher:async()=>({ok:false,status,json:async()=>({error:{}})})}));
 const request=message=>fetchCryptoMetadata({projectId:'p',uid:'owner',user,fetcher:async()=>({ok:false,status:404,json:async()=>({error:{status:'NOT_FOUND',message}})})});
 assert.equal(await request('Document not found.'),null);await assert.rejects(request('The database does not exist.'));
});
test('fallback is used only when the primary request stalls',async()=>{
 let called=false;assert.equal(await fallbackAfter(Promise.resolve(meta),async()=>{called=true;return null;},5),meta);assert.equal(called,false);
 assert.equal(await fallbackAfter(new Promise(()=>{}),async()=>meta,5),meta);
});
test('metadata cache is owner-scoped and contains only salt and encrypted verifier',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 const cache=metadataCache(storage,'project:owner');cache.write({...meta,token:'must-not-persist',balance:100});assert.deepEqual(cache.read(),meta);
 assert.equal(metadataCache(storage,'project:other').read(),null);assert.equal([...values.values()].some(value=>value.includes('must-not-persist')||value.includes('balance')),false);
});
