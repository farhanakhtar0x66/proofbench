const codes='(?:USD|CAD|AUD|NZD|HKD|SGD|MXN)';

/** Currency must be stated with each amount, never inferred from the evidence. */
export function currencyAmbiguityReason(claim:string):string|undefined{
 if(!/\b(?:costs?|prices?|pricing|fees?|charges?|pay|pays|paid|payment|monthly|month|year|annually|subscription|dollars?)\b/iu.test(claim))return;
 for(const match of claim.matchAll(/\$\s*\d[\d,]*(?:\.\d+)?/gu)){
  const before=claim.slice(0,match.index);const after=claim.slice(match.index+match[0].length);
  const prefix=new RegExp(`(?:\\b${codes}\\s*|\\b(?:US|CA|AU|NZ|HK|SG|MX))$`,'iu').test(before);
  const suffix=new RegExp(`^\\s*(?:(?:/|per\\s+)(?:month|year|user|day|week)\\s*)?(?:\\(\\s*)?${codes}\\b`,'iu').test(after);
  if(!prefix&&!suffix)return 'The dollar amount has no explicit currency. Specify a code such as USD, CAD or AUD with each amount; currency cannot be inferred from location or source text. The result is inconclusive, with no model comparison or correction.';
 }
}
