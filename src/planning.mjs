import { readAccount } from "./account-model.mjs";
import { moneyToCents } from "./money.mjs";
import { localDate } from "./observations.mjs";
export function scenarioCost(card){
 if(card.rateBasis&&card.rateBasis!=="single"||card.entryMethod==="availableCredit"&&!card.interestScenario)return null;
 return card.balance*card.apr/1200;
}
export function interestStatus(card){
 if(card.promotion?.type==="deferred")return "Deferred interest reference: check issuer terms and promotion payoff deadline; backdated charges may apply.";
 if(card.rateBasis==="mixed"||card.rateBasis==="unknown")return "Interest timing unknown: multiple or unknown APR categories.";
 if(card.statement?.grace==="inactive"||card.statement?.priorPaid==="no")return "Interest may already be accruing; the due date is not an interest-free countdown.";
 if(card.statement?.grace==="active")return "You reported an active purchase grace period. Check the issuer's pay-to-avoid-interest amount and conditions; this app cannot confirm eligibility.";
 return "Interest timing unknown. Check issuer terms; statement dates alone do not establish when interest starts.";
}
export function paymentRecords(events){
 const records=new Map();
 for(const event of [...events].sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||a.id.localeCompare(b.id)))if(event.type==="payment"&&event.details?.paymentId)records.set(event.details.paymentId,event);
 return [...records.values()];
}
export function statementRemainder(card,events,today=localDate()){
 if(card.statement?.balance==null)return null;
 const paid=paymentRecords(events).filter(event=>event.details.statementId===card.statement.id&&event.details.status==="posted"&&event.details.date<=today).reduce((sum,event)=>sum+event.details.amountCents,0);
 return Math.max(0,moneyToCents(card.statement.balance)-paid)/100;
}
export function reminders(card,today=localDate(),warningDays=7){
 const rows=[];const statement=card.statement;
 const difference=date=>Math.round((Date.parse(date+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
 if(statement?.dueDate&&!statement.handled){const days=difference(statement.dueDate);rows.push({kind:"statement",date:statement.dueDate,days,text:days<0?"Statement due date passed; confirm issuer status.":days===0?"Statement due today; check issuer payment cutoff.":`Statement due in ${days} days.`});}
 if(card.promotion?.endDate){const days=difference(card.promotion.endDate);if(days<=warningDays)rows.push({kind:"promotion",date:card.promotion.endDate,days,text:days<0?"Entered promotion end date passed; confirm current APR with issuer.":`Promotion deadline in ${days} days; confirm issuer conditions.`});}
 return rows;
}
export function adjustedAccount(card,changeCents,now=new Date().toISOString()){
 const balance=Math.max(0,moneyToCents(card.balance)+changeCents)/100;
 if(card.entryMethod==="availableCredit"&&balance>card.creditLimit)throw new Error("The adjustment exceeds the limit. Enter the actual over-limit balance directly.");
 return readAccount({...card,balance,availableCredit:card.entryMethod==="availableCredit"?Math.round((card.creditLimit-balance)*100)/100:null,updatedAt:now,balanceObservedAt:now,effectiveDate:localDate(new Date(now)),provisional:true});
}
