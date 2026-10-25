import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRuntimeServer } from "./serve.mjs";
const server=await createRuntimeServer({port:0,config:false});await mkdir('test-results',{recursive:true});
try{
 for(const script of ['tests/browser/smoke.mjs','tests/browser/recovery.mjs']){
  const code=await new Promise(resolve=>{const child=spawn(process.execPath,[script],{stdio:'inherit',env:{...process.env,PDT_TEST_URL:`http://127.0.0.1:${server.address().port}/`}});child.on('exit',resolve);child.on('error',()=>resolve(1));});
  if(code!==0){process.exitCode=1;break;}
 }
}finally{await new Promise(resolve=>server.close(resolve));}
