import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePayoff } from '../src/payoff.mjs';
const card=(id,balance,apr)=>({id,name:id,balance,apr,rateBasis:'single'});
test('zero-interest plans preserve principal and charge only the smaller final payment',()=>{
 const result=comparePayoff([card('one',100,0)],{budget:30});
 assert.equal(result.avalanche.months,4);assert.equal(result.avalanche.finalPaymentCents,1000);
 assert.equal(result.avalanche.totalPaidCents,10000);assert.equal(result.interestDifferenceCents,0);
 const single=comparePayoff([card('one',100,12)],{budget:101}).avalanche;
 assert.equal(single.months,1);assert.equal(single.interestCents,100);assert.equal(single.totalPaidCents,10100);
});
test('same-budget strategies compare interest and payoff milestones with baseline payments',()=>{
 const result=comparePayoff([card('large',2000,30),card('small',500,5)],{budget:200,baseline:{large:25,small:25}});
 assert.ok(result.interestDifferenceCents>0);assert.equal(result.snowball.payoffOrder[0].id,'small');assert.equal(result.avalanche.payoffOrder[0].id,'large');
 for(const plan of [result.avalanche,result.snowball]){assert.equal(plan.totalPaidCents,plan.principalCents+plan.interestCents);assert.ok(plan.schedule.slice(1).every(row=>row.paidCents<=20000));}
});
test('target-month search reaches the deadline and the next lower cent does not',()=>{
 const cards=[card('large',1000,24),card('small',300,12)];
 const result=comparePayoff(cards,{mode:'deadline',months:12,baseline:{large:10,small:10}});
 for(const strategy of ['avalanche','snowball']){
  const plan=result[strategy];assert.equal(plan.paid,true);assert.ok(plan.months<=12);
  const lower=comparePayoff(cards,{budget:(plan.budgetCents-1)/100,baseline:{large:10,small:10}})[strategy];assert.ok(!lower.paid||lower.months>12);
 }
});
test('unsupported assumptions and budgets fail clearly rather than silently dropping debt',()=>{
 for(const rateBasis of ['mixed','unknown'])assert.throws(()=>comparePayoff([{...card('one',100,24),rateBasis}],{budget:50}),/single applicable/);
 assert.throws(()=>comparePayoff([{...card('one',100,24),promotion:{type:'deferred'}}],{budget:50}),/Deferred/);
 assert.throws(()=>comparePayoff([card('one',100,24)],{budget:10,baseline:{one:20}}),/baseline/);
 assert.throws(()=>comparePayoff([card('one',100,24)],{mode:'deadline',months:1.5}),/whole-number/);
 assert.equal(comparePayoff([card('one',1000,99)],{budget:1}).avalanche.paid,false);
});
test('closed and archived debt remains in the plan while deleted debt is excluded',()=>{
 const result=comparePayoff([{...card('closed',100,0),status:'closed'},{...card('archived',100,0),archived:true},{...card('deleted',100,0),deletedAt:'2026-10-25'}],{budget:50});
 assert.equal(result.accounts,2);assert.equal(result.avalanche.principalCents,20000);
});

test('monthly account payments reconcile with every aggregate and roll freed baselines forward',()=>{
 const cards=[card('large',1000,24),card('small',300,12)];
 for(const mode of [{budget:200},{mode:'deadline',months:12}])for(const plan of Object.values(comparePayoff(cards,{...mode,baseline:{large:10,small:10}})).filter(value=>value?.schedule)){
  const previous=new Map(cards.map(row=>[row.id,row.balance*100]));
  for(const month of plan.schedule.slice(1)){
   for(const row of month.accounts){
    assert.equal(row.openingCents,previous.get(row.id));
    assert.equal(row.openingCents+row.interestCents-row.paidCents,row.balanceCents);
    assert.equal(row.baselineCents+row.extraCents,row.paidCents);assert.ok(row.baselineCents<=1000);
    previous.set(row.id,row.balanceCents);
   }
   for(const key of ['interestCents','paidCents','balanceCents'])assert.equal(month.accounts.reduce((sum,row)=>sum+row[key],0),month[key]);
   assert.ok(month.paidCents<=plan.budgetCents);
  }
  assert.ok([...previous.values()].every(value=>value===0));
 }
 const rolled=comparePayoff([card('first',10,0),card('second',100,0)],{budget:50,baseline:{first:20,second:20}}).snowball;
 assert.equal(rolled.schedule[1].accounts[0].baselineCents,1000);assert.equal(rolled.schedule[1].accounts[1].paidCents,4000);
 assert.equal(rolled.schedule[2].accounts.length,1);assert.equal(rolled.finalPaymentCents,1000);
});

test('zero-baseline allocations retain outstanding accounts and interest for review',()=>{
 const plan=comparePayoff([card('high',1000,24),card('low',100,12)],{budget:100}).avalanche;
 const low=plan.schedule[1].accounts.find(row=>row.id==='low');
 assert.equal(low.paidCents,0);assert.equal(low.interestCents,100);assert.equal(low.balanceCents,10100);
});
