import {expect,it,vi} from 'vitest';
import {practiceVerification} from '../scripts/practice-lib';

it.each([
 {sources:['Acme Pro costs USD 20/month.','The monthly price of Acme Pro is USD 20.'],expected:'supported'},
 {sources:['Acme Pro costs USD 25/month.','The monthly price of Acme Pro is USD 25.'],expected:'contradicted'},
 {sources:['Acme Pro costs USD 20/month.','Acme Pro costs USD 25/month.'],expected:'inconclusive'},
 {sources:['',''],expected:'inconclusive'},
])('runs offline practice with $expected evidence',async({sources,expected})=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Real network forbidden'));
 try{
  const result=await practiceVerification('Acme Pro costs USD 20/month.',sources as [string,string]);
  expect(result.simulated).toBe(true);expect(result.outcome).toBe(expected);
  expect(result.explanation).toContain('SIMULATED');expect(network).not.toHaveBeenCalled();
  expect(result.freshnessScore).toBe(expected==='supported'?100:expected==='contradicted'?0:null);
 }finally{network.mockRestore();}
});
