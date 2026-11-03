export type SearchEvidence={title?:string;url?:string;content?:string;published_date?:string};
type Fact={entity:string;kind:string;value:string;scope:string};
const normalize=(value:string)=>value.trim().toLowerCase().replace(/\s+/gu,' ');

// Deliberately narrow templates: unsupported phrasing must abstain.
function parseFact(text:string):Fact|undefined{
 let value=text.trim().replace(/[.!]$/u,'').replace(/’/gu,"'");
 if(/\b(not|no longer|formerly|previously|might|may|could|reportedly|expected|will|was|until|starting|from|approximately|about)\b/iu.test(value))return;
 const reversed=value.match(/^([\p{L}][\p{L} .'-]{1,80}) is (?:currently )?the (?:current )?CEO of ([\p{L}][\p{L}\p{N} &-]{1,80})$/iu);
 if(reversed)return {entity:normalize(reversed[2]),kind:'ceo',value:normalize(reversed[1]),scope:'current'};
 let match=value.match(/^(?:The )?(?:current )?CEO of ([\p{L}][\p{L}\p{N} &-]{1,80}) is ([\p{L}][\p{L} .'-]{1,80})$/iu);
 if(match)return {entity:normalize(match[1]),kind:'ceo',value:normalize(match[2]),scope:'current'};
 match=value.match(/^([\p{L}][\p{L}\p{N} &-]{1,80})(?:'s)? latest (?:API )?version is (v?\d+(?:\.\d+){0,3})$/iu);
 if(match)return {entity:normalize(match[1]),kind:'version',value:normalize(match[2]).replace(/^v/u,''),scope:'latest'};
 const monthly=value.match(/^The (monthly|annual) price of ([\p{L}][\p{L}\p{N} &-]{1,80}) is (.+)$/iu);
 if(monthly)value=`${monthly[2]} costs ${monthly[3]} per ${normalize(monthly[1])==='monthly'?'month':'year'}`;
 value=value.replace(/\b(USD|INR|EUR|GBP)\s*/giu,'$1 ').replace(/€\s*/gu,'EUR ').replace(/£\s*/gu,'GBP ').replace(/₹\s*/gu,'INR ').replace(/\s*\/\s*(month|year)\b/giu,' per $1');
 // A bare dollar symbol does not identify USD versus CAD/AUD/etc.
 if(value.includes('$'))return;
 match=value.match(/^([\p{L}][\p{L}\p{N} &-]{1,80}?) (?:currently )?costs (USD|INR|EUR|GBP) (\d+(?:\.\d{1,2})?) per (month|year|million input tokens|million output tokens)$/iu);
 if(match)return {entity:normalize(match[1]),kind:'price',value:String(Number(match[3])),scope:`${normalize(match[2])}/${normalize(match[4])}`};
}

export function splitComparableClauses(text:string):string[]{
 // Preserve context rather than guessing missing subjects or qualifications.
 if(/["“”`()[\]]|\b(if|unless|when|provided|according|allegedly|reportedly|either|neither)\b/iu.test(text))return [text];
 const clauses=text.split(/\s+(?:and|but)\s+|;\s*/iu).map(clause=>clause.trim());
 return clauses.length>1&&clauses.every(clause=>!!parseFact(clause))?clauses:[text];
}

export function analyzeEvidence(claim:string,source:SearchEvidence,now:string):{relation:'supports'|'contradicts'|'context';conflicting:boolean}{
 const original=parseFact(claim);
 if(!original||!source.content||!source.published_date)return {relation:'context',conflicting:false};
 const published=Date.parse(source.published_date);const age=Date.parse(now)-published;
 if(!Number.isFinite(age)||age<0||age>30*24*60*60*1000)return {relation:'context',conflicting:false};
 const relations=new Set<string>();
 for(const {segment} of new Intl.Segmenter('en',{granularity:'sentence'}).segment(source.content)){
  for(const clause of splitComparableClauses(segment.trim())){
   const fact=parseFact(clause);
   if(fact&&fact.entity===original.entity&&fact.kind===original.kind&&fact.scope===original.scope)relations.add(fact.value===original.value?'supports':'contradicts');
  }
 }
 return {relation:relations.size===1?(relations.has('supports')?'supports':'contradicts'):'context',conflicting:relations.size>1};
}

export function compareEvidence(claim:string,source:SearchEvidence,now:string):'supports'|'contradicts'|'context'{
 return analyzeEvidence(claim,source,now).relation;
}

export function claimFormatLimitation(text:string):string|null{
 if(parseFact(text))return null;
 if(text.includes('$'))return 'The dollar symbol does not identify a currency. Specify a code such as USD, CAD or AUD; this prototype currently compares USD, INR, EUR and GBP pricing.';
 return 'This claim does not match a supported English pricing, CEO or latest-version pattern. Try a complete statement with an explicit product or company, value and billing unit when applicable. No verdict can be inferred from related search results.';
}

export function claimEntity(text:string):string|undefined{
 return parseFact(text)?.entity;
}

export function normalizeSource(source:SearchEvidence):SearchEvidence|undefined{
 try{
  const url=new URL(source.url??'');
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return;
  const published=source.published_date?Date.parse(source.published_date):NaN;
  return {...source,url:url.href,published_date:Number.isFinite(published)?new Date(published).toISOString():undefined};
 }catch{return;}
}
