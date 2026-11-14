export type CaptainEvidenceHint='appointment'|'match_only'|'unspecified';

export function captainClaimScope(claim:string):'appointment'|'event'|undefined{
 if(!/\bcaptain\b/iu.test(claim))return;
 if(/\b(?:club|permanent|first[- ]team|team)\s+captain\b/iu.test(claim))return 'appointment';
 if(/\b(?:match|game|fixture|against|temporary|acting|stand-in)\b/iu.test(claim))return 'event';
 return 'appointment';
}

export function captainEvidenceHint(excerpt:string):CaptainEvidenceHint{
 const appointment=/\b(?:club|permanent|first[- ]team|first)\s+captain\b|\b(?:appointed|named|confirmed).{0,60}\bcaptain.{0,60}\b(?:season|permanent|hierarchy)\b/isu.test(excerpt);
 if(appointment)return 'appointment';
 const temporary=/\b(?:started|starting|served|serving|stand-in|temporary|acting)\s+(?:as\s+)?captain\b|\bend of (?:the|a) (?:match|game)\b|\bcaptain(?:ed)?.{0,80}\b(?:against|for (?:the|this|that|one|a) (?:match|game|fixture))\b/isu.test(excerpt);
 return temporary?'match_only':'unspecified';
}
