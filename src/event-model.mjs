import { readAccount,dateOnly } from "./account-model.mjs";
export function readEvent(value){
 if(!value||typeof value!=="object"||Array.isArray(value)||value.schemaVersion!==1||typeof value.id!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(value.id)||typeof value.accountId!=="string"||!/^[A-Za-z0-9_-]{1,80}$/.test(value.accountId)||typeof value.type!=="string"||!/^[a-z-]{1,40}$/.test(value.type)||typeof value.recordedAt!=="string"||!Number.isFinite(Date.parse(value.recordedAt)))throw new Error("Unrecognized history record.");
 const details=value.details??{};if(!details||typeof details!=="object"||Array.isArray(details))throw new Error("Invalid history details.");
 if(details.observation)readAccount(details.observation);
 if(value.type==='payment'){
  if(!Number.isSafeInteger(details.amountCents)||details.amountCents<=0||details.amountCents>999999999999||typeof details.paymentId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(details.paymentId)||!['scheduled','pending','posted','failed','reversed','corrected'].includes(details.status))throw new Error("Invalid payment record.");dateOnly(details.date);
 }
 return {...value,details,before:value.before?readAccount(value.before):null,after:readAccount(value.after)};
}
