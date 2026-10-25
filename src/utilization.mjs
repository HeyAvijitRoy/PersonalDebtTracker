import { moneyToCents } from './money.mjs';
export function utilizationTargets(cards,targets){
 const open=cards.filter(card=>!card.deletedAt&&card.status!=='closed').map(card=>({balance:moneyToCents(card.balance),limit:moneyToCents(card.creditLimit)}));
 const balance=open.reduce((sum,row)=>sum+row.balance,0),limit=open.reduce((sum,row)=>sum+row.limit,0),incomplete=open.some(row=>row.balance>0&&row.limit===0);
 return targets.map(target=>{
  const points=moneyToCents(target);if(points>10000)throw new Error('Targets must be between 0 and 100 percent.');
  const need=(balance,limit)=>Math.max(0,balance-Number(BigInt(limit)*BigInt(points)/10000n));
  const perCard=open.filter(row=>row.limit>0).map(row=>need(row.balance,row.limit));
  return {target:points/100,count:perCard.filter(amount=>amount>0).length,paymentCents:perCard.reduce((sum,amount)=>sum+amount,0),overallCents:limit>0&&!incomplete?need(balance,limit):null};
 });
}
