import {z} from 'zod';

const Bindings=z.array(z.object({entity:z.string().trim().min(3).max(120),urlPrefix:z.string().url()}).strict()).max(64);
/** Operator-reviewed identity bindings only. A model, title or domain resemblance cannot grant authority. */
export function configuredPrimaryDirect(claim:string,source:{url:string;excerpt:string},raw=process.env.TAVILY_PRIMARY_SOURCES):boolean{
 if(!raw)return false;
 try{
  const actual=new URL(source.url);
  const terms=(text:string)=>` ${(text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]).join(' ')} `;
  return Bindings.parse(JSON.parse(raw)).some(binding=>{
   const expected=new URL(binding.urlPrefix);
   if(expected.protocol!=='https:'||expected.username||expected.password||expected.port||expected.search||expected.hash||expected.hostname.includes('xn--'))return false;
   const prefix=expected.pathname.replace(/\/$/u,'');
   return actual.protocol==='https:'&&!actual.username&&!actual.password&&!actual.port&&actual.origin===expected.origin&&(!prefix||actual.pathname===prefix||actual.pathname.startsWith(prefix+'/'))&&terms(claim).includes(terms(binding.entity))&&terms(source.excerpt).includes(terms(binding.entity));
  });
 }catch{return false;}
}
