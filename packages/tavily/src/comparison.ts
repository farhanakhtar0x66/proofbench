export type SearchEvidence={title?:string;url?:string;content?:string;published_date?:string};
type Fact={entity:string;kind:string;value:string;scope:string};
const normalize=(value:string)=>value.trim().toLowerCase().replace(/\s+/gu,' ');

// Deliberately narrow templates: unsupported phrasing must abstain.
function parseFact(text:string):Fact|undefined{
 const value=text.trim().replace(/[.!]$/u,'');
 if(/\b(not|no longer|formerly|previously|might|may|could|reportedly|expected|will|was|until)\b/iu.test(value))return;
 let match=value.match(/^(?:The )?current CEO of ([\p{L}][\p{L}\p{N} &-]{1,80}) is ([\p{L}][\p{L} .'-]{1,80})$/iu);
 if(match)return {entity:normalize(match[1]),kind:'ceo',value:normalize(match[2]),scope:'current'};
 match=value.match(/^([\p{L}][\p{L}\p{N} &-]{1,80}) latest (?:API )?version is (v?\d+(?:\.\d+){0,3})$/iu);
 if(match)return {entity:normalize(match[1]),kind:'version',value:normalize(match[2]).replace(/^v/u,''),scope:'latest'};
 match=value.match(/^([\p{L}][\p{L}\p{N} &-]{1,80}) currently costs (USD|INR|EUR|GBP) (\d+(?:\.\d{1,2})?) per (month|year|million input tokens|million output tokens)$/iu);
 if(match)return {entity:normalize(match[1]),kind:'price',value:String(Number(match[3])),scope:`${normalize(match[2])}/${normalize(match[4])}`};
}

export function compareEvidence(claim:string,source:SearchEvidence,now:string):'supports'|'contradicts'|'context'{
 const original=parseFact(claim);
 if(!original||!source.content||!source.published_date)return 'context';
 const published=Date.parse(source.published_date);const age=Date.parse(now)-published;
 if(!Number.isFinite(age)||age<0||age>30*24*60*60*1000)return 'context';
 const relations=new Set<string>();
 for(const {segment} of new Intl.Segmenter('en',{granularity:'sentence'}).segment(source.content)){
  const fact=parseFact(segment);
  if(fact&&fact.entity===original.entity&&fact.kind===original.kind&&fact.scope===original.scope)relations.add(fact.value===original.value?'supports':'contradicts');
 }
 return relations.size===1?(relations.has('supports')?'supports':'contradicts'):'context';
}

export function normalizeSource(source:SearchEvidence):SearchEvidence|undefined{
 try{
  const url=new URL(source.url??'');
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;
  const published=source.published_date?Date.parse(source.published_date):NaN;
  return {...source,url:url.href,published_date:Number.isFinite(published)?new Date(published).toISOString():undefined};
 }catch{return;}
}
