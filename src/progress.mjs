import { observations } from "./history.mjs";
import { moneyToCents,balanceChange } from "./money.mjs";

const basis=account=>account.entryMethod??"direct";
export function progressData(groups,{from=null,to="9999-12-31"}={}){
 const eligible=groups.map(group=>{
  const samples=observations(group.events).filter(row=>row.account.effectiveDate<=to);
  const lastOther=samples.findLastIndex(row=>basis(row.account)!==basis(group.account));
  return {...group,samples:samples.slice(lastOther+1)};
 }).filter(group=>group.samples.length);
 const startDate=from??eligible.reduce((date,group)=>group.samples[0].account.effectiveDate>date?group.samples[0].account.effectiveDate:date,"");
 const cohort=eligible.map(group=>{
  const start=group.samples.filter(row=>row.account.effectiveDate<startDate).at(-1)??group.samples.find(row=>row.account.effectiveDate===startDate);
  const end=group.samples.at(-1);return {...group,start,end};
 }).filter(group=>group.start&&group.end);
 if(!cohort.length)return {cohort:[],points:[],milestones:[],coverage:0,total:groups.length,change:null,startDate};
 const states=new Map(cohort.map(group=>[group.id,group.start]));
 const total=()=>[...states.values()].reduce((sum,row)=>sum+moneyToCents(row.account.balance),0);
 const provisional=()=>[...states.values()].some(row=>row.account.provisional);
 const points=[{key:`${startDate}T00:00:00.000Z`,date:startDate,amountCents:total(),provisional:provisional(),description:"Starting comparable observations (latest known values)"}];
 const timeline=cohort.flatMap(group=>group.samples.filter(row=>row.account.effectiveDate>=startDate&&row.event.id!==group.start.event.id).map(row=>({...row,accountId:group.id})))
  .sort((a,b)=>a.account.effectiveDate.localeCompare(b.account.effectiveDate)||a.event.recordedAt.localeCompare(b.event.recordedAt)||a.event.id.localeCompare(b.event.id));
 for(const row of timeline){states.set(row.accountId,row);points.push({key:`${row.account.effectiveDate}T${row.event.recordedAt.slice(11)}`,date:row.account.effectiveDate,amountCents:total(),provisional:provisional(),description:`${cohort.find(group=>group.id===row.accountId).account.name}: ${row.event.type}`});}
 const changedHistory=cohort.some(group=>group.start.event.id!==group.end.event.id);
 const start=points[0].amountCents,end=points.at(-1).amountCents;
 const change=changedHistory?balanceChange(start/100,end/100):null;
 const milestones=[];
 if(start>0)for(const target of [10,25,50]){const first=points.find(point=>!point.provisional&&(start-point.amountCents)/start*100>=target);if(first)milestones.push({id:`reduction-${target}`,date:first.date,text:`Estimated balance reduced by ${target}% in this comparison`});}
 for(const group of cohort){let positive=false;for(const row of group.samples){if(row.account.balance>0)positive=true;else if(positive&&!row.account.provisional){milestones.push({id:`zero-${group.id}`,date:row.account.effectiveDate,text:`${group.account.name}: estimated balance reached $0`});break;}}}
 return {cohort,points,milestones,coverage:cohort.length,total:groups.length,change,startDate,provisional:points.at(-1).provisional};
}
