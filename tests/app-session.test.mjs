import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { SessionScope } from "../src/session-scope.mjs";
import { revisionOf,safeId } from "../src/tracking-store.mjs";

const source = await readFile(new URL("../app.js",import.meta.url),"utf8");
const listenerSource = source.slice(source.indexOf("function setupFirestoreListener("),source.indexOf("// ====== HELPERS ======"));
function harness() {
  let next, fail;
  const pending = [];
  const renders = [];
  const state = {
    sessionScope:new SessionScope(),userId:"owner",cryptoKey:{},tracking:null,cloudCards:[],revisionOf,safeId,
    accountReader:{},stopAccountReads:null,refreshAccounts:null,readCache:{write:async()=>{}},document:{getElementById:()=>null},setTimeout:()=>0,setInterval:()=>0,clearTimeout:()=>{},clearInterval:()=>{},unsubscribe:null,db:{},appId:"project",editingId:null,firstSnapshotReceived:true,
    window:{__latestCards:[]},
    collection:()=>({}),
    onSnapshot:(_collection,options,callback,error)=>{next=callback;fail=error;return ()=>{};},
    decryptAccount:()=>new Promise(resolve=>pending.push(resolve)),
    renderAll:cards=>renders.push(cards),
    console:{error:()=>{}},showModal:()=>{throw new Error("Stale session displayed an error.");},
    appLoading:{classList:{add:()=>{}}},mainApp:{classList:{remove:()=>{}}}
  };
  vm.createContext(state);
  vm.runInContext(listenerSource,state);
  state.setupFirestoreListener("owner");
  return {state,pending,renders,next:(id)=>next({docs:[{id,data:()=>({})}]}),fail:()=>fail(new Error("permission-denied"))};
}
test("real Firestore callback cannot repopulate decrypted data after sign-out", async () => {
  const h=harness();
  const completion=h.next("old");
  h.state.sessionScope.invalidate();h.state.userId=null;h.state.cryptoKey=null;
  h.pending[0]({name:"Private account"});
  await completion;
  assert.equal(h.renders.length,0);
  assert.equal(h.state.window.__latestCards.length,0);
  h.fail();
});
test("real Firestore callback rejects an older snapshot that finishes after a newer one", async () => {
  const h=harness();
  const older=h.next("old");
  const newer=h.next("new");
  h.pending[1]({name:"Current"});await newer;
  h.pending[0]({name:"Outdated"});await older;
  assert.equal(h.renders.length,1);
  assert.equal(h.state.window.__latestCards[0].id,"new");
});
