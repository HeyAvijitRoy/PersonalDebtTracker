import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAccount, readAccount, dateOnly } from "../src/account-model.mjs";
const fixtures = JSON.parse(await readFile(new URL("./fixtures/accounts.json",import.meta.url)));
const at = "2026-10-24T16:00:00.000Z";
test("legacy accounts retain their values without fabricated observations or migrations", () => {
  for (const account of fixtures.legacy) assert.deepEqual(readAccount(account),account);
});
test("new calculated accounts retain inputs, observation basis and dates", () => {
  const account = createAccount({name:"New",creditLimit:"5000",availableCredit:"3200",apr:"24.99"},{observedAt:at,effectiveDate:"2026-10-24"});
  assert.equal(account.balance,1800);
  assert.equal(account.availableCredit,3200);
  assert.equal(account.entryMethod,"availableCredit");
  assert.equal(account.balanceObservedAt,at);
  assert.equal(account.status,"unknown");
  assert.deepEqual(readAccount(account),account);
});
test("derived balances cannot silently disagree with their source", () => {
  const account = createAccount({name:"New",creditLimit:1000,availableCredit:200,apr:12});
  assert.throws(() => readAccount({...account,balance:700}));
  assert.throws(() => readAccount({...account,futureMetadata:"must not be silently dropped"}));
  assert.equal(createAccount({name:"Surplus",creditLimit:1000,availableCredit:1100,apr:12}).balance,0);
  assert.throws(() => createAccount({name:"Missing",creditLimit:1000,apr:12}));
  assert.throws(() => createAccount({name:"No limit",creditLimit:0,availableCredit:0,apr:12}));
});
test("direct entry supports over-limit balances and keeps method changes explicit", () => {
  const account = createAccount({...fixtures.legacy[2],entryMethod:"direct"});
  assert.equal(account.balance,1200);
  assert.equal(account.availableCredit,null);
  assert.equal(account.balanceObservedAt,null);
});
test("unknown versions, malformed records, unsafe values and invalid calendar dates fail closed", () => {
  const account = fixtures.legacy[0];
  for (const bad of [null,[],{}, {...account,schemaVersion:3},{...account,name:{}},{...account,balance:Infinity},{...account,apr:-1}]) assert.throws(() => readAccount(bad));
  for (const date of ["2026-02-29","2026-04-31","2026-1-01","not a date"]) assert.throws(() => dateOnly(date));
  assert.equal(dateOnly("2028-02-29"),"2028-02-29");
  assert.equal(Object.hasOwn(readAccount({...account,id:"foreign",__proto__:{archived:true}}),"id"),false);
});
