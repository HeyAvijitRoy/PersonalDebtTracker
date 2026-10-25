// Authenticated Firestore transactions over HTTPS. No admin credentials or
// plaintext financial fields; ordinary owner and paired-history rules apply.
export class FirestoreWriteClient {
 constructor(reader){this.reader=reader;}
 name(path){
  const prefix=this.reader.namespace+'/cards/';
  if(typeof path!=='string'||!path.startsWith(prefix)||!/^[A-Za-z0-9_-]{1,80}(\/(events|restored)\/[A-Za-z0-9_-]{1,80})?$/.test(path.slice(prefix.length)))throw new Error('Invalid owner-scoped write path.');
  return this.reader.resource.split('/documents/')[0]+'/documents/'+path;
 }
 call(operation,body){return this.reader.request(':'+operation,{method:'POST',body,databaseOperation:true});}
 fields(data){
  if(!data||![1,2].includes(data.v)||typeof data.iv!=='string'||typeof data.data!=='string'||Object.keys(data).some(key=>!['v','iv','data','revision','previous','purging'].includes(key)))throw new Error('Only encrypted envelopes can be written.');
  return Object.fromEntries(Object.entries(data).map(([key,value])=>{
   const encoded=typeof value==='string'?{stringValue:value}:typeof value==='boolean'?{booleanValue:value}:Number.isSafeInteger(value)?{integerValue:String(value)}:null;
   if(!encoded)throw new Error('Invalid encrypted envelope field.');return [key,encoded];
  }));
 }
 async transact(callback){
  // Match the browser SDK: optimistic reads plus per-document preconditions,
  // including verify writes for read-only documents. No BeginTransaction RPC.
  for(let attempt=0;attempt<3;attempt++){
   this.reader.active();const reads=new Map();let committing=false;
   try{
    const writes=new Map();let writing=false;
    const result=await callback({
     get:async path=>{
      if(writing)throw new Error('Transaction reads must precede writes.');
      const name=this.name(path),rows=await this.call('batchGet',{documents:[name]});
      if(!Array.isArray(rows))throw new Error('Invalid transactional read response.');
      const found=rows.find(row=>row.found?.name===name),missing=rows.some(row=>row.missing===name);
      if(found&&missing)throw new Error('Inconsistent transactional read.');
      if(!found&&!missing)throw new Error('Firestore did not confirm whether the record exists.');
      if(found&&(typeof found.found.updateTime!=='string'||!found.found.updateTime))throw new Error('Firestore did not return a document version.');
      const precondition=found?{updateTime:found.found.updateTime}:{exists:false};
      if(reads.has(name)&&JSON.stringify(reads.get(name))!==JSON.stringify(precondition)){const error=new Error('Document changed during the read.');error.code='aborted';throw error;}
      reads.set(name,precondition);
      if(missing)return null;
      const relative=path.slice(this.reader.namespace.length+1),folder=relative.slice(0,relative.lastIndexOf('/'));
      return this.reader.decode(found.found,folder).data;
     },
     set:(path,data)=>{writing=true;const name=this.name(path);if(writes.has(name))throw new Error('Duplicate document write.');writes.set(name,{update:{name,fields:this.fields(data)}});},
    });
    this.reader.active();
    const mutations=[...writes].map(([name,write])=>({...write,...(reads.has(name)?{currentDocument:reads.get(name)}:{})}));
    for(const [name,precondition] of reads)if(!writes.has(name))mutations.push({verify:name,currentDocument:precondition});
    if(!mutations.length)return result;
    committing=true;const response=await this.call('commit',{writes:mutations});
    const results=response.writeResults??[];
    if(!response.commitTime||!Array.isArray(results)||results.length!==mutations.length)throw new Error('Save confirmation was incomplete. Your encrypted draft is retained for a safe retry.');
    this.reader.active();return result;
   }catch(error){
    let retry=['aborted','failed-precondition','already-exists'].includes(error.code);
    // Paired-history rules can reject a stale revision before Firestore reports
    // its failed version precondition. Retry a denial only with server evidence
    // that a read document actually changed; unchanged denials remain errors.
    if(error.code==='permission-denied'&&committing&&reads.size&&attempt<2){
     try{
      const rows=await this.call('batchGet',{documents:[...reads.keys()]});
      if(Array.isArray(rows))retry=[...reads].some(([name,version])=>{
       const found=rows.find(row=>row.found?.name===name),missing=rows.some(row=>row.missing===name);
       if(found&&typeof found.found.updateTime==='string')return version.updateTime!==found.found.updateTime;
       return missing&&version.exists!==false;
      });
     }catch{}
    }
    if(!retry||attempt===2)throw error;
   }
  }
 }
 async remove(paths){
  this.reader.active();if(!Array.isArray(paths)||!paths.length||paths.length>200)throw new Error('Invalid deletion batch.');
  const writes=paths.map(path=>({delete:this.name(path)}));
  const response=await this.call('commit',{writes});
  if(!response.commitTime||response.writeResults?.length!==writes.length)throw new Error('Deletion confirmation unavailable. Retry cleanup.');
 }
}
