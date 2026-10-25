import { trackingDialog,element,button,money } from "./account-tools.mjs";
import { readAccount,dateOnly } from "./account-model.mjs";
import { moneyToCents } from "./money.mjs";
import { localDate } from "./observations.mjs";
import { fieldsOf } from "./tracking-store.mjs";
import { allHistory } from "./history.mjs";
import { interestStatus,statementRemainder,paymentRecords,adjustedAccount } from "./planning.mjs";

function field(root,label,type,value,choices=[]){
 const wrap=element("label",label);const input=element(type==="select"?"select":"input");input.className="tracker-input";
 if(type==="select")for(const [key,text] of choices){const option=element("option",text);option.value=key;input.append(option);}else{input.type=type;if(type==="number"){input.min="0";input.step="0.01";}}
 if(type==="checkbox"){input.checked=Boolean(value);input.className="";wrap.prepend(input);}else{input.value=String(value??"");wrap.append(input);}root.append(wrap);return input;
}
function formAction(form,label,callback){const submit=button(label,null);submit.type="submit";const error=element("p",null,"tracker-help");error.setAttribute("role","alert");form.append(submit,error);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await callback();}catch(reason){error.textContent=reason.message;}finally{submit.disabled=false;}};}
export async function showPlanning(store,card,context){
 const {dialog,body}=trackingDialog(`${card.name} - statement and promotion references`);
 body.append(element("p","Optional manual references. No minimum-payment tracking, automatic interest-start date, or bank-verified payment status.","tracker-help"));
 const form=element("form");const statement=card.statement,promo=card.promotion;
 const opening=field(form,"Statement opening date (optional)","date",statement?.openingDate),closing=field(form,"Statement closing date","date",statement?.closingDate),due=field(form,"Payment due date","date",statement?.dueDate),balance=field(form,"Statement balance ($)","number",statement?.balance);
 const avoidance=field(form,"Issuer-displayed pay-to-avoid-interest amount ($), optional","number",statement?.avoidInterestAmount);
 const grace=field(form,"Purchase grace status (user-reported)","select",statement?.grace??"unknown",[["unknown","Unknown"],["active","Reported active"],["inactive","Reported inactive"]]);
 const prior=field(form,"Prior statement paid in full by its deadline?","select",statement?.priorPaid??"unknown",[["unknown","Unknown"],["yes","Yes, user-reported"],["no","No, user-reported"]]);
 const cutoff=field(form,"Issuer cutoff and timezone, if known","text",statement?.cutoff);
 const handled=field(form,"I have handled this statement (personal reminder only)","checkbox",statement?.handled);
 const rateBasis=field(form,"Does the entered APR cover the whole tracked balance?","select",card.rateBasis??"single",[["single","One applicable APR assumption"],["mixed","Multiple APR categories"],["unknown","Unknown"]]);
 const scenario=field(form,"Include this balance in hypothetical interest-cost comparisons","checkbox",card.interestScenario??card.entryMethod!=="availableCredit");
 form.append(element("h3","Promotion reference (optional)","font-semibold"));
 const type=field(form,"Promotion type","select",promo?.type??"unknown",[["unknown","Unknown / not specified"],["zero","0% APR"],["deferred","Deferred interest"]]);
 const start=field(form,"Promotion start date","date",promo?.startDate),end=field(form,"Promotion end date","date",promo?.endDate),promoBalance=field(form,"Promotional balance reference ($)","number",promo?.balance),postApr=field(form,"Post-promotion APR reference (%)","number",promo?.postApr),note=field(form,"Promotion terms / notes (one reference; list other offers here)","text",promo?.note);
 formAction(form,"Save statement and promotion references",async()=>{
  const now=new Date().toISOString();
  const hasStatement=opening.value||closing.value||due.value||balance.value||avoidance.value;
  const newCycle=closing.value?statement?.closingDate!==closing.value:statement?.dueDate!==due.value;
  const avoidanceAmount=avoidance.value?moneyToCents(avoidance.value)/100:null;
  const avoidanceDate=avoidanceAmount==null?null:newCycle||statement?.avoidInterestAmount!==avoidanceAmount?now:statement?.avoidInterestObservedAt??now;
  const after=readAccount({...context.trackingFields(card),updatedAt:now,rateBasis:rateBasis.value,interestScenario:scenario.checked,
   statement:hasStatement?{id:!newCycle&&statement?statement.id:crypto.randomUUID(),openingDate:opening.value||null,closingDate:closing.value||null,dueDate:due.value||null,balance:balance.value||null,avoidInterestAmount:avoidanceAmount,avoidInterestObservedAt:avoidanceDate,grace:grace.value,priorPaid:prior.value,cutoff:cutoff.value,handled:handled.checked}:null,
   promotion:type.value!=='unknown'||end.value||start.value||promoBalance.value||postApr.value||note.value?{type:type.value,startDate:start.value||null,endDate:end.value||null,balance:promoBalance.value||null,postApr:postApr.value||null,note:note.value}:null,
  });await context.save(card,after,"statement");dialog.close();
 });body.append(form,element("p",interestStatus(card),"tracker-help"));
 if(statement?.avoidInterestAmount!=null)body.append(element("p",`Issuer amount recorded: ${money(statement.avoidInterestAmount)} on ${statement.avoidInterestObservedAt?.slice(0,10)??"unknown date"}. This reference is not automatically reduced after payments.`,"tracker-help"));
 body.append(button("Record a payment (optional)",()=>{dialog.close();showPayment(store,card,context);}));
 try{
  const events=await allHistory(store,card.id);store.active();if(!dialog.isConnected)return;
  const remainder=statementRemainder(card,events);if(remainder!=null)body.append(element("p",`Statement balance minus linked posted payment records: ${money(remainder)}. This is a tracking calculation, not an issuer-verified amount due.`,"tracker-help"));
  for(const record of paymentRecords(events)){
   const row=element("div",null,"tracker-history-row");row.append(element("p",`${money(record.details.amountCents/100)} | ${record.details.date} | ${record.details.status}`));
   const status=field(row,"Update recorded payment status","select",record.details.status,["scheduled","pending","posted","failed","reversed","corrected"].map(v=>[v,v]));
   row.append(button("Save record status",async()=>{try{if(status.value!=='scheduled'&&record.details.date>localDate())throw new Error('Only a scheduled record can have a future payment date.');const current=context.getCard(card.id);await context.save(current,{...context.trackingFields(current),updatedAt:new Date().toISOString()},"payment",{...record.details,status:status.value,applied:false});dialog.close();}catch(error){row.append(element("p",error.message));}}));body.append(row);
  }
 }catch{if(dialog.isConnected)body.append(element("p","Payment history unavailable; reconnect to review linked records.","tracker-help"));}
}
export function showPayment(store,card,context){
 const {dialog,body}=trackingDialog(`${card.name} - optional payment record`);const form=element("form");
 const amount=field(form,"Payment amount ($)","number",""),date=field(form,"Payment date","date",localDate()),status=field(form,"User-reported status","select","posted",["scheduled","pending","posted","failed","reversed","corrected"].map(v=>[v,v]));
 const link=field(form,"Link to the current statement, if present","checkbox",Boolean(card.statement));const note=field(form,"Note (optional)","text","");
 const apply=field(form,"Also apply a provisional balance adjustment","checkbox",false);
 form.append(element("p","Logging alone does not change your balance. After a provisional adjustment, refresh issuer values to reconcile. Later status changes do not change the balance automatically.","tracker-help"));
 formAction(form,"Save payment record",async()=>{
  const cents=moneyToCents(amount.value);if(cents<=0)throw new Error("Enter a positive amount.");dateOnly(date.value);
  if(status.value!=="scheduled"&&date.value>localDate())throw new Error("Only a scheduled payment can have a future date.");
  if(apply.checked&&status.value!=="posted")throw new Error("Only a user-reported posted payment can be applied provisionally.");
  const fields=context.trackingFields(card);const after=apply.checked?adjustedAccount(fields,-cents):{...fields,updatedAt:new Date().toISOString()};
  await context.save(card,after,"payment",{paymentId:crypto.randomUUID(),amountCents:cents,date:date.value,status:status.value,statementId:link.checked?card.statement?.id??null:null,note:note.value.slice(0,1000),applied:apply.checked});dialog.close();
 });body.append(form);
}
export function showTransfer(store,source,context){
 const {dialog,body}=trackingDialog(`${source.name} - record a transfer`);const form=element("form");
 const targets=context.cards().filter(card=>card.id!==source.id&&card.status!=="closed");
 const target=field(form,"Destination account","select",targets[0]?.id??"",targets.map(card=>[card.id,card.name]));const amount=field(form,"Principal moved ($)","number","");const fee=field(form,"Transfer fee ($)","number","0");const date=field(form,"Effective date","date",localDate());
 const apply=field(form,"Apply provisional balance changes to both accounts","checkbox",false);
 form.append(element("p","Both records commit together. Principal moved between accounts is not overall balance reduction. Fees increase the overall balance. This does not execute a bank transfer.","tracker-help"));
 formAction(form,"Record linked transfer",async()=>{
  const destination=context.getCard(target.value);if(!destination||destination.id===source.id)throw new Error("Choose another tracked account.");const cents=moneyToCents(amount.value),feeCents=moneyToCents(fee.value);if(cents<=0||cents>moneyToCents(source.balance))throw new Error("Enter a positive amount no greater than the source balance.");dateOnly(date.value);if(date.value>localDate())throw new Error("Record a transfer after its effective date.");
  const now=new Date().toISOString(),sourceFields=context.trackingFields(source),targetFields=context.trackingFields(destination);
  const from=apply.checked?adjustedAccount(sourceFields,-cents):{...sourceFields,updatedAt:now};const to=apply.checked?adjustedAccount(targetFields,cents+feeCents):{...targetFields,updatedAt:now};
  await context.save(source,from,"transfer",{amountCents:cents,feeCents,date:date.value,direction:"out",applied:apply.checked,other:{id:destination.id,base:destination._revision,after:to}});dialog.close();
 });body.append(form);
}
