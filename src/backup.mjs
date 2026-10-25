import { readAccount } from "./account-model.mjs";
import { safeId } from "./tracking-store.mjs";
export const BACKUP_FORMAT="personal-debt-tracker";
export function validateBackup(raw){
 if(!raw||raw.format!==BACKUP_FORMAT||raw.version!==1||!Array.isArray(raw.accounts)||raw.accounts.length>1000)throw new Error("Unsupported backup format.");
 const ids=new Set();let count=0;
 const accounts=raw.accounts.map(row=>{
  safeId(row.id);if(ids.has(row.id))throw new Error("Duplicate account ID in backup.");ids.add(row.id);
  if(!Array.isArray(row.events))throw new Error("Backup history is missing.");
  const seen=new Set();const events=row.events.map(event=>{
   safeId(event.id);if(seen.has(event.id)||event.schemaVersion!==1||event.accountId!==row.id||typeof event.recordedAt!=="string"||!Number.isFinite(Date.parse(event.recordedAt)))throw new Error("Invalid backup history.");seen.add(event.id);
   if(++count>10000||JSON.stringify(event).length>20000)throw new Error("Backup history exceeds the import limit.");
   const details=event.details??{};if(details.observation)readAccount(details.observation);
   return {...event,before:event.before?readAccount(event.before):null,after:readAccount(event.after)};
  });
  return {id:row.id,account:readAccount(row.account),events};
 });
 return {format:BACKUP_FORMAT,version:1,createdAt:raw.createdAt,accounts};
}
export function csvCell(value){const text=String(value??"");const protectedText=/^[\s]*[=+\-@]/.test(text)?"'"+text:text;return '"'+protectedText.replaceAll('"','""')+'"';}
