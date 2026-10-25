import test from "node:test";
import assert from "node:assert/strict";
import { progressData } from "../src/progress.mjs";
import { createAccount } from "../src/account-model.mjs";
function group(id,balances,dates=['2026-10-01','2026-10-02','2026-10-03']){
 const events=balances.map((balance,index)=>{const account=createAccount({name:id,creditLimit:2000,availableCredit:2000-balance,apr:12},{observedAt:`${dates[index]}T12:00:00.000Z`,effectiveDate:dates[index]});return {id:`event-${id}-${index}`,accountId:id,type:'observation',recordedAt:`${dates[index]}T12:00:00.000Z`,before:index?{balanceObservedAt:`${dates[index-1]}T12:00:00.000Z`}:null,after:account,details:{}};});return {id,account:events.at(-1).after,events};
}
test("progress compares endpoints instead of adding decreases",()=>{const data=progressData([group('a',[1000,700,900])]);assert.equal(data.change.changeCents,-10000);assert.equal(data.points.at(-1).amountCents,90000);assert.equal(data.milestones.filter(m=>m.id==='reduction-25').length,1);});
test("same-day observations and single observations have meaningful distinct states",()=>{const data=progressData([group('a',[1000,800],['2026-10-01','2026-10-01'])]);assert.equal(data.change.changeCents,-20000);assert.equal(progressData([group('a',[1000])]).change,null);});
test("missing history and a zero baseline are not fabricated as zero-percent progress",()=>{assert.equal(progressData([{id:'a',account:{},events:[]}]).points.length,0);assert.equal(progressData([group('a',[0,100])]).change.percentage,null);});
test("adding an existing account changes the comparable window, not new spending",()=>{const data=progressData([group('a',[1000,900]),group('b',[500,400],['2026-10-02','2026-10-03'])]);assert.equal(data.startDate,'2026-10-02');assert.equal(data.points[0].amountCents,150000);assert.equal(data.points.at(-1).amountCents,130000);});
test("custom periods exclude accounts with no starting observation",()=>{const data=progressData([group('a',[1000,900]),group('b',[500],['2026-10-03'])],{from:'2026-10-01',to:'2026-10-04'});assert.equal(data.coverage,1);assert.equal(data.total,2);});
