import {expect,it,vi} from 'vitest';
import {evaluateGeneralScenarios} from '../scripts/general-evaluation-lib';
it('runs cross-topic pipeline regressions without network and restores caller environment/fetch',async()=>{
 const original=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network forbidden'));
 const previous=process.env.LANGUAGE_MODE;process.env.LANGUAGE_MODE='caller-setting';
 try{
  const result=await evaluateGeneralScenarios();
  expect(result.summary.passed).toBe(result.summary.total);expect(result.summary.total).toBe(14);expect(result.externalRequests).toBe(0);
  expect(original).not.toHaveBeenCalled();expect(globalThis.fetch).toBe(original);expect(process.env.LANGUAGE_MODE).toBe('caller-setting');
 }finally{original.mockRestore();if(previous===undefined)delete process.env.LANGUAGE_MODE;else process.env.LANGUAGE_MODE=previous;}
},20000);
