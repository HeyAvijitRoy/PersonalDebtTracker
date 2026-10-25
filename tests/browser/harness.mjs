import { app,auth,firestore } from "./firebase-stub.mjs";
import { restStub } from "./rest-stub.mjs";
export async function syntheticPage(browser){
 const context=await browser.newContext({serviceWorkers:"block",viewport:{width:1280,height:900}});
 const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
 const rest=restStub(page);
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='firestore.googleapis.com'){try{return await rest(route);}catch(error){if(/Execution context was destroyed|Target page, context or browser has been closed/.test(error.message))return route.abort().catch(()=>{});throw error;}}
  if(url.hostname==="www.gstatic.com")return route.fulfill({contentType:"text/javascript",body:url.pathname.endsWith("firebase-app.js")?app:url.pathname.endsWith("firebase-auth.js")?auth:firestore});
  if(url.hostname!=="127.0.0.1")return route.abort();
  if(url.pathname.endsWith("/env.js"))return route.fulfill({contentType:"text/javascript",body:"window.__FIREBASE_CONFIG={apiKey:'synthetic',projectId:'synthetic-project'};"});
  return route.continue();
 });
 await page.goto(process.env.PDT_TEST_URL??"http://127.0.0.1:5173/");
 return {context,page,errors};
}
