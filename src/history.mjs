import { decryptEvent,cardPath } from "./tracking-store.mjs";
export async function historyPage(store,id,cursors={},server=false) {
  store.active();const path=cardPath(store.namespace,id);const result=[];const next={};let more=false,fromCache=false;
  for(const folder of ["events","restored"]){
    if(cursors[folder]===false){next[folder]=false;continue;}
    const page=await store.adapter.history(path,cursors[folder]??null,40,folder,server);
    store.active();
    for(const row of page.rows){result.push(await decryptEvent(row.data,store.key,`${path}/${folder}/${row.id}`));store.active();}
    next[folder]=page.more?page.cursor:false;more ||= page.more;fromCache ||= page.fromCache;
  }
  const rows=[...new Map(result.map(event=>[event.id,event])).values()].sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt)||b.id.localeCompare(a.id));
  return {rows,cursors:next,more,fromCache};
}
export async function allHistory(store,id,{server=false}={}) {
  const rows=[];let cursors={},more=true;
  while(more){const page=await historyPage(store,id,cursors,server);if(server&&page.fromCache)throw new Error("A complete backup needs server-confirmed history.");rows.push(...page.rows);cursors=page.cursors;more=page.more;if(rows.length>10000)throw new Error("History is too large for a single export. Export a smaller scope.");}
  return [...new Map(rows.map(row=>[row.id,row])).values()];
}
export function observations(events) {
  const superseded=new Set(events.filter(e=>e.type==="correction").map(e=>e.details?.correctionOf).filter(Boolean));
  return events.filter(event=>!superseded.has(event.id)&&!["delete","restore","purge","archive","restore-history"].includes(event.type))
    .map(event=>({event,account:event.details?.observation??event.after}))
    .filter(({event,account})=>account.balanceObservedAt&&account.effectiveDate&&(event.details?.observation||event.type==='observation'||!event.before||event.before.balanceObservedAt!==account.balanceObservedAt||['balance','creditLimit','entryMethod','availableCredit'].some(field=>event.before[field]!==account[field])))
    .sort((a,b)=>a.account.effectiveDate.localeCompare(b.account.effectiveDate)||a.event.recordedAt.localeCompare(b.event.recordedAt)||a.event.id.localeCompare(b.event.id));
}
