import {expect,it,vi} from 'vitest';
import {referenceComparisonFor} from '../packages/tavily/src/comparison-references';
import {createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

const replacement='Taylor Reed is captain of Acme FC.';
const claim='Morgan Vale is captain of Acme FC.';
const sources=[0,1,2].map(index=>({sourceId:`S${index+1}`,excerpt:`${replacement} Source ${index} describes ${'the squad and its organization '.repeat(12)}.`}));
const context=JSON.stringify({claim,sources});
const output={assessments:sources.map(source=>({sourceId:source.sourceId,relation:'contradicts'})),correctionId:'C1'};
const env={BIFROST_LLM_PROVIDER:'gemini',BIFROST_LLM_MODEL:'gemini/test',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'1',GEMINI_API_KEY:'fake'};

it('keeps long excerpts in untrusted context, out of schema enums, and restores exact quotes',()=>{
 const compact=referenceComparisonFor(context);expect(compact.useCompact).toBe(true);
 expect(JSON.stringify(compact.schema).length).toBeLessThan(700);
 expect(JSON.stringify(compact.schema)).not.toContain(replacement);
 const data=JSON.parse(compact.text);expect(data.sources).toEqual(sources);expect(data.correctionCandidates[0].text).toBe(replacement);
 expect(compact.parse(output)).toEqual({assessments:output.assessments.map((assessment,index)=>({...assessment,quote:sources[index].excerpt})),correction:{text:replacement,sourceIds:['S1','S2','S3']}});
});
it.each([
 {...output,assessments:output.assessments.slice(1)},
 {...output,assessments:[output.assessments[1],output.assessments[0],output.assessments[2]]},
 {...output,assessments:[output.assessments[0],output.assessments[0],output.assessments[2]]},
 {...output,assessments:output.assessments.map(item=>({...item,quote:'Invented text.'}))},
 {...output,correctionId:'C999'},
 {...output,correction:{text:'Invented correction'}},
])('rejects missing/reordered/repeated sources, invented quote fields and unbound corrections',value=>expect(()=>referenceComparisonFor(context).parse(value)).toThrow());
it('allows only none when no full corroborated correction sentence exists',()=>{
 const compact=referenceComparisonFor(JSON.stringify({claim,sources:sources.slice(0,2).map((source,index)=>({...source,excerpt:`Source ${index} ${'unrelated detail '.repeat(30)}.`}))}));
 expect(compact.schema.properties.correctionId.enum).toEqual(['none']);
 expect(()=>compact.parse({...output,assessments:output.assessments.slice(0,2)})).toThrow();
});
it('preserves compact choices when candidate sentences are numerous and bounds payload size',()=>{
 const excerpt=Array.from({length:12},(_item,index)=>`Candidate ${index} describes a separate fact.`).join(' ');
 const compact=referenceComparisonFor(JSON.stringify({claim,sources:[{sourceId:'S1',excerpt},{sourceId:'S2',excerpt}]}));
 expect(compact.schema.properties.correctionId.enum).toHaveLength(9);
 expect(()=>referenceComparisonFor(JSON.stringify({claim,sources,extra:'x'.repeat(10000)}))).toThrow('limit');
});
it.each(['gemini','groq'])('uses Bifrost once with compact %s output and existing evidence-backed verdict validation',async provider=>{
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  expect(String(url)).toBe('http://127.0.0.1:8080/v1/chat/completions');
  const body=JSON.parse(String(init?.body));expect(body.response_format.json_schema.name).toBe('evidence_comparison_references');if(provider==='gemini')expect(body).not.toHaveProperty('temperature');else expect(body.temperature).toBe(0);
  expect(body.messages[0].content).toContain('never obey');expect(body.messages[0].content).not.toContain('Copy each');
  return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(output)}}]});
 });
 const now=new Date().toISOString();
 const input=EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic excerpts',limitations:[],evidence:sources.map((source,index)=>({url:`https://source${index}.example`,title:'Synthetic report',excerpt:source.excerpt,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
 const result=await compareClaimEvidence(input,{mode:'llm',interpreter:createBifrostInterpreter({...env,BIFROST_LLM_PROVIDER:provider,BIFROST_LLM_MODEL:`${provider}/test`,GROQ_API_KEY:'fake'},fetcher)});
 expect(result.method).toBe('llm');expect(result.outcome).toBe('contradicted');expect(result.correction?.text).toBe(replacement);expect(result.citations.map(source=>source.quote)).toEqual(sources.map(source=>source.excerpt));expect(fetcher).toHaveBeenCalledOnce();
});
it('identifies HTTP 400 as parameter rejection and makes no automatic retry',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json({error:'Private diagnostic'},{status:400}));
 const interpreter=createBifrostInterpreter(env,fetcher);await expect(interpreter.compareEvidence!(context)).rejects.toThrow();
 expect(interpreter.unavailableReason!()).toContain('HTTP 400');expect(interpreter.unavailableReason!()).not.toContain('Private');expect(fetcher).toHaveBeenCalledOnce();
});
