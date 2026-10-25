// Synthetic transport only; production assets never include tests/.
const base='projects/synthetic-project/databases/(default)/documents/';
const encode=value=>Object.fromEntries(Object.entries(value).map(([key,value])=>[key,typeof value==='string'?{stringValue:value}:typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?{integerValue:String(value)}:{mapValue:{fields:encode(value)}}]));
const decode=fields=>Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,value.stringValue??value.booleanValue??Number(value.integerValue)]));
export function restStub(page){

 return async route=>{
  const url=new URL(route.request().url()),operation=url.pathname.split(':').at(-1);
  const state=await page.evaluate(()=>({enabled:globalThis.__syntheticRestMetadataEnabled,offline:globalThis.__syntheticOffline,denied:globalThis.__syntheticWritesDenied,docs:[...globalThis.__syntheticDocs??[]]}));
  const docs=new Map(state.docs),reply=(value,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type'},body:JSON.stringify(value)});
  if(route.request().method()==='OPTIONS')return reply({});
  if(route.request().headers().authorization!=='Bearer synthetic-token')return reply({error:{status:'PERMISSION_DENIED'}},403);
  const document=(path,data)=>({name:base+path,fields:encode(data),updateTime:'version-'+JSON.stringify(data)});
  // Explicit server transactions are deliberately denied, matching the
  // production Firebase-ID-token limitation that the emulator did not enforce.
  if(['beginTransaction','rollback'].includes(operation))return reply({error:{status:'PERMISSION_DENIED'}},403);
  if(['batchGet','commit'].includes(operation)){
   if(state.offline)return route.abort();
   if(state.denied)return reply({error:{status:'PERMISSION_DENIED'}},403);
   const body=route.request().postDataJSON();
   if(body.transaction)throw new Error('Browser saves must not use explicit transactions.');
   if(operation==='batchGet')return reply(body.documents.map(name=>{const path=name.slice(base.length),data=docs.get(path);return data?{found:document(path,data)}:{missing:name};}));
   const writes=body.writes??[];
   for(const write of writes){const name=write.update?.name??write.verify??write.delete,data=docs.get(name.slice(base.length)),condition=write.currentDocument;if(condition&&(Object.hasOwn(condition,'exists')?Boolean(data)!==condition.exists:!data||document(name.slice(base.length),data).updateTime!==condition.updateTime))return reply({error:{status:'FAILED_PRECONDITION'}},400);}
   await page.evaluate(({writes,base})=>{for(const write of writes){if(write.verify)continue;if(write.delete)__syntheticDocs.delete(write.delete.slice(base.length));else __syntheticDocs.set(write.name.slice(base.length),write.data);}__syntheticEmit();},{base,writes:writes.map(write=>write.delete||write.verify?write:{name:write.update.name,data:decode(write.update.fields)})});
   return reply({commitTime:new Date().toISOString(),writeResults:writes.map(()=>({}))});
  }
  if(!state.enabled)return route.abort();
  if(operation==='runQuery'){
   const query=route.request().postDataJSON().structuredQuery,folder=url.pathname.split('/documents/')[1].split(':')[0]+'/'+query.from[0].collectionId;
   const paths=[...docs.keys()].filter(path=>path.startsWith(folder+'/')&&path.split('/').length===folder.split('/').length+1).sort().reverse().filter(path=>!query.startAt||base+path<query.startAt.values[0].referenceValue).slice(0,query.limit);
   return reply(paths.map(path=>({document:document(path,docs.get(path))})));
  }
  if(url.pathname.endsWith('/cards'))return reply({documents:[...docs].filter(([path])=>/\/cards\/[^/]+$/.test(path)).map(([path,data])=>document(path,data))});
  const meta=[...docs].find(([path])=>path.endsWith('/meta/crypto'))?.[1];
  return meta?reply({fields:encode(meta)}):reply({error:{status:'NOT_FOUND',message:'Document not found.'}},404);
 };
}
