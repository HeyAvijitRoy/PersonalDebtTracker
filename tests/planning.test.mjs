import test from "node:test";
import assert from "node:assert/strict";
import { createAccount,readAccount } from "../src/account-model.mjs";
import { scenarioCost,interestStatus,statementRemainder,reminders,adjustedAccount } from "../src/planning.mjs";
const account=createAccount({name:"A",creditLimit:1000,availableCredit:200,apr:12});
test("available-credit interest scenarios require opt-in and unknown/mixed rates are unavailable",()=>{
 assert.equal(scenarioCost(account),null);assert.equal(scenarioCost({...account,interestScenario:true}),8);
 assert.equal(scenarioCost({...account,interestScenario:true,rateBasis:"mixed"}),null);
 assert.equal(scenarioCost({...account,interestScenario:true,apr:0}),0);
});
test("deadlines and interest guidance never infer an exact interest-start date",()=>{
 const card=readAccount({...account,statement:{id:"cycle",closingDate:"2026-10-01",dueDate:"2026-10-24",balance:800,grace:"inactive"}});
 assert.ok(interestStatus(card).includes("already"));assert.ok(reminders(card,"2026-10-25")[0].text.includes("confirm issuer status"));
 assert.throws(()=>readAccount({...card,statement:{...card.statement,dueDate:"2026-09-01"}}));
 assert.equal(Object.hasOwn(card.statement,"minimumPayment"),false);
});
test("statement tracking uses latest linked payment status, not balance changes or scheduled payments",()=>{
 const card=readAccount({...account,statement:{id:"cycle",balance:800}});
 const row=(id,status,date)=>({id,recordedAt:date,type:"payment",details:{paymentId:"payment",statementId:"cycle",amountCents:20000,status,date:'2026-10-20'}});
 assert.equal(statementRemainder(card,[row('a','posted','2026-10-20')]),600);
 assert.equal(statementRemainder(card,[row('a','posted','2026-10-20'),row('b','reversed','2026-10-21')]),800);
 assert.equal(statementRemainder(card,[row('a','scheduled','2026-10-20')]),800);
 assert.equal(adjustedAccount(account,-20000).balance,600);assert.equal(adjustedAccount(account,-20000).provisional,true);
});
