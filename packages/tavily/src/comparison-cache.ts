import {createHash} from 'node:crypto';
import {EvidenceComparisonReport} from '../../contracts/src/index';
import type {z} from 'zod';

type Report=z.infer<typeof EvidenceComparisonReport>;
type Entry={at:number;expiresAt:number;report:Report};

// Owned by one app instance. No keys, disk persistence or global cache sharing.
export class ComparisonCache {
 private entries=new Map<string,Entry>();
 private pending=new Map<string,Promise<Entry>>();
 private identities=new WeakMap<object,number>();
 private nextIdentity=0;
 constructor(private clock:()=>number=Date.now){}

 async compare(identity:object,context:unknown,load:()=>Promise<Report>):Promise<Report>{
  let namespace=this.identities.get(identity);
  if(namespace===undefined){namespace=++this.nextIdentity;this.identities.set(identity,namespace);}
  const key=createHash('sha256').update(JSON.stringify(['comparison-policy-v11',namespace,context])).digest('hex');
  const now=this.clock();
  for(const [id,entry] of this.entries)if(now<entry.at||now>=entry.expiresAt)this.entries.delete(id);
  const decorate=(entry:Entry,status:'hit'|'miss'|'shared')=>EvidenceComparisonReport.parse({...structuredClone(entry.report),cache:{status,expiresAt:entry.report.method==='llm'?new Date(entry.expiresAt).toISOString():null}});
  const saved=this.entries.get(key);
  if(saved)return decorate(saved,'hit');
  const pending=this.pending.get(key);
  if(pending)return decorate(await pending,'shared');
  const operation=Promise.resolve().then(load).then(value=>{
   // Validate and clone before saving; fallback/failure reports are never stored.
   const report=EvidenceComparisonReport.parse(structuredClone(value));
   const at=this.clock();const entry={at,expiresAt:at+300000,report};
   if(report.method==='llm'){
    if(this.entries.size>=100)this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key,entry);
   }
   return entry;
  });
  // Bound tracked work too; model budgets remain responsible for inference caps.
  const tracked=this.pending.size<100;
  if(tracked)this.pending.set(key,operation);
  try{return decorate(await operation,'miss');}
  finally{if(tracked)this.pending.delete(key);}
 }
}
