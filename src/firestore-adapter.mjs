import { doc,runTransaction,getDocs,getDocsFromServer,collection,query,orderBy,limit,startAfter,writeBatch } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

export function firestoreAdapter(db) {
  return {
    transact: callback => runTransaction(db,async tx=>callback({
      get:async path=>{const snap=await tx.get(doc(db,path));return snap.exists()?snap.data():null;},
      set:(path,value)=>tx.set(doc(db,path),value),
    })),
    async history(path,cursor=null,pageSize=40,folder="events",server=false) {
      const constraints=[orderBy("__name__","desc"),limit(pageSize)];if(cursor)constraints.push(startAfter(cursor));
      const snap=await (server?getDocsFromServer:getDocs)(query(collection(db,`${path}/${folder}`),...constraints));
      return {rows:snap.docs.map(d=>({id:d.id,data:d.data()})),cursor:snap.docs.at(-1)?.id??null,more:snap.size===pageSize,fromCache:snap.metadata?.fromCache??false};
    },
    async purge(path,isActive) {
      // Caller must first persist a deletion marker, then freeze editing.
      for(const folder of ["events","restored"])for(;;) {
        if(!isActive())throw new Error("Session changed.");
        const page=await getDocsFromServer(query(collection(db,`${path}/${folder}`),limit(200)));
        if(page.empty)break;
        const batch=writeBatch(db);page.docs.forEach(d=>batch.delete(d.ref));await batch.commit();
      }
      if(!isActive())throw new Error("Session changed.");
      const batch=writeBatch(db);batch.delete(doc(db,path));await batch.commit();
    },
  };
}
