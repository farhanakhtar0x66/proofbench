import React,{useEffect,useState} from 'react';
import {z} from 'zod';
import {AnalysisReport,AnalysisStatus,type VerificationReport} from '../../../packages/contracts/src/index';
import {api,schemas} from './client';

const time=(value:string|null|undefined)=>value?new Date(value).toLocaleString():'Not provided';
export function Verifier({initialAnswer,onBusyChange}:{initialAnswer:string;onBusyChange:(busy:boolean)=>void}){
 const [answer,setAnswer]=useState(initialAnswer);const [flow,setFlow]=useState('general');const [scope,setScope]=useState('current');
 const [status,setStatus]=useState<z.infer<typeof AnalysisStatus>>();const [analysis,setAnalysis]=useState<z.infer<typeof AnalysisReport>>();const [fixture,setFixture]=useState<VerificationReport>();
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [statusError,setStatusError]=useState('');
 async function refresh(){try{setStatus(await api('/analysis/status',schemas.AnalysisStatus));setStatusError('');}catch{setStatusError('Backend mode unavailable. Check the API connection before enabling live requests.');}}
 useEffect(()=>{void refresh();},[]);
 async function verify(event:React.FormEvent){
  event.preventDefault();setBusy(true);onBusyChange(true);setError('');setAnalysis(undefined);setFixture(undefined);
  try{
   if(flow==='fixture')setFixture(await api('/verify',schemas.VerificationReport,{version:'1',text:answer}));
   else setAnalysis(await api('/analysis',schemas.AnalysisReport,{version:'1',text:answer,scope}));
  }catch(error){setError(error instanceof Error?error.message:'Analysis could not complete.');}
  finally{setBusy(false);onBusyChange(false);void refresh();}
 }
 const count=flow==='fixture'?fixture?.claims.length:analysis?.results.length;
 const mode=flow==='fixture'?'LEGACY VERIFIER':status?status.mode==='mock'?'OFFLINE SOURCES':'LIVE SOURCES SELECTED':'CHECKING MODE';
 const noClaims=flow==='fixture'?fixture?.claims.length===0:analysis?.status==='no_claims';
 return <>
  <div className="notice"><span>ⓘ</span><div><strong>{mode}</strong><p>{flow==='fixture'?'Legacy narrow-pattern verifier. Offline fixtures are simulated; unfamiliar statements can be inconclusive.':status?.mode==='mock'?'Backend is in offline mode. No live sources will be fetched; general claims return inconclusive.':status?'Live retrieval is selected. Server consent, keys and remaining request budgets still control all calls. Sources may be insufficient.':'Reading backend configuration; no live request has been started.'}</p>{flow==='general'&&status&&<p>Extraction: {status.extractionMode==='rules'?'rules only':'optional model'} · Comparison: {status.comparisonMode==='rules'?'rules-only fallback':status.modelReady?'model configured and allowance available':'model unavailable; cached sources only'}{status.modelDescription?` · ${status.modelDescription}`:''}</p>}{statusError&&<p>{statusError}</p>}</div></div>
  <div className="verify-grid"><section className="panel"><div className="panel-heading"><h2>Answer to verify</h2><span className="small">{mode}</span></div>
   <form onSubmit={event=>void verify(event)}>
    <label htmlFor="verification-flow">Verification flow</label><select id="verification-flow" value={flow} disabled={busy} onChange={event=>{setFlow(event.target.value);setAnalysis(undefined);setFixture(undefined);setError('');}}><option value="general">General claim analysis</option><option value="fixture">Legacy verifier / fixture demo</option></select>
    {flow==='general'&&<><label htmlFor="search-scope">Evidence scope</label><select id="search-scope" value={scope} disabled={busy} onChange={event=>setScope(event.target.value)}><option value="current">Current evidence (older support docs allowed)</option><option value="as_stated">Search the statement as written</option></select></>}
    <label htmlFor="answer">Paste an answer or factual statement</label><textarea id="answer" value={answer} onChange={event=>setAnswer(event.target.value)} maxLength={20000} required disabled={busy} rows={8}/>
    <div className="form-footer"><small>{answer.length.toLocaleString()} / 20,000 characters{flow==='general'?' · Up to 3 distinct claims':''}</small><button className="primary" disabled={busy||!answer.trim()}>{busy?'Checking…':'Verify answer →'}</button></div>
    {busy&&<p role="status">Extracting claims, retrieving sources and checking evidence. This can take up to three minutes; no automatic retries.</p>}
    {error&&<div className="error" role="alert">{error}</div>}
   </form></section>
   <section className="panel findings" aria-busy={busy}><div className="panel-heading"><h2>Freshness findings</h2><span className="small">{count??0} CLAIMS</span></div>
    {!analysis&&!fixture&&!busy&&<p className="empty">Verify an answer to inspect claims, uncertainty, and reference sources.</p>}
    {noClaims&&<p className="empty" role="status">No factual claims were found. Enter a statement such as “Acme Pro costs USD 20/month.” Questions, headings, code blocks, and opinions are skipped; nothing was verified.</p>}
    {analysis&&<>
     <p className="analysis-summary">{analysis.status==='partial'?'Partial analysis — review each claim’s explanation.':analysis.status==='complete'?'Analysis completed. A verdict may still be inconclusive.':'No assertions selected.'}{analysis.omittedClaims>0?` ${analysis.omittedClaims} additional distinct extracted claim(s) were not processed.`:''}</p>
     {analysis.extraction.fallbackReason&&<p className="analysis-summary">Extraction fallback: {analysis.extraction.fallbackReason}</p>}
     {analysis.results.map(({claim,retrieval,comparison})=><article key={claim.start}>
      <div className="finding-status"><span className={`pill ${comparison.outcome}`}>{comparison.outcome}</span><span>Freshness: {comparison.freshness}</span></div><h3>{claim.text}</h3><p>{comparison.explanation}</p>
      <p>Freshness score: {comparison.freshnessScore===null?'unavailable':`${comparison.freshnessScore}/100 (evidence recency)`} · Evidence: {retrieval.status}</p>{comparison.freshnessScoreReason&&<p>{comparison.freshnessScoreReason}</p>}<p>Search window: {retrieval.searchWindow?`${retrieval.searchWindow.startDate} to ${retrieval.searchWindow.endDate}`:'No publication-date filter; comparison date checks still apply'}</p>
      {retrieval.status!=='retrieved'&&<p>{retrieval.message}</p>}
      {comparison.correction&&<div className="correction"><strong>Evidence-backed correction</strong><p>{comparison.correction.text}</p><small>Source references: {comparison.correction.sourceIds.join(', ')}</small></div>}
      {retrieval.evidence.map((source,index)=>{const citation=comparison.citations.find(item=>item.url===source.url);return <div className="source-evidence" key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{citation?.sourceId??`S${index+1}`} · {source.title} ↗<small>{citation?.quote??source.excerpt}</small></a><p>Published/updated estimate: {time(source.publishedAt)}<br/>Retrieved: {time(source.retrievedAt)}</p><p>{citation?`${citation.relation} · ${citation.eligible?'Passes preliminary checks; relevance and truth still require assessment':'Excluded from corroboration'}`:'Context only — not assessed'}</p>{citation?.scopeReason&&<p>{citation.scopeReason}</p>}<p>{citation?.dateReason??source.dateReason}</p>{source.excerptSelection&&<p>{source.excerptSelection.reason}{source.excerptSelection.warning?` ${source.excerptSelection.warning}`:''}</p>}</div>;})}
      <small>Assessment: {time(comparison.assessedAt)} · {comparison.method} · {analysis.mode}</small>
     </article>)}
     <details className="analysis-summary"><summary>Analysis limitations</summary>{analysis.limitations.map(text=><p key={text}>{text}</p>)}</details>
    </>}
    {fixture?.claims.map(claim=><article key={claim.id}><div className="finding-status"><span className={`pill ${claim.outcome}`}>{claim.outcome}</span><span>{claim.freshness}</span></div><h3>{claim.text}</h3><p>{claim.uncertainty}</p>{claim.evidence.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} ↗<small>{source.excerpt}</small></a>)}<small>Legacy assessment: {time(claim.asOf)} · {fixture.mode}</small></article>)}
   </section></div>
 </>;
}
