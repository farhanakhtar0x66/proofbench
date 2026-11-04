import {captainClaimScope} from './captain-scope';
import {supportClaimSubject} from './support-scope';
import {datedEndOfLifeClaim} from './historical-support';
import {completedEventClaim} from './completed-event';
import {parsePrice} from './pricing';

export function evidenceSearchPlan(claim:string,scope:'as_stated'|'current'='as_stated',now=new Date()){
 const literal=claim.replace(/\s+/gu,' ');
 if(scope==='as_stated')return {query:literal,dateWindow:undefined};
 const event=completedEventClaim(literal,now.toISOString());
 if(event)return {query:`${event.subject} ${event.event} date official documentation`,dateWindow:undefined};
 if(datedEndOfLifeClaim(literal))return {query:`${literal} official documentation`,dateWindow:undefined};
 const supportSubject=supportClaimSubject(literal);
 // Support lifecycles may be documented in older announcements. Retrieve those
 // without declaring them current; comparison's date rules still apply.
 if(supportSubject)return {query:`${supportSubject} support status end of life official documentation`,dateWindow:undefined};
 const start=new Date(now.getTime()-30*86400000);
 const end=new Date(now.getTime()+86400000);
 // Search the role rather than presuming the asserted holder is correct.
 // Keep the original claim for comparison; retain any object-side qualifiers.
 const qualified=/^(?:if|unless|according to)\b|\b(?:may|might|could|would)\s+(?:be|serve)\b|\b(?:formerly|previously|was|will be)\b|[“”"]/iu.test(literal);
 const role=qualified?null:literal.match(/^.+?\s+(?:is|serves as)\s+(?:(?:not|currently)\s+){0,2}(?:the\s+)?((?:club |team |first-team )?captain|CEO|president|prime minister|chairperson|head coach)\s+(?:of|for)\s+(.+)$/iu);
 const possessive=qualified?null:literal.match(/^(.+?)(?:'s|’s)\s+(?:current\s+)?(?:club\s+|team\s+|first-team\s+)?captain\s+is\s+(?:not\s+)?.+$/iu);
 let query=`${literal} current official sources`;
 const price=parsePrice(literal);
 if(price){
  const [,currency,period,...qualifiers]=price.scope.split('/');
  const explicit=qualifiers.filter(value=>!value.endsWith(':unspecified')).map(value=>value.replace('region:','region ').replace('billing:','billed ')).join(' ');
  query=`${price.entity} current ${currency.toUpperCase()} pricing per ${period}${explicit?` ${explicit}`:''} official sources`;
 }
 if(role){
  const target=role[2].replace(/[.!]+$/u,'');
  query=/\bcaptain\b/iu.test(role[1])&&captainClaimScope(literal)==='appointment'?`${target} current club captains captaincy appointment official sources`:`${target} current ${role[1]} official sources`;
 }else if(possessive&&captainClaimScope(literal)==='appointment')query=`${possessive[1]} current club captains captaincy appointment official sources`;
 return {query,dateWindow:{startDate:start.toISOString().slice(0,10),endDate:end.toISOString().slice(0,10)}};
}
