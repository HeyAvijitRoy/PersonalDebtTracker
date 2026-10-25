import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as firestore from "firebase/firestore";
import * as auth from "firebase/auth";
test("the pinned browser SDK and tested SDK match and export required APIs",async()=>{
 const pkg=JSON.parse(await readFile('package.json','utf8'));
 const app=await readFile('app.js','utf8'),adapter=await readFile('src/firestore-adapter.mjs','utf8');
 for(const source of [app,adapter])for(const match of source.matchAll(/firebasejs\/([^/]+)\//g))assert.equal(match[1],pkg.devDependencies.firebase);
 for(const name of ['getFirestore','enableIndexedDbPersistence','runTransaction','getDocsFromServer','writeBatch','startAfter'])assert.equal(typeof firestore[name],'function',name);
 assert.equal(typeof auth.onAuthStateChanged,'function');
});
