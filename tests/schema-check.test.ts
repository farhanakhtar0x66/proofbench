import {expect,it,vi} from 'vitest';
import {checkGatewaySchema} from '../scripts/schema-check-lib';

const env={BIFROST_LLM_PROVIDER:'groq',BIFROST_LLM_MODEL:'groq/openai/gpt-oss-20b',GROQ_API_KEY:'fake',BIFROST_FREE_TIER_CONFIRMED:'true',BIFROST_LLM_MAX_REQUESTS:'1'};
const fact={entity:'Acme Pro',kind:'price',value:'twenty',currency:'USD',period:'monthly',time:null,region:null,tier:null};
function transport(value:unknown=fact,patch:Record<string,unknown>={}){
 return vi.fn<typeof fetch>(async url=>String(url).endsWith('/health')?Response.json({status:'ok'}):Response.json({error:null,choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(value),tool_calls:null,function_call:null,refusal:null,...patch}}]}));
}
it.each([null,[]])('accepts an OpenAI-compatible success envelope with empty tool metadata: %j',tool_calls=>{
 const fetcher=transport(fact,{tool_calls});
 return checkGatewaySchema(env,fetcher).then(report=>{expect(report).toMatchObject({passed:true,phase:'complete',inferenceAttempted:true});expect(fetcher).toHaveBeenCalledTimes(2);});
});
it('identifies source validation separately from transport/schema success without accepting normalized values',async()=>{
 const fetcher=transport({...fact,value:'20'});
 const report=await checkGatewaySchema(env,fetcher);
 expect(report).toMatchObject({passed:false,phase:'source_validation',inferenceAttempted:true});
 expect(report.message).toContain('exact source-span');expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([
 {tool_calls:[{id:'call1',type:'function',function:{name:'unexpected',arguments:'{}'}}]},
 {content:'not json'},
])('reports rejected responses safely, with no retry: %j',patch=>{
 const fetcher=transport(fact,patch);
 return checkGatewaySchema(env,fetcher).then(report=>{expect(report).toMatchObject({passed:false,phase:'response_validation'});expect(report.message).toMatch(/invalid chat|invalid JSON/u);expect(fetcher).toHaveBeenCalledTimes(2);});
});
it('does not report upstream success as application success when fields violate the schema',async()=>{
 const report=await checkGatewaySchema(env,transport({...fact,privateDiagnostic:'must not appear'}));
 expect(report).toMatchObject({passed:false,phase:'response_validation'});expect(report.message).toContain('schema validation');expect(JSON.stringify(report)).not.toContain('must not appear');
});
it('stops before inference when the local gateway is unavailable',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>{throw new Error('private connection detail');});
 const report=await checkGatewaySchema(env,fetcher);
 expect(report).toMatchObject({passed:false,phase:'preflight',inferenceAttempted:false});expect(fetcher).toHaveBeenCalledOnce();expect(JSON.stringify(report)).not.toContain('private connection detail');
});
it('stops before network for incomplete configuration',async()=>{
 const fetcher=vi.fn();const report=await checkGatewaySchema({...env,GROQ_API_KEY:''},fetcher);
 expect(report).toMatchObject({passed:false,phase:'configuration',inferenceAttempted:false});expect(fetcher).not.toHaveBeenCalled();
});
it.each(['supports','insufficient'])('checks the actual Groq comparison task with one request: %s',async relation=>{
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  if(String(url).endsWith('/health'))return Response.json({status:'ok'});
  const body=JSON.parse(String(init?.body));
  expect(body.response_format.json_schema.name).toBe('evidence_comparison_references');
  expect(JSON.stringify(body.response_format)).not.toContain('North division');
  const context=JSON.parse(JSON.parse(body.messages[1].content).untrustedText);
  return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',tool_calls:[],content:JSON.stringify({assessments:context.sources.map((source:{sourceId:string})=>({sourceId:source.sourceId,relation})),correctionId:'none'})}}]});
 });
 const report=await checkGatewaySchema(env,fetcher,'comparison');
 expect(report).toMatchObject({passed:relation==='supports',task:'comparison',inferenceAttempted:true,phase:relation==='supports'?'complete':'comparison_validation'});
 expect(fetcher).toHaveBeenCalledTimes(2);
});
