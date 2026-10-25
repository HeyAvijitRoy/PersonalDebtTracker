import { app,auth,firestore } from "./firebase-stub.mjs";
export async function syntheticPage(browser){
 const context=await browser.newContext({serviceWorkers:"block",viewport:{width:1280,height:900}});
 const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="www.gstatic.com")return route.fulfill({contentType:"text/javascript",body:url.pathname.endsWith("firebase-app.js")?app:url.pathname.endsWith("firebase-auth.js")?auth:firestore});
  if(url.hostname!=="127.0.0.1")return route.abort();
  if(url.pathname.endsWith("/env.js"))return route.fulfill({contentType:"text/javascript",body:"window.__FIREBASE_CONFIG={apiKey:'synthetic',projectId:'synthetic-project'};"});
  return route.continue();
 });
 await page.goto(process.env.PDT_TEST_URL??"http://127.0.0.1:5173/");
 return {context,page,errors};
}
