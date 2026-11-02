#!/usr/bin/env python3
"""Explicit, idempotent GitHub bootstrap. Uses gh authentication; never reads tokens."""
import json, subprocess
from pathlib import Path
REPO='farhanakhtar0x66/proofbench'
def api(path, method='GET', data=None):
    args=['gh','api',path,'--method',method]
    if data is not None: args+=['--input','-']
    result=subprocess.run(args,input=json.dumps(data) if data is not None else None,text=True,capture_output=True)
    if result.returncode: raise RuntimeError(result.stderr.strip())
    return json.loads(result.stdout) if result.stdout.strip() else None
repo=api(f'repos/{REPO}')
assert repo['private'], 'Refuse non-private repository'
api(f'repos/{REPO}','PATCH',{'has_issues':True,'has_discussions':False,'has_wiki':False,'allow_squash_merge':True,'allow_merge_commit':False,'allow_rebase_merge':False,'delete_branch_on_merge':True})
labels={
 'owner:farhan':('7057ff','AI systems and integration'), 'owner:aryan':('2da44e','Team leader, product and frontend'),
 'owner:mohit':('0969da','Tavily backend and verification'), 'owner:khushi':('bf8700','Evaluation, research and demo'),
 'priority:P0':('b60205','Blocks initial integration'), 'priority:P1':('d93f0b','Required for prototype'), 'priority:P2':('fbca04','Prototype polish'),
 'area:contracts':('7057ff','Versioned public boundaries'), 'area:runtime':('8250df','Adapters, execution and measurement'),
 'area:frontend':('2da44e','Dashboard and UX'), 'area:verification':('0969da','Claims, retrieval and evidence'),
 'area:evaluation':('bf8700','Datasets, rubric and adversarial tests'), 'area:docs':('57606a','Documentation and demo'),
 'blocked:identity':('c5def5','Exact GitHub handle required for assignment'), 'bug':('d73a4a','Reproducible defect')}
existing={x['name'] for x in api(f'repos/{REPO}/labels?per_page=100')}
for name,(color,description) in labels.items():
 if name not in existing: api(f'repos/{REPO}/labels','POST',dict(name=name,color=color,description=description))
ms=[('M0: Repository and contracts','2026-11-02'),('M1: Independent parallel development','2026-11-05'),('M2: End-to-end integration','2026-11-08'),('M3: Bifrost selection','2026-11-10'),('M4: Judging-ready prototype','2026-11-15')]
milestones={x['title']:x for x in api(f'repos/{REPO}/milestones?state=all&per_page=100')}
for title,date in ms:
 if title not in milestones: milestones[title]=api(f'repos/{REPO}/milestones','POST',{'title':title,'description':'Internal team target (Asia/Kolkata); not a verified organizer cutoff.','due_on':date+'T18:29:00Z'})
profile=api('users/Aryanxp1')
assert profile['name']=='Aryan Vishwakarma', 'Identity needs confirmation'
pending=api(f'repos/{REPO}/invitations')
collabs=api(f'repos/{REPO}/collaborators?per_page=100')
if not any(x['login'].lower()=='aryanxp1' for x in collabs) and not any(x.get('invitee',{}).get('login','').lower()=='aryanxp1' for x in pending):
 api(f'repos/{REPO}/collaborators/Aryanxp1','PUT',{'permission':'push'})
