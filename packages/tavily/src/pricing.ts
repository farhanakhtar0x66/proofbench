export type PriceFact={entity:string;kind:'price';value:string;scope:string};
const normalize=(text:string)=>text.toLowerCase().trim().replace(/\s+/gu,' ');
const regions:Record<string,string>={'us':'us','usa':'us','united states':'us','uk':'uk','united kingdom':'uk','india':'india','in':'india'};

export function parsePrice(text:string):PriceFact|undefined{
 let value=text.trim().replace(/[.!]$/u,'').replace(/’/gu,"'");
 if(/\b(not|was|will|might|may|starting|from|about|approximately|tax|discount|trial|cheapest|including|excluding)\b/iu.test(value)||value.includes('$'))return;
 let region='unspecified';let billing='unspecified';
 const billingMatch=value.match(/,?\s+billed (monthly|annually|yearly)(?=\s+in\s|$)/iu);
 if(billingMatch){billing=normalize(billingMatch[1])==='monthly'?'monthly':'annually';value=value.replace(billingMatch[0],'');}
 const regionMatch=value.match(/\s+in ([\p{L}][\p{L} -]{1,40})$/iu);
 if(regionMatch){const named=normalize(regionMatch[1]);region=regions[named]??named;value=value.slice(0,-regionMatch[0].length);}
 const monthly=value.match(/^The (monthly|annual) price of ([\p{L}][\p{L}\p{N} &'’-]{1,80}) is (.+)$/iu);
 if(monthly)value=`${monthly[2]} costs ${monthly[3]} per ${normalize(monthly[1])==='monthly'?'month':'year'}`;
 value=value.replace(/€\s*/gu,'EUR ').replace(/£\s*/gu,'GBP ').replace(/₹\s*/gu,'INR ').replace(/\b(USD|INR|EUR|GBP)\s*/giu,'$1 ').replace(/\s*\/\s*(month|year)\b/giu,' per $1');
 const match=value.match(/^([\p{L}][\p{L}\p{N} &'’-]{1,80}?) (?:currently )?costs (USD|INR|EUR|GBP) (\d+(?:\.\d{1,2})?) per (month|year|million input tokens|million output tokens|user per month|user per year)$/iu);
 if(!match)return;
 let entity=normalize(match[1]);
 // Only explicit plan labels are normalized; missing plans are not guessed.
 entity=entity.replace(/'s\s+(basic|pro|plus|premium|enterprise|business|team|starter|standard) plan$/u,' $1').replace(/\s+(basic|pro|plus|premium|enterprise|business|team|starter|standard) plan$/u,' $1');
 if(/\b(in|billed)\b/u.test(entity))return;
 return {entity,kind:'price',value:String(Number(match[3])),scope:`price/${normalize(match[2])}/${normalize(match[4])}/region:${region}/billing:${billing}`};
}
