import { app,auth,firestore } from "./firebase-stub.mjs";
export async function syntheticPage(browser){
 const context=await browser.newContext({serviceWorkers:"block",viewport:{width:1280,height:900}});
 const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='firestore.googleapis.com'){
   const state=await page.evaluate(()=>({enabled:globalThis.__syntheticRestMetadataEnabled,meta:[...globalThis.__syntheticDocs??[]].find(([path])=>path.endsWith('/meta/crypto'))?.[1]}));
   if(!state.enabled)return route.abort();
   if(route.request().headers().authorization!=='Bearer synthetic-token')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{status:'PERMISSION_DENIED'}})});
   const meta=state.meta;
   if(!meta)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{status:'NOT_FOUND',message:'Document not found.'}})});
   return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({fields:{v:{integerValue:String(meta.v)},salt:{stringValue:meta.salt},verifier:{mapValue:{fields:{iv:{stringValue:meta.verifier.iv},data:{stringValue:meta.verifier.data}}}}}})});
  }
  if(url.hostname==="www.gstatic.com")return route.fulfill({contentType:"text/javascript",body:url.pathname.endsWith("firebase-app.js")?app:url.pathname.endsWith("firebase-auth.js")?auth:firestore});
  if(url.hostname!=="127.0.0.1")return route.abort();
  if(url.pathname.endsWith("/env.js"))return route.fulfill({contentType:"text/javascript",body:"window.__FIREBASE_CONFIG={apiKey:'synthetic',projectId:'synthetic-project'};"});
  return route.continue();
 });
 await page.goto(process.env.PDT_TEST_URL??"http://127.0.0.1:5173/");
 return {context,page,errors};
}
