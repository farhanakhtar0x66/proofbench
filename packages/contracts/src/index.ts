import {z} from 'zod';
export const VERSION='1' as const;
const version=z.literal(VERSION);
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const date=z.string().datetime();
export const UsageObservation=z.discriminatedUnion('status',[
 z.object({status:z.literal('known'),value:z.number().nonnegative().finite(),unit:z.enum(['tokens','ms','USD']),source:z.string().min(1),scope:z.string().min(1)}).strict(),
 z.object({status:z.literal('estimated'),value:z.number().nonnegative().finite(),unit:z.enum(['tokens','ms','USD']),source:z.string().min(1),method:z.string().min(1),scope:z.string().min(1)}).strict(),
 z.object({status:z.literal('missing'),reason:z.string().min(1)}).strict(),
 z.object({status:z.literal('incomparable'),reason:z.string().min(1)}).strict(),
]);
export const TaskSpec=z.object({version,id,title:z.string().min(1).max(200),prompt:z.string().min(1).max(20000),acceptance:z.array(z.string().min(1)).min(1),fixtureId:id.optional()}).strict();
export const AgentDescriptor=z.object({version,id,name:z.string(),implementation:z.enum(['mock','01','02']),runtime:z.enum(['mock','typescript','rust']),revision:z.string(),model:z.string().nullable()}).strict();
export const RunRequest=z.object({version,task:TaskSpec,agentId:id,seed:z.number().int().nonnegative().default(0)}).strict();
export const UsageRecord=z.object({version,inputTokens:UsageObservation,outputTokens:UsageObservation,duration:UsageObservation,cost:UsageObservation}).strict().superRefine((record,ctx)=>{
 for(const [field,unit] of [['inputTokens','tokens'],['outputTokens','tokens'],['duration','ms'],['cost','USD']] as const){
  const observation=record[field];
  if((observation.status==='known'||observation.status==='estimated')&&observation.unit!==unit)ctx.addIssue({code:z.ZodIssueCode.custom,path:[field,'unit'],message:`Expected ${unit} for ${field}`});
 }
});
export const AcceptanceResult=z.object({version,status:z.enum(['passed','failed','unknown']),checks:z.array(z.object({name:z.string(),passed:z.boolean().nullable(),evidence:z.string()})),method:z.string()}).strict();
export const ExecutionTrace=z.object({version,runId:id,events:z.array(z.object({sequence:z.number().int().nonnegative(),at:date,type:z.enum(['start','output','check','error','finish']),message:z.string(),data:z.record(z.unknown()).optional()}))}).strict();
export const VerificationSource=z.object({url:z.string().url(),title:z.string(),retrievedAt:date.nullable(),recordedAt:date.optional(),publishedAt:date.optional(),updatedAt:date.optional(),effectiveAt:date.optional(),dateReason:z.string().optional(),excerpt:z.string(),relation:z.enum(['supports','contradicts','context']),retrieval:z.enum(['fixture','tavily']),sourceTier:z.enum(['official_direct','reviewed_secondary','likely_official','unreviewed']).optional(),sourceReason:z.string().optional(),duplicateOf:z.string().url().optional(),corroborationGroup:z.string().optional()});
export const ClaimVerification=z.object({version,id,text:z.string(),timeSensitive:z.enum(['yes','no','unknown']),outcome:z.enum(['supported','contradicted','inconclusive']),freshness:z.enum(['current','stale','unknown']),freshnessScore:z.number().int().min(0).max(100).nullable().optional(),asOf:date,uncertainty:z.string(),evidence:z.array(VerificationSource)}).strict();
export const VerificationReport=z.object({version,id,mode:z.enum(['mock','live']),createdAt:date,text:z.string(),claims:z.array(ClaimVerification)}).strict();
export const VerifyRequest=z.object({version,text:z.string().trim().min(1).max(20000),claims:z.array(z.object({text:z.string().trim().min(1).max(2000),asOf:date.optional()})).max(50).optional()}).strict();
export const RunRecord=z.object({version,id,task:TaskSpec,agent:AgentDescriptor,status:z.enum(['completed','failed']),output:z.string(),usage:UsageRecord,acceptance:AcceptanceResult,createdAt:date,reportId:id,reproducibility:z.object({seed:z.number().int(),adapterRevision:z.string(),fixtureRevision:z.string(),environment:z.string(),simulated:z.boolean()})}).strict();
export const EvidenceReport=z.object({version,id,runId:id,createdAt:date,summary:z.string(),acceptance:AcceptanceResult,usage:UsageRecord,verification:VerificationReport.nullable(),limitations:z.array(z.string())}).strict();
export const Capabilities=z.object({version,implementation:z.enum(['mock','01','02']),agent:AgentDescriptor,capabilities:z.object({execute:z.boolean(),benchmarks:z.boolean(),verify:z.boolean(),native:z.boolean()}),limitations:z.array(z.string())}).strict();
export type TaskSpec=z.infer<typeof TaskSpec>;
export type AgentDescriptor=z.infer<typeof AgentDescriptor>;
export type RunRequest=z.infer<typeof RunRequest>;
export type RunRecord=z.infer<typeof RunRecord>;
export type ExecutionTrace=z.infer<typeof ExecutionTrace>;
export type UsageRecord=z.infer<typeof UsageRecord>;
export type ClaimVerification=z.infer<typeof ClaimVerification>;
export type VerificationReport=z.infer<typeof VerificationReport>;
export type VerifyRequest=z.infer<typeof VerifyRequest>;
export type EvidenceReport=z.infer<typeof EvidenceReport>;
export type Capabilities=z.infer<typeof Capabilities>;
export interface AgentAdapter {
 descriptor:AgentDescriptor;
 capabilities:Capabilities['capabilities'];
 run(request:RunRequest):Promise<{run:RunRecord;trace:ExecutionTrace}>;
}
export class UnsupportedCapability extends Error {}
