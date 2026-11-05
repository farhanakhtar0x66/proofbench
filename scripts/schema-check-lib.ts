import {bifrostSettings,hostedReadiness,createBifrostInterpreter} from '../packages/tavily/src/bifrost-interpreter';
import {checkBifrostStack} from '../packages/tavily/src/bifrost-status';
import {canonicalInterpretation,type LanguageInterpreter} from '../packages/tavily/src/interpretation';
import {compareClaimEvidence} from '../packages/tavily/src/evidence-comparison';
import {EvidenceRetrievalReport} from '../packages/contracts/src/index';

/** One synthetic inference at most. Diagnostics never contain the raw provider response. */
export async function checkGatewaySchema(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch,task:'interpretation'|'comparison'='interpretation'){
 let phase:'configuration'|'preflight'|'response_validation'|'source_validation'|'comparison_validation'|'complete'='configuration';
 let provider:string|undefined,model:string|undefined,adapter:LanguageInterpreter|undefined;
 let inferenceAttempted=false;
 const report=(passed:boolean,message:string)=>({passed,phase,task,provider,model,inferenceAttempted,message,createdAt:new Date().toISOString()});
 try{
  const settings=bifrostSettings(env);provider=settings.provider;model=settings.model;
  const blocked=hostedReadiness(env,settings);if(blocked)return report(false,blocked);
  phase='preflight';await checkBifrostStack(env,fetcher);
  let calls=0;
  adapter=createBifrostInterpreter(env,async(input,init)=>{
   if(String(input).endsWith('/v1/chat/completions')){if(calls>=1)throw new Error('Single-check inference limit');calls++;inferenceAttempted=true;}
   return fetcher(input,init);
  });
  if(task==='comparison'){
   phase='comparison_validation';
   const now=new Date().toISOString();const claim='Alex is CEO of Acme.';
   const excerpts=[`${claim} ${'North division scheduling and community events are described here. '.repeat(5)}`,`${claim} ${'South office meeting arrangements and internal announcements are detailed here. '.repeat(5)}`];
   const evidence=EvidenceRetrievalReport.parse({version:'1',claim,query:claim,mode:'live',status:'retrieved',createdAt:now,retrievedAt:now,message:'Synthetic test sources; no web retrieval.',limitations:['All test sources and timestamps are simulated.'],evidence:excerpts.map((excerpt,index)=>({url:`https://source${index}.example`,title:'Synthetic',excerpt,relation:'context',retrieval:'tavily',publishedAt:now,retrievedAt:now}))});
   const result=await compareClaimEvidence(evidence,{mode:'llm',interpreter:adapter});
   if(result.method!=='llm')return report(false,result.explanation);
   if(result.outcome!=='supported'||result.citations.some((citation,index)=>citation.quote!==excerpts[index]))return report(false,'Validated comparison did not match the synthetic evidence expectation. No retry was made.');
   phase='complete';return report(true,'One synthetic evidence comparison passed structured output, exact source binding and evidence-backed verdict checks.');
  }
  const text='Subscribers pay twenty USD monthly for Acme Pro.';
  phase='response_validation';
  const result=await adapter.interpret(text);
  phase='source_validation';
  if(canonicalInterpretation(text,result)!=='Acme Pro costs USD 20 per month.')return report(false,'Structured fields were accepted, but exact source-span or expected-meaning validation failed. No inference retry was made.');
  phase='complete';return report(true,'One synthetic response passed chat-envelope, structured-schema, source-span and expected-meaning validation.');
 }catch{
  return report(false,adapter?.unavailableReason?.()??(phase==='configuration'?'Invalid provider, model, endpoint or request-limit configuration.':'Gateway preflight failed. Run npm run bifrost:check; no inference retry was made.'));
 }
}
