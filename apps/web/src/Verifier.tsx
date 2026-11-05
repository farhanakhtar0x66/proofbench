import { useEffect, useState, type FormEvent } from 'react';
import { Archive, ArrowDown, ArrowUpRight, Check, CircleHelp, ClipboardList, FileSearch, FlaskConical, Info, SlidersHorizontal, X } from 'lucide-react';
import { z } from 'zod';
import { AnalysisReport, AnalysisStatus, type VerificationReport } from '../../../packages/contracts/src/index';
import { api, schemas } from './client';
import { BinaryField } from './PresentationArt';

const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : 'Not provided';
type Verdict = 'supported' | 'contradicted' | 'inconclusive';
type Analysis = z.infer<typeof AnalysisReport>;

function FindingHeading({ outcome, freshness, claim }: { outcome: Verdict; freshness: string; claim: string }) {
  const Icon = outcome === 'supported' ? Check : outcome === 'contradicted' ? X : CircleHelp;
  return <>
    <div className="finding-status">
      <span className={`pill ${outcome}`}><Icon size={14} aria-hidden="true"/>{outcome}</span>
      <span>Freshness: <strong>{freshness}</strong></span>
    </div>
    <h3>{claim}</h3>
  </>;
}

function ClaimFinding({ result, mode }: { result: Analysis['results'][number]; mode: Analysis['mode'] }) {
  const { claim, retrieval, comparison } = result;
  const score = comparison.freshnessScore === null ? 'unavailable' : `${comparison.freshnessScore}/100 (evidence recency)`;

  return <article className={`claim-card ${comparison.outcome}`}>
    <div className="claim-overview">
      <FindingHeading outcome={comparison.outcome} freshness={comparison.freshness} claim={claim.text}/>
      <p className="claim-explanation">{comparison.explanation}</p>
      <div className="finding-facts">
        <span>Freshness score: <strong>{score}</strong></span>
        <span>Evidence: <strong>{retrieval.status}</strong></span>
      </div>
      {comparison.freshnessScoreReason&&<p className="finding-note">{comparison.freshnessScoreReason}</p>}
      {retrieval.status!=='retrieved'&&retrieval.message&&<p className="finding-note">{retrieval.message}</p>}
      {comparison.cache&&<p className="finding-note">
        {comparison.cache.status==='hit'?'Reused cached comparison':comparison.cache.status==='shared'?'Shared concurrent comparison attempt':'Comparison cache miss'}
        {comparison.cache.expiresAt?` · Reuse expires: ${time(comparison.cache.expiresAt)}`:''}. Reuse preserves the original assessment time and score.
      </p>}
    </div>
    {comparison.correction&&<div className="correction">
      <strong>Evidence-backed correction</strong>
      <p>{comparison.correction.text}</p>
      <small>Source references: {comparison.correction.sourceIds.join(', ')}</small>
    </div>}
    {retrieval.evidence.length>0&&<section className="finding-sources" aria-label="Sources">
      <h4>Sources <span>{retrieval.evidence.length}</span></h4>
      {retrieval.evidence.map((source,index)=>{
        const citation=comparison.citations.find(item=>item.url===source.url);
        return <div className="source-evidence" key={source.url}>
          <a href={source.url} target="_blank" rel="noreferrer">{citation?.sourceId??`S${index+1}`} · {source.title} <ArrowUpRight size={14} aria-hidden="true"/></a>
          <blockquote>{citation?.quote??source.excerpt}</blockquote>
          <p className="source-date">Published/updated estimate: {time(source.publishedAt)}<br/>Retrieved: {time(source.retrievedAt)}</p>
          <p>{citation?`${citation.relation} · ${citation.eligible?'Passes preliminary checks; relevance and truth still require assessment':'Excluded from corroboration'}`:'Context only — not assessed'}</p>
          {citation?.scopeReason&&<p>{citation.scopeReason}</p>}
          <p>{citation?.dateReason??source.dateReason}</p>
          {source.excerptSelection&&<p>{source.excerptSelection.reason}{source.excerptSelection.warning?` ${source.excerptSelection.warning}`:''}</p>}
        </div>;
      })}
    </section>}
    <details className="review-disclosure">
      <summary>Retrieval limitations</summary>
      <div className="review-disclosure-body">
        <p>Search window: {retrieval.searchWindow?`${retrieval.searchWindow.startDate} to ${retrieval.searchWindow.endDate}`:'No publication-date filter; comparison date checks still apply'}</p>
        {retrieval.limitations.map(item=><p key={item}>{item}</p>)}
        <p>Assessed {time(comparison.assessedAt)} · {comparison.method.replaceAll('_',' ')} · {mode}</p>
      </div>
    </details>
  </article>;
}

