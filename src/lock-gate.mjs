export function validCryptoMeta(value){
 return value?.v===1&&typeof value.salt==='string'&&value.salt.length>0&&value.salt.length<=128&&typeof value.verifier?.iv==='string'&&value.verifier.iv.length===16&&typeof value.verifier?.data==='string'&&value.verifier.data.length>=24&&value.verifier.data.length<=1024;
}
export async function deadline(work,milliseconds,message){
 let timer;
 try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds);})]);}
 finally{clearTimeout(timer);}
}
// Only a server-confirmed missing document permits initial passphrase setup.
// Existing cached salt/verifier can unlock offline; no key or passphrase is cached.
export async function loadLockMetadata({cached,server,timeoutMs=12000,cacheTimeoutMs=1500}){
 try{const value=await deadline(cached(),cacheTimeoutMs,'Cache unavailable.');if(validCryptoMeta(value))return value;}catch{}
 const value=await deadline(server(),timeoutMs,'Encryption settings did not respond. Check your connection and try again.');
 if(value===null)return null;
 if(!validCryptoMeta(value))throw new Error('Your encryption settings could not be read. No settings were changed.');
 return value;
}
