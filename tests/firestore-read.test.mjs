import test from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreReadClient } from '../src/firestore-read.mjs';
import { fallbackAfter } from '../src/metadata-transport.mjs';
const root='projects/project/databases/(default)/documents/artifacts/project/users/owner';
const document=(path)=>({name:root+'/'+path,fields:{v:{integerValue:'2'},iv:{stringValue:'cipher-iv'},data:{stringValue:'ciphertext'},purging:{booleanValue:false}}});
const user={uid:'owner',getIdToken:async()=> 'test-token'};
function client(handler,extra={}){return new FirestoreReadClient({projectId:'project',uid:'owner',getUser:()=>user,fetcher:async(url,options)=>({ok:true,json:async()=>handler(url,options)}),...extra});}
test('account HTTPS reads paginate ciphertext with owner authentication only in headers',async()=>{
 let calls=0;
 const reader=client((url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer test-token');assert.ok(!url.includes('test-token'));assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  calls++;if(calls===1)return {documents:[document('cards/one')],nextPageToken:'next page'};
  assert.equal(new URL(url).searchParams.get('pageToken'),'next page');return {documents:[document('cards/two')]};
 });
 const rows=await reader.accounts();assert.deepEqual(rows.map(row=>row.id),['one','two']);assert.equal(rows[0].data.purging,false);
});
test('history uses descending document cursor and validates owner document paths',async()=>{
 const reader=client((url,options)=>{
  assert.ok(url.endsWith('/cards/one:runQuery'));const query=JSON.parse(options.body).structuredQuery;
  assert.equal(query.startAt.values[0].referenceValue,root+'/cards/one/events/previous');assert.equal(query.startAt.before,false);assert.equal(query.orderBy[0].direction,'DESCENDING');
  return [{document:document('cards/one/events/event')},{readTime:'now'}];
 });
 assert.equal((await reader.history('one','previous',1)).more,true);
 assert.throws(()=>reader.decode({name:root.replace('/owner','/other')+'/cards/one'},'cards'),/Unexpected/);
 await assert.rejects(reader.history('../one'),/identifier/);
});
test('permission and changed-session responses cannot become empty account lists',async()=>{
 const reader=client(()=>({}),{fetcher:async()=>({ok:false,status:403,json:async()=>({error:{status:'PERMISSION_DENIED'}})})});
 await assert.rejects(reader.accounts(),error=>error.code==='permission-denied');
 await assert.rejects(client(()=>({}),{getUser:()=>({...user,uid:'other'})}).accounts(),/sign in/);
 let active=true;const late=client(()=>{active=false;return {};},{isActive:()=>active});await assert.rejects(late.accounts(),/Session changed/);
});
test('primary rejection starts the authenticated fallback immediately and once',async()=>{
 let calls=0;assert.equal(await fallbackAfter(Promise.reject(new Error('SDK unavailable')),async()=>{calls++;return 'recovered';},10000),'recovered');assert.equal(calls,1);
});
