const codes='(?:USD|CAD|AUD|NZD|HKD|SGD|MXN)';

/** A model cannot establish an explicitly claimed currency from a bare symbol. */
export function priceCurrencyEvidenceReason(claim:string,excerpt:string):string|undefined{
 if(!/\b(?:costs?|prices?|pricing|fees?|charges?|subscription)\b/iu.test(claim))return;
 const aliases:Record<string,RegExp>={
  USD:/\bUSD\b|\bUS\$|\bUS dollars?\b|\bU\.S\. dollars?\b/iu,
  CAD:/\bCAD\b|\bCA\$|\bCanadian dollars?\b/iu,
  AUD:/\bAUD\b|\bAU\$|\bAustralian dollars?\b/iu,
  NZD:/\bNZD\b|\bNZ\$|\bNew Zealand dollars?\b/iu,
  HKD:/\bHKD\b|\bHK\$|\bHong Kong dollars?\b/iu,
  SGD:/\bSGD\b|\bSG\$|\bSingapore dollars?\b/iu,
  MXN:/\bMXN\b|\bMX\$|\bMexican pesos?\b/iu,
 };
 const currencies=Object.entries(aliases).filter(([,pattern])=>pattern.test(claim));
 if(currencies.length!==1)return;
 const [currency,pattern]=currencies[0];
 if(!pattern.test(excerpt))return `The pricing claim explicitly specifies ${currency}, but the excerpt does not. A bare currency symbol or another currency cannot establish matching monetary scope.`;
}

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
