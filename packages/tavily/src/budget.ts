import {createHash} from 'node:crypto';

export class RequestBudgetExhausted extends Error {}
export class CachedEvidenceUnavailable extends Error {}

// One instance per server process. Restarting the process resets this budget.
export class SearchBudget {
 private used=0;
 private ceiling=Infinity;
 private cache=new Map<string,{at:number;value:unknown;retrievedAt:string}>();
 private pending=new Map<string,Promise<{value:unknown;retrievedAt:string}>>();
 constructor(private clock:()=>number=Date.now){}

 async search<T>(query:string,key:string,limit:number,load:()=>Promise<T>,cacheOnly=false):Promise<{value:T;retrievedAt:string}>{
  this.ceiling=Math.min(this.ceiling,limit);
  const id=createHash('sha256').update(JSON.stringify([key,query])).digest('hex');
  const now=this.clock();
  for(const [entry,item] of this.cache)if(now-item.at>=300000)this.cache.delete(entry);
  const cached=this.cache.get(id);
  if(cached)return {value:cached.value as T,retrievedAt:cached.retrievedAt};
  const pending=this.pending.get(id);
  if(pending)return pending as Promise<{value:T;retrievedAt:string}>;
  if(cacheOnly)throw new CachedEvidenceUnavailable();
  if(this.used>=this.ceiling)throw new RequestBudgetExhausted();
  // Reserve synchronously before any asynchronous work, including concurrent calls.
  this.used++;
  const operation=Promise.resolve().then(load).then(value=>{
   const at=this.clock();const retrievedAt=new Date(at).toISOString();
   if(this.cache.size>=100)this.cache.delete(this.cache.keys().next().value!);
   this.cache.set(id,{at,value,retrievedAt});
   return {value,retrievedAt};
  });
  this.pending.set(id,operation);
  try{return await operation;}finally{this.pending.delete(id);}
 }
}
