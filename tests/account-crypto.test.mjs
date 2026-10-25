import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encryptAccount, decryptAccount } from "../src/account-crypto.mjs";
import { createAccount } from "../src/account-model.mjs";
const fixtures = JSON.parse(await readFile(new URL("./fixtures/accounts.json",import.meta.url)));
const key = await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
const wrongKey = await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
test("legacy and versioned records round-trip entirely inside encrypted envelopes", async () => {
  const newer = createAccount({name:"Private <name>",creditLimit:5000,availableCredit:3200,apr:12,note:"Private note"},{observedAt:"2026-10-24T16:00:00.000Z"});
  for (const account of [...fixtures.legacy,newer]) {
    const encrypted = await encryptAccount(account,key);
    assert.deepEqual(Object.keys(encrypted).sort(),["data","iv","v"]);
    assert.equal(JSON.stringify(encrypted).includes(account.name),false);
    assert.deepEqual(await decryptAccount(encrypted,key),account);
  }
});
test("existing AES-GCM envelopes remain readable without changing keys or ciphertext", async () => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(JSON.stringify(fixtures.legacy[0])));
  const raw = {v:1,iv:Buffer.from(iv).toString("base64"),data:Buffer.from(data).toString("base64")};
  assert.deepEqual(await decryptAccount(raw,key),fixtures.legacy[0]);
});
test("wrong keys, ciphertext changes, plaintext docs, extra envelope fields and oversized data are rejected", async () => {
  const raw = await encryptAccount(fixtures.legacy[0],key);
  await assert.rejects(decryptAccount(raw,wrongKey));
  const tampered = Buffer.from(raw.data,"base64"); tampered[0] ^= 1;
  await assert.rejects(decryptAccount({...raw,data:tampered.toString("base64")},key));
  for (const bad of [fixtures.legacy[0],{...raw,balance:0},{...raw,v:2},{...raw,iv:"bad"},{...raw,data:"A".repeat(8196)}]) await assert.rejects(decryptAccount(bad,key));
  await assert.rejects(encryptAccount(fixtures.legacy[0],null));
  await assert.rejects(decryptAccount(raw,null));
});
test("encrypting identical data uses distinct random IVs", async () => {
  const a = await encryptAccount(fixtures.legacy[0],key);
  const b = await encryptAccount(fixtures.legacy[0],key);
  assert.notEqual(a.iv,b.iv); assert.notEqual(a.data,b.data);
});
