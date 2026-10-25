import { doc,runTransaction,getDocsFromServer,collection,query,where,orderBy,limit,startAfter,writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { fallbackAfter } from './metadata-transport.mjs';
import { deadline } from './lock-gate.mjs';
import { FirestoreWriteClient } from './firestore-write.mjs';

export function firestoreAdapter(db,reader=null) {
  const writer=reader?new FirestoreWriteClient(reader):null;
  return {
    transact: callback => writer?writer.transact(callback):deadline(runTransaction(db,async tx=>callback({
      get:async path=>{const snap=await tx.get(doc(db,path));return snap.exists()?snap.data():null;},
      set:(path,value)=>tx.set(doc(db,path),value),
    })),20000,'Sync timed out. Your encrypted draft is retained; retry when the connection recovers.'),
    async history(path,cursor=null,pageSize=40,folder="events",server=false) {
      const constraints=[where("v","==",2),orderBy("__name__","desc"),limit(pageSize)];if(cursor)constraints.push(startAfter(cursor));
      const read=async()=>{const snap=await getDocsFromServer(query(collection(db,`${path}/${folder}`),...constraints));return {rows:snap.docs.map(d=>({id:d.id,data:d.data()})),cursor:snap.docs.at(-1)?.id??null,more:snap.size===pageSize,fromCache:snap.metadata?.fromCache??false};};
      return reader?fallbackAfter(read(),()=>reader.history(path.split('/').at(-1),cursor,pageSize,folder)):read();
    },
    async purge(path,isActive) {
      // Caller must first persist a deletion marker, then freeze editing.
      for(const folder of ["events","restored"])for(;;) {
        if(!isActive())throw new Error("Session changed.");
        const page=await this.history(path,null,200,folder,true);
        if(!page.rows.length)break;
        if(writer)await writer.remove(page.rows.map(d=>`${path}/${folder}/${d.id}`));
        else{const batch=writeBatch(db);page.rows.forEach(d=>batch.delete(doc(db,`${path}/${folder}/${d.id}`)));await batch.commit();}
      }
      if(!isActive())throw new Error("Session changed.");
      if(writer)await writer.remove([path]);
      else{const batch=writeBatch(db);batch.delete(doc(db,path));await batch.commit();}
    },
  };
}
