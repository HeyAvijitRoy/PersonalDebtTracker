import { historyPage,allHistory } from "./history.mjs";
import { fieldsOf,safeId } from "./tracking-store.mjs";
import { validateBackup,BACKUP_FORMAT,csvCell } from "./backup.mjs";
import { createAccount } from "./account-model.mjs";

export const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
export function element(tag,text,className="") {const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;}
export function button(text,callback) {const node=element("button",text,"tracker-button");node.type="button";node.onclick=callback;return node;}
export function trackingDialog(title) {
 const dialog=element("dialog",null,"tracking-dialog");const heading=element("h2",title,"text-lg font-semibold");heading.id=`dialog-${crypto.randomUUID()}`;dialog.setAttribute("aria-labelledby",heading.id);
 const body=element("div");const close=button("Close",()=>dialog.close());dialog.append(heading,body,close);dialog.addEventListener("close",()=>dialog.remove());document.body.append(dialog);dialog.showModal();return {dialog,body};
}
export async function showHistory(store,card,onCorrect){
 const {dialog,body}=trackingDialog(`${card.name} - history`);body.textContent="Loading encrypted history...";
 let cursors={},rows=[],more=true,from="",to="";
 async function load(){
  try{const page=await historyPage(store,card.id,cursors);store.active();if(!dialog.isConnected)return;cursors=page.cursors;more=page.more;rows=[...new Map([...rows,...page.rows].map(row=>[row.id,row])).values()];render();}
  catch(error){if(dialog.isConnected)body.textContent="History unavailable. Reconnect and try again; account data was not changed.";}
 }
 function render(){
  body.replaceChildren();const filters=element("div",null,"tracker-fields");
  for(const [label,current,set] of [["From",from,v=>from=v],["Through",to,v=>to=v]]){const wrap=element("label",label);const input=element("input");input.className="tracker-input";input.type="date";input.value=current;input.onchange=()=>{set(input.value);render();};wrap.append(input);filters.append(wrap);}
  body.append(filters,element("p",`${rows.length} loaded records. Dates below reflect user observations and recorded edits. Filters apply to loaded records.`,"tracker-help"));
  const visible=rows.filter(row=>{const day=(row.details?.observation??row.after).effectiveDate??row.recordedAt.slice(0,10);return (!from||day>=from)&&(!to||day<=to);}).sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
  for(const row of visible){
   const item=element("article",null,"tracker-history-row");const observation=row.details?.observation??row.after;
   item.append(element("h3",`${row.type.replaceAll('-',' ')} - ${new Date(row.recordedAt).toLocaleString()}`,"font-semibold"));
   item.append(element("p",`Observed: ${observation.effectiveDate??"date not recorded"} | Balance ${money(observation.balance)} | Limit ${money(observation.creditLimit)} | APR ${observation.apr}%`));
   if(row.before)item.append(element("p",`Previous balance ${money(row.before.balance)}; previous APR ${row.before.apr}%; previous limit ${money(row.before.creditLimit)}.`,"tracker-help"));
   if(observation.reason)item.append(element("p",observation.reason));if(observation.note)item.append(element("p",observation.note));
   if(row.type==="payment")item.append(element("p",`Recorded payment: ${money(row.details.amountCents/100)} - ${row.details.status}. This is a user record, not bank verification.`));
   if(row.type==="correction")item.append(element("p","Corrects an earlier entry; not a new balance reduction.","tracker-help"));
   if(observation.balanceObservedAt&&!['delete','purge','restore','archive','payment','transfer'].includes(row.type))item.append(button("Correct this observation",()=>{dialog.close();onCorrect(row);}));
   body.append(item);
  }
  if(!visible.length)body.append(element("p","No records in this loaded range."));
  if(more)body.append(button("Load more history",load));
 }
 await load();
}
export async function makeBackup(store,cards){
 const accounts=[];
 if((await store.pending()).length)throw new Error("Sync or resolve local drafts before exporting a full backup.");
 for(const card of cards){store.active();accounts.push({id:card.id,account:fieldsOf(card),events:await allHistory(store,card.id,{server:true})});}
 return validateBackup({format:BACKUP_FORMAT,version:1,createdAt:new Date().toISOString(),accounts});
}
export function historyCSV(accounts){
 const rows=[["accountId","name","eventId","recordedAt","effectiveDate","type","balance","apr","creditLimit","entryMethod"]];
 for(const row of accounts)for(const event of row.events){const account=event.details?.observation??event.after;rows.push([row.id,account.name,event.id,event.recordedAt,account.effectiveDate??"",event.type,account.balance,account.apr,account.creditLimit,account.entryMethod??"direct"]);}
 return rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
}
export async function restoreBackup(store,raw,current,{replace=false}={}){
 const backup=validateBackup(raw);let restored=0,skipped=0;
 for(const row of backup.accounts){
  store.active();safeId(row.id);let view=current.find(card=>card.id===row.id);
  if(view&&!replace&&JSON.stringify(fieldsOf(view))!==JSON.stringify(row.account)){skipped++;continue;}
  const account=row.account.schemaVersion===2?row.account:createAccount({...row.account,entryMethod:"direct"});
  if(!view||replace)view=await store.enqueue(view??{id:row.id,_revision:"absent"},account,"restore-backup",{});
  // Restored events retain their IDs/dates and are deduplicated against both
  // normal and previously restored history. Each encrypted queue item is bounded.
  for(const event of row.events)await store.enqueue(view??current.find(c=>c.id===row.id),account,"restore-history",{event});
  restored++;
 }
 store.flush().catch(()=>{});return {restored,skipped};
}
