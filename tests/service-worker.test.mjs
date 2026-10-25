import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
const source=await readFile(new URL("../sw.js",import.meta.url),"utf8");
test("service worker caches only public runtime assets, including offline modules", async () => {
  const handlers={};
  const writes=[];
  const scope={
    URL,
    self:{location:{origin:"https://example.com"},registration:{scope:"https://example.com/tracker/"},addEventListener:(name,fn)=>{handlers[name]=fn;}},
    caches:{open:async()=>({put:(request)=>writes.push(request.url)})},
    fetch:async()=>({ok:true,clone:()=>({})})
  };
  vm.runInNewContext(source,scope);
  async function request(url,method="GET") {
    let response;
    handlers.fetch({request:{url,method},respondWith:promise=>{response=promise;}});
    if(response) await response;
    return Boolean(response);
  }
  for(const path of ["index.html","styles.css","src/account-crypto.mjs","src/money.mjs","src/account-model.mjs","src/session-scope.mjs"]) assert.equal(await request("https://example.com/tracker/"+path),true);
  for(const path of ["env.js","creds/private.json","backup.json","tests/money.test.mjs","api/history"]) assert.equal(await request("https://example.com/tracker/"+path),false);
  assert.equal(await request("https://example.com.evil/tracker/index.html"),false);
  assert.equal(await request("https://example.com/tracker/index.html","POST"),false);
  assert.equal(writes.length,6);
});
