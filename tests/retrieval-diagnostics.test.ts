import {expect,it,vi} from 'vitest';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {selectEvidenceExcerpt} from '../packages/tavily/src/excerpts';
import {retrievalRanking} from '../packages/tavily/src/retrieval-ranking';

it.each([
 ['Tavily retrieval timed out. No retry was made.','retrieval_timeout','timed out'],
 ['Tavily retrieval failed or the network is unavailable.','retrieval_unavailable','search failed'],
 ['Tavily HTTP 429: rate limit reached.','retrieval_rate_limited','rate limit'],
])('returns a concise search failure instead of an evidence verdict: %s',async(message,reasonCode,short)=>{
 const data=EvidenceRetrievalReport.parse({version:'1',claim:'A triangle has three sides.',query:'Synthetic',mode:'live',status:'unavailable',createdAt:new Date().toISOString(),retrievedAt:null,evidence:[],limitations:[],message});
 const interpreter={interpret:vi.fn(),compareEvidence:vi.fn()};const report=await compareClaimEvidence(data,{mode:'llm',interpreter});
 expect(report).toMatchObject({outcome:'inconclusive',verificationStatus:'failed',reasonCode,explanation:message});
 expect(report.shortReason).toContain(short);expect(interpreter.compareEvidence).not.toHaveBeenCalled();
});
it('distinguishes a search allowance from missing factual evidence',async()=>{
 const data=EvidenceRetrievalReport.parse({version:'1',claim:'A claim.',query:'Synthetic',mode:'live',status:'budget_exhausted',createdAt:new Date().toISOString(),retrievedAt:null,evidence:[],limitations:[],message:'The server-lifetime search budget is exhausted.'});
 const report=await compareClaimEvidence(data,{mode:'llm',interpreter:{interpret:vi.fn(),compareEvidence:vi.fn()}});
 expect(report).toMatchObject({reasonCode:'budget_exhausted',verificationStatus:'blocked',shortReason:'The source-search allowance is exhausted.'});
});
it('ranks an explicit scoped statement above words scattered through questions and unrelated statements',()=>{
 const claim='Lumen exports reports in CSV format.';const now=new Date().toISOString();
 const rank=(excerpt:string)=>retrievalRanking(claim,{url:'https://reference.example',title:'Synthetic reference',excerpt},now).relevance;
 expect(rank('Lumen exports reports in CSV format.')).toBeGreaterThan(rank('Does Lumen export reports in CSV format? The product includes reports. CSV is another topic.'));
 // Ranking both agreement and disagreement helps comparison discover false claims.
 expect(rank('Lumen never exports reports in CSV format.')).toBeGreaterThan(rank('Does Lumen export reports in CSV format?'));
});

it('keeps the asserted property in superlative excerpts and retains directly opposing statements',()=>{
 const claim='Lumen is the oldest library in Arcadia.';
 const direct='Lumen is the second-oldest library in Arcadia.';
 const other=Array.from({length:25},(_,i)=>`Background ${i}: Lumen library in Arcadia may offer events but attendance is restricted. ${'Additional details. '.repeat(20)}`).join('\n');
 const selected=selectEvidenceExcerpt(claim,direct+'\n'+other);expect(selected.excerpt).toContain(direct);expect(selected.selection.warning).toBeUndefined();
 const qualified=selectEvidenceExcerpt(claim,direct+'\nHowever, Lumen is not the oldest library in Arcadia. '+ 'Additional qualifications. '.repeat(150));expect(qualified.excerpt).toContain('However, Lumen is not the oldest library in Arcadia.');
});

it('selects complete sentences from flattened long paragraphs and keeps adjacent negation',()=>{
 const claim='The Atlas format stores text records.';const direct='The Atlas format stores text records.';const qualification='However, the Atlas format does not store text records when encryption is enabled.';
 const source=direct+' '+qualification+' '+ 'Unrelated background information is described here. '.repeat(100);
 const selected=selectEvidenceExcerpt(claim,source);expect(selected.excerpt).toContain(direct);expect(selected.excerpt).toContain(qualification);expect(selected.selection.warning).toBeUndefined();
 for(const part of selected.passages??[])expect(source.slice(part.start,part.end)).toBe(part.text);
});
