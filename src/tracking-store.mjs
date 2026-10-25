import { readAccount } from "./account-model.mjs";
import { sealJSON, openJSON, decryptAccount, encryptTrackingAccount } from "./account-crypto.mjs";

export const revisionOf = raw => !raw ? "absent" : raw.v===2 ? raw.revision : `legacy:${raw.iv}:${raw.data}`;
export const fieldsOf = view => Object.fromEntries(Object.entries(view).filter(([key])=>key!=="id"&&!key.startsWith("_")));
export const safeId = id => {
  if (typeof id!=="string" || !/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new TypeError("Invalid document identifier.");
  return id;
};
export const cardPath = (namespace,id) => `${namespace}/cards/${safeId(id)}`;
export async function decryptEvent(raw,key,path) {
  const event = await openJSON({v:1,iv:raw.iv,data:raw.data},key,path,32768);
  if (event.schemaVersion!==1 || event.id!==raw.revision || !event.after || typeof event.recordedAt!=="string") throw new Error("Unrecognized history event.");
  return {...event,before:event.before?readAccount(event.before):null,after:readAccount(event.after)};
}

export class TrackingStore {
  constructor({namespace,key,adapter,outbox,isActive=()=>true,onChange=()=>{}}) {
    Object.assign(this,{namespace,key,adapter,outbox,isActive,onChange});
    this.closed=false;this.queueTail=Promise.resolve();
  }
  active() { if(this.closed||!this.isActive()) throw new Error("Session changed. Unlock again."); }
  close() { this.closed=true;this.key=null; }
  async pending() {
    this.active(); const key=this.key;
    const rows=await this.outbox.list(this.namespace);
    const result=[];
    for(const row of rows) {
      const operation=await openJSON(row.envelope,key,`${this.namespace}/outbox/${row.id}`,65536);
      this.active(); result.push({...row,operation});
    }
    return result;
  }
  enqueue(view,after,type="edit",details={}) {
    const run=async()=>{
      this.active();const key=this.key;
      const id=`${Date.now().toString(36).padStart(10,"0")}-${crypto.randomUUID()}`;const accountId=safeId(view?.id??crypto.randomUUID());
      const normalized=readAccount(fieldsOf(after));
      const prior=view?.name?readAccount(fieldsOf(view)):null;
      if(prior && type==="edit" && JSON.stringify(prior)===JSON.stringify(normalized)) return null;
      const pending=await this.pending();
      const operation={id,accountId,base:view?view._revision??"legacy-missing":"absent",after:normalized,type,details,recordedAt:new Date().toISOString()};
      const envelope=await sealJSON(operation,key,`${this.namespace}/outbox/${id}`,65536);
      this.active();
      await this.outbox.put({key:`${this.namespace}/${id}`,namespace:this.namespace,id,order:Math.max(Date.now(),...pending.map(row=>row.order+1)),status:"pending",envelope});
      this.active();this.onChange();
      return {...normalized,id:accountId,_revision:id,_pending:true};
    };
    const result=this.queueTail.then(run);this.queueTail=result.catch(()=>{});return result;
  }
  async flush() {
    if(this.flushing)return this.flushing;
    const run=async()=>{
      this.active(); const key=this.key;
      const blocked=new Set();
      for(const row of await this.pending()) {
        const op=row.operation;
        if(blocked.has(op.accountId))continue;
        try {
          await this.adapter.transact(async tx=>{
            this.active();
            const path=cardPath(this.namespace,op.accountId);
            const eventPath=`${path}/events/${op.id}`;
            const [raw,eventRaw]=await Promise.all([tx.get(path),tx.get(eventPath)]);
            this.active();
            if(op.type==="restore-history"){
              if(!raw||raw.purging)throw new Error("Restore the account snapshot first.");
              const restored=op.details.event;
              safeId(restored.id);
              const restoredPath=`${path}/restored/${restored.id}`;
              const livePath=`${path}/events/${restored.id}`;
              const [existing,live]=await Promise.all([tx.get(restoredPath),tx.get(livePath)]);
              if(existing||live){const data=await decryptEvent(existing??live,key,existing?restoredPath:livePath);if(JSON.stringify(data)!==JSON.stringify(restored))throw new Error("Backup event conflicts with existing history.");return;}
              const sealed=await sealJSON(restored,key,restoredPath,32768);this.active();
              tx.set(restoredPath,{...sealed,v:2,revision:restored.id,previous:"backup"});return;
            }
            if(eventRaw) {await decryptEvent(eventRaw,key,eventPath);return;}
            if(raw?.purging)throw new Error("Permanent deletion is in progress.");
            if(revisionOf(raw)!==op.base) {const error=new Error("A newer version exists. Review your saved draft before applying it.");error.code="conflict";throw error;}
            const before=raw?await decryptAccount(raw,key,path):null;
            const event={schemaVersion:1,id:op.id,accountId:op.accountId,type:op.type,details:op.details,recordedAt:op.recordedAt,before,after:op.after};
            let linked=null;
            if(op.type==="transfer"&&op.details.other){
              const other=op.details.other;if(other.id===op.accountId)throw new Error("Choose two different accounts.");
              const otherPath=cardPath(this.namespace,other.id),otherRaw=await tx.get(otherPath);
              if(!otherRaw||otherRaw.purging||revisionOf(otherRaw)!==other.base){const error=new Error("Transfer account changed. Review the draft.");error.code="conflict";throw error;}
              const otherBefore=await decryptAccount(otherRaw,key,otherPath);
              const otherAfter=readAccount(other.after),otherEventPath=`${otherPath}/events/${op.id}`;
              const otherEvent={...event,accountId:other.id,before:otherBefore,after:otherAfter,details:{pairId:op.id,amountCents:op.details.amountCents,feeCents:op.details.feeCents,direction:"in",otherId:op.accountId,applied:op.details.applied}};
              linked={path:otherPath,snapshot:await encryptTrackingAccount(otherAfter,key,otherPath,op.id),eventPath:otherEventPath,event:{...await sealJSON(otherEvent,key,otherEventPath,32768),v:2,revision:op.id,previous:otherRaw.v===1?"legacy":otherRaw.revision}};
            }
            const [snapshot,sealed]=await Promise.all([encryptTrackingAccount(op.after,key,path,op.id),sealJSON(event,key,eventPath,32768)]);
            snapshot.purging=op.type==="purge";
            this.active();
            tx.set(path,snapshot);
            tx.set(eventPath,{...sealed,v:2,revision:op.id,previous:op.base.startsWith("legacy:")?"legacy":op.base});
            if(linked){tx.set(linked.path,linked.snapshot);tx.set(linked.eventPath,linked.event);}
          });
          await this.outbox.remove(row.key);
        } catch(error) {
          if(this.closed||!this.isActive())return;
          blocked.add(op.accountId);
          await this.outbox.put({...row,operation:undefined,status:error.code==="conflict"?"conflict":"pending",error:error.code==="conflict"?"conflict":error.code==="permission-denied"?"rules":"connection"});
        }
      }
      if(!this.closed&&this.isActive())this.onChange();
    };
    this.flushing=run().finally(()=>{this.flushing=null;});return this.flushing;
  }
  async discard(accountId) {
    this.active();
    const rows=await this.pending(),affected=new Set([accountId]);
    for(let changed=true;changed;){changed=false;for(const row of rows){const op=row.operation;if(affected.has(op.accountId)||op.details?.other&&affected.has(op.details.other.id)){for(const id of [op.accountId,op.details?.other?.id].filter(Boolean))if(!affected.has(id)){affected.add(id);changed=true;}}}}
    for(const row of rows)if(affected.has(row.operation.accountId))await this.outbox.remove(row.key);
    this.active();this.onChange();
  }
}
