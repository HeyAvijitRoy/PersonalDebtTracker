function encrypted(raw){
 if(!raw||typeof raw!=='object'||typeof raw.iv!=='string'||raw.iv.length!==16||typeof raw.data!=='string'||raw.data.length>8192||raw.data.length<24)return false;
 const keys=Object.keys(raw).sort().join(',');
 return raw.v===1&&keys==='data,iv,v'||raw.v===2&&keys==='data,iv,purging,revision,v'&&typeof raw.purging==='boolean'&&typeof raw.revision==='string';
}
// Raw authenticated ciphertext only. Keys and decrypted fields never enter this DB.
export function encryptedReadCache(){
 let database;
 const open=()=>database??=new Promise((resolve,reject)=>{const request=indexedDB.open('pdt-encrypted-read-cache',1);request.onupgradeneeded=()=>request.result.createObjectStore('snapshots',{keyPath:'namespace'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Offline snapshot unavailable.'));});
 async function act(mode,callback){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('snapshots',mode),request=callback(tx.objectStore('snapshots'));tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(new Error('Offline snapshot unavailable.'));});}
 return {
  async read(namespace){const result=await act('readonly',store=>store.get(namespace));if(!result||!Array.isArray(result.rows)||result.rows.some(row=>!encrypted(row.data)))return null;return result;},
  async write(namespace,rows,rejected=0){if(rows.length>1000||rows.some(row=>!encrypted(row.data)||!/^[A-Za-z0-9_-]{1,80}$/.test(row.id)))throw new Error('Only encrypted account records can be cached.');await act('readwrite',store=>store.put({namespace,rows,rejected,savedAt:Date.now()}));},
 };
}
