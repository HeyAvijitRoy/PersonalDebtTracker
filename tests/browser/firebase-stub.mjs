// Synthetic in-browser backend for UI tests only. Never shipped in Pages assets.
export const app = `export const initializeApp=config=>({config});`;
export const auth = `
let callback;const user={uid:'synthetic-owner',displayName:'Synthetic User'};
export const getAuth=()=>({});
export const onAuthStateChanged=(_auth,fn)=>{callback=fn;queueMicrotask(()=>fn(user));};
export class GoogleAuthProvider {setCustomParameters(){}}
export const signInWithPopup=async()=>{callback(user);};
export const signInWithRedirect=signInWithPopup;
export const getRedirectResult=async()=>null;
export const signOut=async()=>callback(null);
`;
export const firestore = `
const docs=globalThis.__syntheticDocs=new Map();const listeners=[];
const ref=(path)=>({path});
export const getFirestore=()=>({});
export const enableIndexedDbPersistence=async()=>{};
export const collection=(_db,...parts)=>ref(parts.join('/'));
export const doc=(db,...parts)=>ref(parts.length?parts.join('/'):db.path+'/'+crypto.randomUUID());
const snapshot=(path)=>({id:path.split('/').at(-1),ref:ref(path),exists:()=>docs.has(path),data:()=>structuredClone(docs.get(path))});
function emit(){for(const listener of listeners){if(listener.active)queueMicrotask(()=>listener.fn({docs:[...docs.keys()].filter(path=>path.startsWith(listener.path+'/')&&path.split('/').length===listener.path.split('/').length+1).map(snapshot),metadata:{fromCache:false}}));}}
export const getDoc=async reference=>snapshot(reference.path);
export const setDoc=async(reference,value)=>{docs.set(reference.path,structuredClone(value));emit();};
export const deleteDoc=async reference=>{docs.delete(reference.path);emit();};
export const onSnapshot=(reference,fn)=>{const entry={path:reference.path,fn,active:true};listeners.push(entry);emit();return()=>entry.active=false;};
export const runTransaction=async(_db,fn)=>{
 if(globalThis.__syntheticOffline){const error=new Error('Offline');error.code='unavailable';throw error;}
 const writes=[];const result=await fn({get:async reference=>snapshot(reference.path),set:(reference,value)=>writes.push([reference.path,value])});
 writes.forEach(([path,value])=>docs.set(path,structuredClone(value)));emit();return result;
};
export const orderBy=(field,direction)=>({kind:'order',field,direction});export const limit=count=>({kind:'limit',count});export const startAfter=id=>({kind:'after',id});
export const query=(reference,...constraints)=>({...reference,constraints});
export const getDocs=async reference=>{
 let paths=[...docs.keys()].filter(path=>path.startsWith(reference.path+'/')&&path.split('/').length===reference.path.split('/').length+1).sort();
 for(const c of reference.constraints??[]){if(c.kind==='order'&&c.direction==='desc')paths.reverse();if(c.kind==='after')paths=paths.filter(p=>p.split('/').at(-1)<c.id);if(c.kind==='limit')paths=paths.slice(0,c.count);}
 return {docs:paths.map(snapshot),size:paths.length,empty:paths.length===0};
};
export const getDocsFromServer=getDocs;
export const writeBatch=()=>{const operations=[];return {delete:reference=>operations.push(()=>docs.delete(reference.path)),set:(reference,value)=>operations.push(()=>docs.set(reference.path,value)),commit:async()=>{operations.forEach(fn=>fn());emit();}};};
`;
