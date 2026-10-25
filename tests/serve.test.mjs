import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createRuntimeServer } from "../scripts/serve.mjs";
test("local server exposes only runtime assets and rejects private paths and rebinding hosts",async()=>{
 const server=await createRuntimeServer({port:0,config:false});const url=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(url+'/')).status,200);
  const module=await fetch(url+'/src/money.mjs');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);
  for(const file of ['env.js','creds/private.json','.git/config','package.json','tests/browser/firebase-stub.mjs'])assert.equal((await fetch(url+'/'+file)).status,404,file);
  const status=await new Promise((resolve,reject)=>{http.get(url+'/',{headers:{Host:'attacker.example'}},response=>{response.resume();resolve(response.statusCode);}).on('error',reject);});assert.equal(status,403);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
