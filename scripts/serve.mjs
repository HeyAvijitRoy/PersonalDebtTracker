import http from "node:http";
import { readFile,readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export async function createRuntimeServer({port=5173,config=true}={}){
 const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
 const assets=new Set(['index.html','app.js','styles.css','sw.js','manifest.webmanifest','icon.svg',...(config?['env.js']:[]),...(await readdir(path.join(root,'src'))).filter(name=>name.endsWith('.mjs')).map(name=>'src/'+name)]);
 const server=http.createServer(async(request,response)=>{
  response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Cache-Control','no-store');
  let host;try{host=new URL('http://'+request.headers.host).hostname;}catch{response.writeHead(400);response.end('Invalid host');return;}
  if(!['127.0.0.1','localhost','[::1]'].includes(host)){response.writeHead(403);response.end('Host not allowed');return;}
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405);response.end('Method not allowed');return;}
  let pathname;try{pathname=new URL(request.url,'http://localhost').pathname;}catch{response.writeHead(400);response.end('Invalid path');return;}
  const filename=pathname==='/'?'index.html':pathname.slice(1);
  if(!assets.has(filename)){response.writeHead(404);response.end('Not found');return;}
  try{const data=await readFile(path.join(root,filename));response.setHeader('Content-Type',filename.endsWith('.html')?'text/html; charset=utf-8':filename.endsWith('.css')?'text/css':filename.endsWith('.svg')?'image/svg+xml':filename.endsWith('.webmanifest')?'application/manifest+json':'text/javascript; charset=utf-8');response.end(request.method==='HEAD'?undefined:data);}catch{response.writeHead(404);response.end('Not found');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await createRuntimeServer({port:Number(process.env.PDT_PORT??5173)});
 console.log(`Personal Debt Tracker: http://127.0.0.1:${server.address().port}/ (public app assets only)`);
}
