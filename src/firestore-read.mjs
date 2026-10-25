import { deadline } from './lock-gate.mjs';
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value))throw new Error('Invalid record identifier.');return value;};
const field=value=>{
 if(Object.hasOwn(value,'stringValue'))return value.stringValue;
 if(Object.hasOwn(value,'integerValue')){const number=Number(value.integerValue);if(!Number.isSafeInteger(number))throw new Error('Invalid numeric field.');return number;}
 if(Object.hasOwn(value,'booleanValue'))return value.booleanValue;
 throw new Error('Unsupported encrypted record format.');
};
export class FirestoreReadClient {
 constructor({projectId,uid,getUser,fetcher=(...args)=>fetch(...args),isActive=()=>true,timeoutMs=10000}){
  Object.assign(this,{projectId,uid,getUser,fetcher,isActive,timeoutMs});
  this.namespace=`artifacts/${projectId}/users/${uid}`;
  this.resource=`projects/${encodeURIComponent(projectId)}/databases/(default)/documents/artifacts/${encodeURIComponent(projectId)}/users/${encodeURIComponent(uid)}`;
 }
 active(){if(!this.isActive())throw new Error('Session changed. Unlock again.');}
 async request(suffix,{method='GET',body,databaseOperation=false}={}){
  if(databaseOperation&&![':beginTransaction',':batchGet',':commit',':rollback'].includes(suffix))throw new Error('Unsupported database operation.');
  this.active();const user=this.getUser();if(!user||user.uid!==this.uid)throw new Error('Sign out and sign in again to load your accounts.');
  const token=await deadline(user.getIdToken(),8000,'Sign-in refresh timed out. Sign out and sign in again.');this.active();
  if(!token)throw new Error('Your sign-in session is unavailable. Sign out and sign in again.');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
  try{
   const resource=databaseOperation?this.resource.split('/documents/')[0]+'/documents':this.resource;
   const response=await this.fetcher(`https://firestore.googleapis.com/v1/${resource}${suffix}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',cache:'no-store',signal:controller.signal});
   const result=await response.json();this.active();
   if(!response.ok){const error=new Error(response.status===403?'Firestore denied access. Deploy the current firestore.rules to the correct Firebase project, then retry. Your draft is retained.':response.status===401?'Your sign-in session expired. Sign out and sign in again.':'Firestore could not complete the request. Check the connection and retry.');error.code=result.error?.status?.toLowerCase().replaceAll('_','-');throw error;}
   return result;
  }catch(error){if(error.name==='AbortError')throw new Error('Account data did not respond. Retry or check access to firestore.googleapis.com.');if(error instanceof TypeError)throw new Error('Your browser could not reach Firestore. Check network/filter settings and retry.');throw error;}
  finally{clearTimeout(timer);}
 }
 decode(document,folder){
  const prefix=`${decodeURIComponent(this.resource)}/${folder}/`;
  if(typeof document?.name!=='string'||!document.name.startsWith(prefix))throw new Error('Unexpected account response. Nothing was changed.');
  const name=id(document.name.slice(prefix.length));
  const data=Object.fromEntries(Object.entries(document.fields??{}).map(([key,value])=>[key,field(value)]));
  return {id:name,data};
 }
 async accounts(){
  const result=new Map();let pageToken;const seen=new Set();
  do{
   const params=new URLSearchParams({pageSize:'100'});if(pageToken)params.set('pageToken',pageToken);
   const page=await this.request('/cards?'+params);if(page.documents&&!Array.isArray(page.documents))throw new Error('Invalid account response.');
   for(const document of page.documents??[]){const row=this.decode(document,'cards');result.set(row.id,row);}
   if(result.size>1000)throw new Error('Too many accounts to load in one view.');
   const next=page.nextPageToken;if(next&&(typeof next!=='string'||seen.has(next)||seen.size>=100))throw new Error('Invalid account pagination.');if(next)seen.add(next);pageToken=next;
  }while(pageToken);
  return [...result.values()];
 }
 async history(accountId,cursor=null,pageSize=40,folder='events'){
  id(accountId);if(cursor)id(cursor);if(!['events','restored'].includes(folder)||!Number.isInteger(pageSize)||pageSize<1||pageSize>200)throw new Error('Invalid history request.');
  const parent=`/cards/${accountId}`,query={from:[{collectionId:folder}],where:{fieldFilter:{field:{fieldPath:'v'},op:'EQUAL',value:{integerValue:'2'}}},orderBy:[{field:{fieldPath:'__name__'},direction:'DESCENDING'}],limit:pageSize};
  if(cursor)query.startAt={values:[{referenceValue:`${decodeURIComponent(this.resource)}${parent}/${folder}/${cursor}`}],before:false};
  const response=await this.request(`${parent}:runQuery`,{method:'POST',body:{structuredQuery:query}});
  if(!Array.isArray(response))throw new Error('Invalid history response.');
  const rows=response.filter(row=>row.document).map(row=>this.decode(row.document,`cards/${accountId}/${folder}`));
  return {rows,cursor:rows.at(-1)?.id??null,more:rows.length===pageSize,fromCache:false};
 }
}