# Personal repositories support collaborator write; fine-grained team leadership is documentary.
items=[
 ('Farhan','Define versioned integration contracts','contracts','P0',0,'Review all ten v1 schemas and publish compatible adapter examples.','Runtime validators, examples and migration policy.','Contract tests reject incompatible versions and missing-as-zero usage.','None; working scaffold supplied'),
 ('Farhan','Review local NeuroMesh framework reference','runtime','P1',0,'Verify the isolated non-research reference and provenance before adapting code.','Allowlist manifest, source revision and component reuse notes.','Source checkout unchanged; no sensitive files tracked; no source reused before licensing/rules review.','None; local ignored snapshot supplied'),
 ('Farhan','Implement native bridge and adapter safety boundary','runtime','P1',1,'Replace the native capability probe with a reviewed bounded bridge if justified.','Portable protocol, process lifecycle and cancellation tests.','No arbitrary shell input; bounded output/time; missing telemetry preserved; offline contract tests pass.','Define versioned integration contracts'),
 ('Farhan','Prepare Bifrost #01 coding-agent adapter','runtime','P1',1,'Integrate the independently built token-efficient coding agent in its isolated module.','Real adapter, dependencies and reproducible sample task evidence.','Actual task checks and provider usage recorded; no synthetic token savings; unavailable features stay unsupported.','Define versioned integration contracts; safety boundary'),
 ('Farhan','Prepare Bifrost #02 benchmark-platform adapter','runtime','P1',1,'Integrate the independently built engine for identical-task actual-agent comparisons.','Real benchmark adapter, task isolation and comparison records.','Agents receive identical task/revision/checks; missing/incomparable usage not ranked; deterministic offline tests.','Define versioned integration contracts; safety boundary'),
 ('Farhan','Establish execution evidence and token measurement correctness','runtime','P0',2,'Prove acceptance and usage observations come from actual execution.','Failed-task fixtures, scoped telemetry mappings and reproducibility report.','Known/missing/estimated/incomparable tested; failed checks and provider/model/revision captured; no missing usage set to zero.','Prepare Bifrost #01 coding-agent adapter OR Prepare Bifrost #02 benchmark-platform adapter'),
 ('Aryan','Refine frontend app and component architecture','frontend','P1',1,'As team leader, own frontend architecture and UI composition within stable contracts.','Component boundaries, accessible charcoal/mint shell and documented conventions.','Runs against frontend fixtures with no Rust/backend; keyboard navigation works; no runtime-internal types imported.','Define versioned integration contracts; scaffold supplied'),
 ('Aryan','Implement benchmark dashboard with mocked runs','frontend','P1',1,'Build the full dashboard against versioned mock API responses.','Run ledger, completion, usage/timing and empty/loading/error/partial states.','Unknown telemetry visibly unknown; responsive table; mock results unmistakably labeled; browser tests pass.','Refine frontend app and component architecture'),
 ('Aryan','Build agent trace and comparison views','frontend','P1',2,'Make execution evidence and comparisons inspectable.','Trace inspector, failed acceptance evidence and reproducibility metadata.','Cannot rank missing/incomparable token values; two-run selection and trace errors tested.','Implement benchmark dashboard with mocked runs'),
 ('Aryan','Integrate Tavily verification results into UI','frontend','P1',2,'Expose independent answer verification and source inspection.','Verification form, claims, uncertainty, outcomes, timestamps and source links.','Supported/contradicted/inconclusive and no-evidence states render; credentials never reach client.','Implement /api/verify persistence and API integration'),
 ('Aryan','Implement responsive design and UI tests','frontend','P1',2,'Validate core workflows on phone and desktop with accessible controls.','Browser tests and documented keyboard/mobile checks.','Loading/error/empty/unknown/partial states covered; no horizontal page overflow; citations usable.','Implement benchmark dashboard with mocked runs; integrate verification UI'),
 ('Aryan','Coordinate integration reviews and one-track selection','docs','P0',3,'Lead integration reviews and coordinate final Bifrost selection.','Selection record, reviewer sign-offs, release checklist and pinned demo revision.','Select exactly ONE Bifrost plus Tavily #01; integrated demo completed before deadline; CI/reviews recorded.','Execution measurement evidence; evaluation acceptance rubric'),
 ('Mohit','Implement claim extraction from arbitrary answers','verification','P1',1,'Replace sentence-only mock extraction with testable atomic claims and temporal metadata.','Standalone extractor, optional metadata support and bounded input tests.','Multi-claim, historical, ambiguous and non-factual text handled; claim spans preserved; no credentials needed for unit tests.','Define versioned integration contracts'),
 ('Mohit','Implement metered Tavily search and content retrieval','verification','P1',1,'Add explicitly enabled Search/Extract retrieval with server-side credentials.','Provider interface, offline recorded mocks, request caps and retrieval attribution.','No paid calls without authorization; timeout/SSRF controls; no keys in UI/logs; retrieval errors tested.','Implement claim extraction; explicit budget authorization for live experiments'),
 ('Mohit','Implement freshness evidence evaluation','verification','P0',2,'Assess scoped claims using attributable source evidence rather than similarity.','Supported/contradicted/inconclusive logic, temporal scope and uncertainty rules.','Historical truths not labeled stale; conflicting/insufficient evidence abstains; holdout error analysis attached.','Metered retrieval; Khushi acceptance rubric'),
 ('Mohit','Implement /api/verify persistence and API integration','verification','P1',2,'Replace offline verifier behind stable independent HTTP contracts.','POST/GET verification integration, validated durable records and sanitized failures.','Restart persistence, malformed inputs, absent IDs and error handling tested; works with mock/01/02 adapters.','Claim extraction; freshness evidence evaluation; storage scaffold supplied'),
 ('Mohit','Add verifier unit tests with offline mocks','verification','P1',1,'Make verifier development possible without permanent API access.','Deterministic offline retrieval fixtures and unit suite.','No network/paid calls in CI; missing evidence, contradictory sources and API failures covered.','Claim extraction; provider interface'),
 ('Mohit','Integrate independent evaluation fixtures','verification','P1',2,'Run Khushi\'s independently labeled cases automatically.','Evaluation runner integration, confusion counts and per-case diagnostics.','Holdout not used as lookup source; precision and abstention/coverage reported; failures linked to evidence.','Khushi dataset and rubric; freshness evidence evaluation'),
 ('Khushi','Build source-backed freshness evaluation dataset','evaluation','P1',1,'Own a separately labeled holdout across pricing, APIs, releases and documentation.','Statements, dates/versions, outcomes, sources, explanations and uncertainty.','Authoritative sources independently checked/dated; stale/current/ambiguous cases included; no holdout leakage into mock lookup.','Fixture format in docs/EVALUATION.md'),
 ('Khushi','Design acceptance rubric and false-positive analysis','evaluation','P0',1,'Define acceptance beyond headline accuracy and identify unsafe definitive claims.','Team-approved precision/coverage rubric, confusion categories and adversarial cases.','Historical facts, ambiguous pricing, conflicting docs, release vs announcement tested; proposed thresholds distinguished from measurements.','Build source-backed freshness evaluation dataset'),
 ('Khushi','Test source attributions and freshness decisions','evaluation','P1',2,'Audit citations and temporal decisions with inspectable evidence.','Reproducible evaluation report and prioritized false-positive issues.','Every definitive finding has supporting/contradicting authoritative evidence; uncertainty and annotation disagreements recorded.','Dataset; rubric; Mohit evaluation integration'),
 ('Khushi','Prepare reproducible judging demo scenarios','evaluation','P1',4,'Build demonstrations that expose useful behavior and honest limitations.','Scenario inputs, expected outputs, reset instructions and offline fallback.','Run demo from clean install; include stale, current, inconclusive, failed execution and missing-token examples.','Selected Bifrost integration; verification and UI workflows'),
 ('Khushi','Draft technical and product documentation','docs','P1',4,'Explain user problem, architecture, evaluation evidence and limitations.','Product explanation, methods, measured results and source/reuse disclosure review.','No unmeasured claims or dual-Bifrost submission; independent reproduction instructions checked.','Evaluation report; selected integration'),
 ('Khushi','Prepare judging presentation and submission checklist','docs','P1',4,'Coordinate judging evidence and final asset readiness with Aryan.','Presentation, demo assets, repository/demo access checklist and final rehearsal notes.','Accuracy limits and reuse disclosed; prototype runs; official cutoff/timezone confirmed; team leader signs submission checklist.','Demo scenarios; technical/product docs'),
 ('Aryan','Confirm official submission cutoff and pre-existing code rules','docs','P0',0,'Verify exact organizer submission deadline/timezone and code-reuse eligibility.','Official rules links or written organizer confirmation and updated track/reuse docs.','Distinguish Nov 15 registration/internal target from official cutoff; no NeuroMesh reuse approved without rules/provenance evidence.','None; public event page incomplete')
]
existing_issues={x['title']:x for x in api(f'repos/{REPO}/issues?state=all&per_page=100') if 'pull_request' not in x}
results=[]
for owner,title,area,priority,m,objective,deliverables,acceptance,dependencies in items:
 full=f'[{owner}] {title}'
 body=f'## Objective\n{objective}\n\n## Owner\n{owner}'+(' — @farhanakhtar0x66' if owner=='Farhan' else ' — @Aryanxp1 (invitation may be pending)' if owner=='Aryan' else ' — GitHub handle pending; intentionally unassigned')+f'\n\n## Deliverables\n{deliverables}\n\n## Acceptance criteria\n- [ ] {acceptance}\n\n## Dependencies\n{dependencies}\n\n## Priority\n{priority}\n\n## Milestone\n{ms[m][0]}\n'
 tags=[f'owner:{owner.lower()}',f'area:{area}',f'priority:{priority}']
 if owner in ['Mohit','Khushi']:tags+=['blocked:identity']
 data={'title':full,'body':body,'labels':tags,'milestone':milestones[ms[m][0]]['number']}
 if owner=='Farhan':data['assignees']=['farhanakhtar0x66']
 # Pending invitees cannot be assigned yet; retain named ownership in body/labels.
 if owner=='Aryan' and any(x['login'].lower()=='aryanxp1' for x in collabs):data['assignees']=['Aryanxp1']
 issue=existing_issues.get(full) or api(f'repos/{REPO}/issues','POST',data)
 results.append({'number':issue['number'],'title':full,'url':issue['html_url']})
 print(f"#{issue['number']} {full}",flush=True)
Path('.local/github-issues.json').write_text(json.dumps(results,indent=2)+'\n')
pending=api(f'repos/{REPO}/invitations')
Path('.local/github-invitations.json').write_text(json.dumps([{'login':i['invitee']['login'],'permissions':i['permissions'],'id':i['id']} for i in pending],indent=2)+'\n')
print(f'{len(results)} issues; {len(milestones)} milestones; {len(labels)} configured labels; invitations: '+','.join(i['invitee']['login'] for i in pending))
