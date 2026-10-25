import { moneyToCents,aprToBasisPoints,MAX_MONEY_CENTS } from './money.mjs';
const add=(values)=>values.reduce((sum,value)=>sum+value,0);
const interest=(balance,rate)=>Number((BigInt(balance)*BigInt(rate)+60000n)/120000n);
function portfolio(cards,baseline={}){
 if(!Array.isArray(cards)||cards.length>100)throw new Error('Compare up to 100 accounts at a time.');
 const seen=new Set();
 const rows=cards.filter(card=>!card.deletedAt&&moneyToCents(card.balance)>0).map(card=>{
  if(typeof card.id!=='string'||seen.has(card.id))throw new Error('Account identifiers must be unique.');seen.add(card.id);
  if(card.rateBasis&&card.rateBasis!=='single')throw new Error(`${card.name}: a single applicable APR assumption is required. Mixed or unknown APRs cannot be compared.`);
  if(card.promotion?.type==='deferred')throw new Error(`Deferred-interest terms on ${card.name} cannot be modeled as ordinary APR. Check issuer terms before comparing this portfolio.`);
  return {id:card.id,name:String(card.name),balance:moneyToCents(card.balance),rate:aprToBasisPoints(card.apr),base:moneyToCents(baseline[card.id]??0)};
 });
 if(Object.keys(baseline).some(id=>!seen.has(id)&&moneyToCents(baseline[id])!==0))throw new Error('A baseline payment refers to an account without an outstanding balance.');
 if(add(rows.map(row=>row.balance))>MAX_MONEY_CENTS||add(rows.map(row=>row.base))>MAX_MONEY_CENTS)throw new Error('The portfolio exceeds the supported planning amount.');
 return rows;
}
function run(rows,budget,strategy,maxMonths=600){
 const initial=add(rows.map(row=>row.balance)),working=rows.map(row=>({...row,totalInterest:0,totalPaid:0}));
 const order=[...working].sort((a,b)=>strategy==='snowball'?a.balance-b.balance||b.rate-a.rate||a.id.localeCompare(b.id):b.rate-a.rate||a.balance-b.balance||a.id.localeCompare(b.id));
 const schedule=[{month:0,balanceCents:initial,interestCents:0,paidCents:0}],payoffOrder=[];
 let totalInterest=0,totalPaid=0;
 for(let month=1;month<=maxMonths&&working.some(row=>row.balance>0);month++){
  let monthlyInterest=0,remaining=budget;
  for(const row of working){const cost=interest(row.balance,row.rate);row.balance+=cost;row.totalInterest+=cost;monthlyInterest+=cost;}
  const pay=(row,amount)=>{const paid=Math.min(row.balance,amount,remaining);row.balance-=paid;row.totalPaid+=paid;remaining-=paid;};
  for(const row of working)if(row.balance>0)pay(row,row.base);
  for(const row of order)if(row.balance>0)pay(row,remaining);
  for(const row of order)if(!row.balance&&!payoffOrder.some(done=>done.id===row.id))payoffOrder.push({id:row.id,name:row.name,month,interestCents:row.totalInterest,paidCents:row.totalPaid});
  const balance=add(working.map(row=>row.balance)),paid=budget-remaining;totalInterest+=monthlyInterest;totalPaid+=paid;
  schedule.push({month,balanceCents:balance,interestCents:monthlyInterest,paidCents:paid});
  if(balance>MAX_MONEY_CENTS||!Number.isSafeInteger(totalInterest))return {paid:false,error:'Balances grow beyond the supported range. Increase the payment or change the assumptions.'};
 }
 const paid=working.every(row=>row.balance===0);
 return {paid,error:paid?null:`Not paid off within ${maxMonths} months under these assumptions.`,months:schedule.length-1,budgetCents:budget,principalCents:initial,interestCents:totalInterest,totalPaidCents:totalPaid,finalPaymentCents:schedule.at(-1).paidCents,schedule,payoffOrder};
}
export function comparePayoff(cards,{mode='budget',budget,months,baseline={}}={}){
 const rows=portfolio(cards,baseline),floor=add(rows.map(row=>row.base));
 if(!rows.length)throw new Error('There are no outstanding balances to simulate.');
 if(!['budget','deadline'].includes(mode))throw new Error('Choose monthly budget or target months.');
 if(mode==='deadline'&&(!Number.isInteger(months)||months<1||months>600))throw new Error('Choose a whole-number target from 1 to 600 months.');
 const payment=mode==='budget'?moneyToCents(budget):null;
 if(mode==='budget'&&(!payment||payment<floor))throw new Error('The combined monthly budget must be positive and cover all entered baseline payments.');
 const results={};
 for(const strategy of ['avalanche','snowball']){
  let amount=payment;
  if(mode==='deadline'){
   let low=Math.max(1,floor),high=Math.max(low,add(rows.map(row=>row.balance+interest(row.balance,row.rate))));
   if(high>MAX_MONEY_CENTS)throw new Error('The required payment exceeds the supported planning amount.');
   while(low<high){const middle=Math.floor((low+high)/2),candidate=run(rows,middle,strategy,months);if(candidate.paid)high=middle;else low=middle+1;}
   amount=low;
  }
  results[strategy]=run(rows,amount,strategy,mode==='deadline'?months:600);
 }
 return {...results,mode,targetMonths:mode==='deadline'?months:null,accounts:rows.length,hasBaseline:floor>0,interestDifferenceCents:results.avalanche.paid&&results.snowball.paid?results.snowball.interestCents-results.avalanche.interestCents:null};
}
