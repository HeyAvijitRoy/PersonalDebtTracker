import { deadline,validCryptoMeta } from './lock-gate.mjs';

export async function fallbackAfter(primary,fallback,delayMs=1500){
 let timer;
 try{return await Promise.race([primary,new Promise((resolve,reject)=>{timer=setTimeout(()=>Promise.resolve().then(fallback).then(resolve,reject),delayMs);})]);}
 finally{clearTimeout(timer);}
}

// Firebase ID tokens are carried only in the HTTPS Authorization header, never
// in URLs, logs, storage, or the local server. The normal Firestore rules apply.
export async function fetchCryptoMetadata({projectId,uid,user,fetcher=fetch,timeoutMs=8000}){
 if(!user||user.uid!==uid)throw new Error('Your sign-in session changed. Sign out and sign in again.');
 let token;
 try{token=await deadline(user.getIdToken(),timeoutMs,'Sign-in could not be refreshed. Sign out and sign in again.');}
 catch{throw new Error('Sign-in could not be refreshed. Sign out and sign in again.');}
 if(!token)throw new Error('Sign out and sign in again to load your encryption settings.');
 const resource=`projects/${encodeURIComponent(projectId)}/databases/(default)/documents/artifacts/${encodeURIComponent(projectId)}/users/${encodeURIComponent(uid)}/meta/crypto`;
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetcher(`https://firestore.googleapis.com/v1/${resource}`,{method:'GET',headers:{Authorization:`Bearer ${token}`},cache:'no-store',credentials:'omit',signal:controller.signal});
  const result=await response.json();
  if(response.status===404&&result.error?.status==='NOT_FOUND'&&result.error?.message?.includes('Document'))return null;
  if(response.status===401)throw new Error('Your sign-in session expired. Sign out and sign in again.');
  if(response.status===403){const error=new Error('Firestore denied access to your encryption settings. Check the deployed owner-access rules.');error.code='permission-denied';throw error;}
  if(!response.ok)throw new Error('Firestore could not load encryption settings. Retry after checking your connection and project configuration.');
  const fields=result.fields,verifier=fields?.verifier?.mapValue?.fields;
  const metadata={v:Number(fields?.v?.integerValue),salt:fields?.salt?.stringValue,verifier:{iv:verifier?.iv?.stringValue,data:verifier?.data?.stringValue}};
  if(!validCryptoMeta(metadata))throw new Error('Encryption settings were returned in an unsupported format. Nothing was changed.');
  return metadata;
 }catch(error){if(error.name==='AbortError')throw new Error('The direct Firestore request timed out. Check network access to firestore.googleapis.com.');if(error instanceof TypeError)throw new Error('Your browser could not reach firestore.googleapis.com. Check network/filter settings and retry.');throw error;}
 finally{clearTimeout(timer);}
}

// Only the non-secret salt and encrypted verifier are cached. No passphrase,
// derived key, auth token, account names, or balances are stored here.
export function metadataCache(storage,namespace){
 const key=`pdt-lock-metadata:${namespace}`;
 return {
  read(){try{const value=JSON.parse(storage.getItem(key));return validCryptoMeta(value)?value:null;}catch{return null;}},
  write(value){if(validCryptoMeta(value))try{storage.setItem(key,JSON.stringify({v:1,salt:value.salt,verifier:{iv:value.verifier.iv,data:value.verifier.data}}));}catch{}},
 };
}
