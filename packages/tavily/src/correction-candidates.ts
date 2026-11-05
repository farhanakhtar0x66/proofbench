import {candidateStatements} from './claim-extraction';

const normalize=(text:string)=>text.normalize('NFC').trim().replace(/\s+/gu,' ').replace(/[.!]$/u,'');
/** Only literal sameness and narrowly recognized attribution prefixes, not semantic equivalence. */
export function isClaimRestatement(claim:string,candidate:string){
 const withoutPrefix=candidate.replace(/^The (?:upstream project|official announcement|report) (?:confirms|states)(?: that)?\s*:?\s+/iu,'');
 return normalize(claim)===normalize(candidate)||normalize(claim)===normalize(withoutPrefix);
}

export function sharedReplacementSentences(claim:string,excerpts:string[]){
 const statements=excerpts.map(excerpt=>candidateStatements(excerpt).map(sentence=>sentence.text));
 return [...new Set(statements.flat())].filter(sentence=>!isClaimRestatement(claim,sentence)&&statements.filter(sentences=>sentences.includes(sentence)).length>=2);
}
