import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePayoff } from '../src/payoff.mjs';
import { paymentMonth,paymentScheduleCSV } from '../src/payoff-schedule.mjs';

test('payment month labels advance from the comparison month without month-end rollover',()=>{
 assert.equal(paymentMonth(new Date(2026,0,31),1),'February 2026');
 assert.equal(paymentMonth(new Date(2026,11,31),2),'February 2027');
});

test('CSV exports reconciled monthly totals and protects spreadsheet formulas and quoted names',()=>{
 const plan=comparePayoff([{id:'a',name:'=HYPERLINK("bad")',balance:100,apr:0},{id:'b',name:'Other, "card"\nline',balance:20,apr:0}],{budget:50}).avalanche;
 const csv=paymentScheduleCSV(plan,'Debt Avalanche',new Date(2026,11,31));
 assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
 assert.ok(csv.includes('"Other, ""card""\nline"'));
 assert.ok(csv.includes('"January 2027"'));
 assert.ok(csv.includes('"MONTH TOTAL","120.00","0.00","0.00","50.00","50.00","70.00"'));
 assert.ok(csv.includes('"MONTH TOTAL","20.00","0.00","0.00","20.00","20.00","0.00"'));
 const unpaid=comparePayoff([{id:'a',name:'High',balance:1000,apr:24},{id:'b',name:'Low',balance:100,apr:12}],{budget:100}).avalanche;
 assert.ok(paymentScheduleCSV(unpaid,'Debt Avalanche',new Date(2026,11,31)).includes('$0 allocation: review issuer-required payment'));
 assert.ok(csv.includes('calendar labels are not due dates'));
});
