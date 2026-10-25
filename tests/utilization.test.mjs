import test from 'node:test';
import assert from 'node:assert/strict';
import { utilizationTargets } from '../src/utilization.mjs';
test('every custom target has distinct overall and per-card payment amounts',()=>{
 const cards=[{balance:900,creditLimit:1000},{balance:0,creditLimit:1000}];
 const rows=utilizationTargets(cards,[80,50,30,10]);assert.deepEqual(rows.map(row=>row.target),[80,50,30,10]);
 assert.equal(rows[2].overallCents,30000);assert.equal(rows[2].paymentCents,60000);assert.equal(rows[2].count,1);assert.equal(rows[3].overallCents,70000);
});
test('closed debt is excluded, archived open credit stays included and incomplete limits remain unknown',()=>{
 assert.equal(utilizationTargets([{balance:900,creditLimit:1000,archived:true},{balance:500,creditLimit:1000,status:'closed'}],[30])[0].overallCents,60000);
 assert.equal(utilizationTargets([{balance:100,creditLimit:0}],[30])[0].overallCents,null);
 assert.equal(utilizationTargets([{balance:0,creditLimit:1000}],[0])[0].overallCents,0);
 assert.equal(utilizationTargets([{balance:.01,creditLimit:.03}],[30])[0].overallCents,1);
});
