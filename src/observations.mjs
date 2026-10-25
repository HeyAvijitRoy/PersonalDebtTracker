import { createAccount,dateOnly } from "./account-model.mjs";
import { fieldsOf } from "./tracking-store.mjs";

export function localDate(now=new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}
export function makeObservation(prior,input,now=new Date().toISOString()) {
  const previous=prior?fieldsOf(prior):null;
  const date=dateOnly(input.effectiveDate??localDate(new Date(now)));
  if(date>localDate(new Date(now)))throw new Error("An observation cannot be dated in the future.");
  const method=input.entryMethod??previous?.entryMethod??"availableCredit";
  const base=previous?.schemaVersion===2?previous:{};
  const candidate=createAccount({...base,
    name:input.name,apr:input.apr,creditLimit:input.creditLimit,
    entryMethod:method,availableCredit:input.availableCredit,balance:input.balance,
    reason:input.reason??base.reason??"",note:input.note??base.note??"",
    provisional:false,
  },{observedAt:now,effectiveDate:date});
  const changed=!previous || ["balance","creditLimit","entryMethod","availableCredit"].some(field=>{
    const old=field==="entryMethod"?previous[field]??"direct":field==="availableCredit"?previous[field]??null:previous[field];
    return old!==candidate[field];
  });
  const observed=changed||input.confirmObservation===true;
  if(previous&&!observed){candidate.balanceObservedAt=previous.balanceObservedAt??null;candidate.effectiveDate=previous.effectiveDate??null;candidate.provisional=previous.provisional??false;}
  // A backdated observation belongs in history; never replace newer current data.
  const historical=Boolean(previous?.effectiveDate && observed && date<previous.effectiveDate);
  return {account:historical?{...previous,updatedAt:now}:candidate,observation:candidate,historical,observed};
}
