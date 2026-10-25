import { csvCell } from './backup.mjs';

export function paymentMonth(anchor,month){
 const date=new Date(anchor.getFullYear(),anchor.getMonth()+month,1);
 return date.toLocaleDateString('en-US',{month:'long',year:'numeric'});
}

export function paymentScheduleCSV(plan,strategy,anchor){
 const assumptions='Projection only: fixed entered APR; monthly interest before end-of-month payments; no new purchases or fees; calendar labels are not due dates. Baselines are user assumptions, not calculated issuer minimums. Review every issuer-required payment.';
 const rows=[['Strategy','Month','Calendar month','Account','Opening balance ($)','Estimated interest ($)','Planned baseline ($)','Priority allocation ($)','Planned payment ($)','Estimated remaining balance ($)','Review','Assumptions']];
 for(const month of plan.schedule.slice(1)){
  const accounts=month.accounts;
  const row=(account,note)=>[strategy,month.month,paymentMonth(anchor,month.month),account.name,...['openingCents','interestCents','baselineCents','extraCents','paidCents','balanceCents'].map(key=>(account[key]/100).toFixed(2)),note,assumptions];
  for(const account of accounts)rows.push(row(account,account.paidCents===0?'$0 allocation: review issuer-required payment':''));
  const total={name:'MONTH TOTAL'};for(const key of ['openingCents','interestCents','baselineCents','extraCents','paidCents','balanceCents'])total[key]=accounts.reduce((sum,account)=>sum+account[key],0);
  rows.push(row(total,''));
 }
 return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