export function Verifier({ initialAnswer, onBusyChange }: { initialAnswer: string; onBusyChange: (busy: boolean) => void }) {
  const [answer, setAnswer] = useState(initialAnswer);
  const [flow, setFlow] = useState('general');
  const [scope, setScope] = useState('current');
  const [status, setStatus] = useState<z.infer<typeof AnalysisStatus>>();
  const [analysis, setAnalysis] = useState<Analysis>();
  const [fixture, setFixture] = useState<VerificationReport>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [savedId, setSavedId] = useState('');
  const [saved, setSaved] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  async function refresh() {
    try {
      setStatus(await api('/analysis/status', schemas.AnalysisStatus));
      setStatusError('');
    } catch {
      setStatusError('Backend mode unavailable. Check the API connection before enabling live requests.');
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true); onBusyChange(true); setError(''); setSaved(false); setAnalysis(undefined); setFixture(undefined);
    try {
      if (flow === 'fixture') setFixture(await api('/verify', schemas.VerificationReport, { version:'1', text:answer }));
      else setAnalysis(await api('/analysis', schemas.AnalysisReport, { version:'1', text:answer, scope }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Analysis could not complete.');
    } finally {
      setBusy(false); onBusyChange(false); void refresh();
    }
  }

  const validSavedId = /^[a-zA-Z0-9_-]{1,100}$/u.test(savedId.trim());
  async function loadSaved(event: FormEvent) {
    event.preventDefault();
    if (!validSavedId) return;
    setBusy(true); setLoadingSaved(true); onBusyChange(true); setError(''); setSaved(false); setAnalysis(undefined); setFixture(undefined);
    try {
      const report = await api(`/analysis/${encodeURIComponent(savedId.trim())}`, schemas.AnalysisReport);
      setAnswer(report.text); setScope(report.scope); setFlow('general'); setAnalysis(report); setSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Saved assessment could not be loaded.');
    } finally {
      setBusy(false); setLoadingSaved(false); onBusyChange(false);
    }
  }

  function loadOfflineExample() {
    setAnswer('Python 2 is currently supported.');
    setFlow('fixture');
    setSaved(false);
    setAnalysis(undefined);
    setFixture(undefined);
    setError('');
  }

  const count = (flow === 'fixture' ? fixture?.claims.length : analysis?.results.length) ?? 0;
  const mode = flow === 'fixture' ? 'Fixture verifier' : status ? status.mode === 'mock' ? 'Offline sources' : 'Live sources selected' : 'Checking mode';
  const noClaims = flow === 'fixture' ? fixture?.claims.length === 0 : analysis?.status === 'no_claims';
  const hasResult = Boolean(analysis || fixture);
  const modeMessage = flow === 'fixture' ? 'Checks recognized claims against a built-in reference set.' :
    status?.mode === 'mock' ? 'Backend is in offline mode. General claim analysis cannot establish a verdict without live evidence.' :
    status ? 'Live searches depend on server permissions and the remaining request budget.' : 'Reading source settings.';

  return <div className="verification-workspace">
    <div className="verifier-mode">
      <Info size={17} aria-hidden="true"/>
      <strong>{mode}</strong>
      <p>{statusError || modeMessage}</p>
    </div>
    <div className="verify-grid">
      <section className="panel verifier-compose" id="verification-input" tabIndex={-1}>
        <div className="panel-heading">
          <div><p className="eyebrow">01 / INPUT</p><h2>Answer to verify</h2></div>
          <span className="compose-icon"><ClipboardList size={22} aria-hidden="true"/></span>
        </div>
        <form className="verify-form" onSubmit={event=>void verify(event)}>
          <div className="verify-field">
            <label htmlFor="answer">Paste an answer or factual statement</label>
            <div className="claim-editor">
              <div className="editor-toolbar">
                <span className="editor-label"><span aria-hidden="true"/> Claim draft</span>
                <button className="example-button" type="button" disabled={busy} onClick={loadOfflineExample}>
                  <FlaskConical size={14} aria-hidden="true"/> Load offline example
                </button>
              </div>
              <textarea id="answer" value={answer} onChange={event=>{
                setAnswer(event.target.value);
                if (saved) { setSaved(false); setAnalysis(undefined); }
              }} maxLength={20000} required disabled={busy} rows={5} placeholder="Enter a claim to check…"/>
              <small>{answer.length.toLocaleString()} / 20,000 characters</small>
            </div>
          </div>
          <fieldset className="verify-settings">
            <legend><SlidersHorizontal size={14} aria-hidden="true"/> Review settings</legend>
            <div className="verify-field">
              <label htmlFor="verification-flow">Verification flow</label>
              <select id="verification-flow" value={flow} disabled={busy} onChange={event=>{
                setFlow(event.target.value); setSaved(false); setAnalysis(undefined); setFixture(undefined); setError('');
              }}>
                <option value="general">General claim analysis</option>
                <option value="fixture">Offline fixture demo</option>
              </select>
            </div>
            {flow==='general'&&<div className="verify-field">
              <label htmlFor="search-scope">Evidence scope</label>
              <select id="search-scope" value={scope} disabled={busy} onChange={event=>setScope(event.target.value)}>
                <option value="current">Current evidence</option>
                <option value="as_stated">Search as written</option>
              </select>
            </div>}
          </fieldset>
          <div className="form-footer">
            {flow==='general'&&<small>Up to 3 distinct claims per answer</small>}
            <button className="primary" disabled={busy||!answer.trim()}>{busy?'Checking…':'Verify answer →'}</button>
          </div>
          {busy&&<p role="status" className="form-feedback">{loadingSaved?'Loading a saved assessment; no search or model request.':'Checking claims and evidence. This can take up to three minutes; no automatic retries.'}</p>}
          {error&&<div className="error" role="alert">{error}</div>}
          {hasResult&&<a className="mobile-findings-link" href="#freshness-findings">Jump to findings <ArrowDown size={15} aria-hidden="true"/></a>}
        </form>
        <details className="review-disclosure saved-assessment" id="saved-assessment" tabIndex={-1}>
          <summary><Archive size={15} aria-hidden="true"/> Load a saved assessment</summary>
          <form onSubmit={event=>void loadSaved(event)}>
            <label htmlFor="saved-assessment-id">Saved assessment ID</label>
            <input id="saved-assessment-id" value={savedId} onChange={event=>setSavedId(event.target.value)} maxLength={100} disabled={busy} required/>
            <p>Open a previous result with its original sources.</p>
            <button type="submit" disabled={busy||!validSavedId}>Load saved assessment</button>
          </form>
        </details>
      </section>
      <section className="panel findings" id="freshness-findings" tabIndex={-1} aria-busy={busy}>
        <div className="panel-heading findings-header">
          <div><p className="eyebrow">02 / RESULTS</p><h2>Freshness findings</h2></div>
          <span className="finding-count">{count} {count===1?'CLAIM':'CLAIMS'}</span>
        </div>
        <div className="findings-body">
          {!hasResult&&!busy&&<div className="findings-empty"><FileSearch size={24} aria-hidden="true"/><strong>Ready to review</strong><p>Submit an answer to see the verdict for each claim and the sources behind it.</p></div>}
          {busy&&<p className="analysis-summary">{loadingSaved?'Opening saved results…':'Checking evidence…'}</p>}
          {noClaims&&<p className="analysis-summary" role="status">No factual claims were found. Enter a statement such as “Acme Pro costs USD 20/month.” Questions, headings, code blocks, and opinions are skipped; nothing was verified.</p>}
          {analysis&&<>
            {saved&&<p className="analysis-summary" role="status">Saved assessment from {time(analysis.createdAt)}. This is a previous result, not a new live verification. Source retrieval and assessment times are shown below.</p>}
            {!noClaims&&<p className="analysis-summary">{analysis.status==='partial'?'Partial analysis. Some claims could not be resolved.':'Analysis complete.'}{analysis.omittedClaims>0?` ${analysis.omittedClaims} additional distinct extracted claim(s) were not processed.`:''}</p>}
            {analysis.results.map(result=><ClaimFinding key={result.claim.start} result={result} mode={analysis.mode}/>)}
            <details className="review-disclosure analysis-limits">
              <summary>Analysis limitations</summary>
              <div className="review-disclosure-body">
                {analysis.extraction.fallbackReason&&<p>Extraction fallback: {analysis.extraction.fallbackReason}</p>}
                {status&&<p>Extraction: {status.extractionMode==='rules'?'rules only':'optional model'} · Comparison: {status.comparisonMode==='rules'?'rules-only fallback':status.modelReady?'model configured and allowance available':'model unavailable; cached sources only'}{status.modelDescription?` · ${status.modelDescription}`:''}</p>}
                {analysis.limitations.map(item=><p key={item}>{item}</p>)}
              </div>
            </details>
          </>}
          {fixture?.claims.map(claim=><article className={`claim-card ${claim.outcome}`} key={claim.id}>
            <div className="claim-overview">
              <FindingHeading outcome={claim.outcome} freshness={claim.freshness} claim={claim.text}/>
              <p className="claim-explanation">{claim.uncertainty}</p>
            </div>
            {claim.evidence.length>0&&<section className="finding-sources" aria-label="Sources">
              <h4>Sources <span>{claim.evidence.length}</span></h4>
              {claim.evidence.map(source=><div className="source-evidence" key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={14} aria-hidden="true"/></a>
                <blockquote>{source.excerpt}</blockquote>
              </div>)}
            </section>}
            <p className="fixture-time">Assessed {time(claim.asOf)} · {fixture.mode}</p>
          </article>)}
        </div>
      </section>
    </div>
    <BinaryField/>
  </div>;
}
