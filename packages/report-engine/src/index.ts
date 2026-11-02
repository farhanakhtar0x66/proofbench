import {EvidenceReport,type RunRecord} from '../../contracts/src/index';
export function buildReport(run:RunRecord):EvidenceReport {
 return EvidenceReport.parse({version:'1',id:run.reportId,runId:run.id,createdAt:run.createdAt,summary:`${run.task.title}: ${run.acceptance.status}`,acceptance:run.acceptance,usage:run.usage,verification:null,limitations:run.reproducibility.simulated?['Offline fixture only; this is not an AI-agent benchmark.']:['Compare token observations only within matching scope and measurement method.']});
}
