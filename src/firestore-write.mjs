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
  for(let attempt=0;attempt<3;attempt++){
   this.reader.active();let transaction,finished=false;
   try{
    ({transaction}=await this.call('beginTransaction',{options:{readWrite:{}}}));
    if(typeof transaction!=='string'||!transaction)throw new Error('Firestore did not start a transaction. Your draft is retained.');
    const writes=[];let writing=false;
    const result=await callback({
     get:async path=>{
      if(writing)throw new Error('Transaction reads must precede writes.');
      const name=this.name(path),rows=await this.call('batchGet',{documents:[name],transaction});
      if(!Array.isArray(rows))throw new Error('Invalid transactional read response.');
      const found=rows.find(row=>row.found?.name===name),missing=rows.some(row=>row.missing===name);
      if(found&&missing)throw new Error('Inconsistent transactional read.');
      if(found){const relative=path.slice(this.reader.namespace.length+1),folder=relative.slice(0,relative.lastIndexOf('/'));return this.reader.decode(found.found,folder).data;}
      if(missing)return null;
      throw new Error('Firestore did not confirm whether the record exists.');
     },
     set:(path,data)=>{writing=true;writes.push({update:{name:this.name(path),fields:this.fields(data)}});},
    });
    this.reader.active();
    // Replayed operations may already have an immutable event on the server.
    // Their authenticated reads confirm completion; release the read transaction.
    if(!writes.length){await this.call('rollback',{transaction});finished=true;this.reader.active();return result;}
    const response=await this.call('commit',{transaction,writes});
    const results=response.writeResults??[];
    if(!response.commitTime||!Array.isArray(results)||results.length!==writes.length)throw new Error('Save confirmation was incomplete. Your encrypted draft is retained for a safe retry.');
    finished=true;this.reader.active();return result;
   }catch(error){if(error.code!=='aborted'||attempt===2)throw error;}
   finally{if(transaction&&!finished&&this.reader.isActive())await this.call('rollback',{transaction}).catch(()=>{});}
  }
 }
 async remove(paths){
  this.reader.active();if(!Array.isArray(paths)||!paths.length||paths.length>200)throw new Error('Invalid deletion batch.');
  const writes=paths.map(path=>({delete:this.name(path)}));
  const response=await this.call('commit',{writes});
  if(!response.commitTime||response.writeResults?.length!==writes.length)throw new Error('Deletion confirmation unavailable. Retry cleanup.');
 }
}
