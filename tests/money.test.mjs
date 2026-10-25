import test from "node:test";
import assert from "node:assert/strict";
import { moneyToCents, centsToMoney, estimateBalance, paymentToTarget, balanceChange, aprToBasisPoints } from "../src/money.mjs";

test("money parsing preserves cents and rejects blanks, partial numbers and ambiguous formats", () => {
  for (const [value, expected] of [["0",0],[".01",1],["1234.56",123456],[0.1+0.2,30]]) assert.equal(moneyToCents(value), expected);
  for (const value of [null, undefined, "", " ", "1,234.56", "1e3", "12junk", "0x10", true, Infinity, NaN, -1, "-1", 0.005, "1.234", 1e20]) assert.throws(() => moneyToCents(value));
  assert.equal(moneyToCents("-12.34",{signed:true}),-1234);
  assert.equal(centsToMoney(123456),1234.56);
  assert.throws(() => aprToBasisPoints(100));
});
test("available-credit estimates, zero limits, excess availability and paired limit changes", () => {
  assert.deepEqual(estimateBalance("5000","3200"), {balanceCents:180000,availableExceedsLimit:false,atCapacity:false,utilization:36});
  assert.equal(estimateBalance(0,0).utilization,null);
  assert.equal(estimateBalance(100,200).balanceCents,0);
  assert.equal(estimateBalance(100,200).availableExceedsLimit,true);
  assert.equal(estimateBalance(100,0).atCapacity,true);
  assert.equal(estimateBalance(5000,3200).balanceCents,estimateBalance(6000,4200).balanceCents);
  assert.throws(() => estimateBalance(5000,""));
});
test("target payments are cent-accurate at and strictly below targets", () => {
  assert.equal(paymentToTarget(800,1000,80),0);
  assert.equal(paymentToTarget(800,1000,80,{below:true}),1);
  assert.equal(paymentToTarget(1200,1000,80),40000);
  assert.equal(paymentToTarget(100,333.33,30),1);
  assert.equal(paymentToTarget(100,0,30),null);
  assert.equal(paymentToTarget(0,100,30),0);
  assert.equal(paymentToTarget(100,100,100),0);
  assert.equal(paymentToTarget(100,100,0,{below:true}),null);
  assert.equal(paymentToTarget("9999999999.99","9999999999.99",80),200000000000);
});
test("progress measures endpoint changes, not cumulative payments or only decreases", () => {
  assert.equal(balanceChange(1000,900).changeCents,-10000);
  assert.equal(balanceChange(1000,900).direction,"reduction");
  assert.equal(balanceChange(700,900).direction,"increase");
  assert.equal(balanceChange(900,900).direction,"unchanged");
  assert.equal(balanceChange(0,100).percentage,null);
  assert.equal(balanceChange(null,100),null);
  assert.equal(balanceChange(1000,700).percentage,-30);
});
