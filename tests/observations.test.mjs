import test from "node:test";
import assert from "node:assert/strict";
import { makeObservation } from "../src/observations.mjs";
const now="2026-10-24T16:00:00.000Z";
const input={name:"Card",entryMethod:"availableCredit",creditLimit:5000,availableCredit:3200,apr:12,effectiveDate:"2026-10-24"};
test("default observation calculates balances without a fixed balance field",()=>{
 const result=makeObservation(null,input,now);assert.equal(result.account.balance,1800);assert.equal(result.observed,true);
});
test("APR-only edits do not make the balance appear freshly observed",()=>{
 const prior=makeObservation(null,{...input,effectiveDate:"2026-10-20"},"2026-10-20T16:00:00.000Z").account;
 const result=makeObservation(prior,{...input,apr:24},now);
 assert.equal(result.account.balanceObservedAt,prior.balanceObservedAt);assert.equal(result.account.effectiveDate,"2026-10-20");
 const refreshed=makeObservation(prior,{...input,confirmObservation:true},now);assert.equal(refreshed.account.effectiveDate,"2026-10-24");
});
test("backdated observations preserve current values and future dates are rejected",()=>{
 const prior=makeObservation(null,input,now).account;
 const result=makeObservation(prior,{...input,availableCredit:3000,effectiveDate:"2026-10-01"},now);
 assert.equal(result.historical,true);assert.equal(result.account.balance,1800);assert.equal(result.observation.balance,2000);
 assert.throws(()=>makeObservation(prior,{...input,effectiveDate:"2026-10-25"},now));
});
