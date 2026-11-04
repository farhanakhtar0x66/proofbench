import {expect,it} from 'vitest';
import {selectSourcePassages} from '../packages/tavily/src/source-passages';
import {selectEvidenceExcerpt} from '../packages/tavily/src/excerpts';

it.each([
 ['Acme is the parent company of Orbit.','Acme is the parent company of Orbit.','The parent company publishes reports.'],
 ['Aurora launched the Meridian satellite.','Aurora launched the Meridian satellite.','A satellite launched during another mission.'],
 ['Lumen acquired the Harbor business.','Lumen acquired the Harbor business.','The business acquired additional equipment.'],
])('does not treat omitted weaker background as missing evidence: %s',(claim,direct,background)=>{
 const content=`${direct}\n${Array.from({length:35},(_,index)=>`Background ${index}: ${background.repeat(10)}`).join('\n')}`;
 const result=selectEvidenceExcerpt(claim,content);
 expect(result.excerpt).toContain(direct);expect(result.selection.warning).toBeUndefined();
});
it('still warns when equally strong evidence is omitted',()=>{
 const result=selectSourcePassages(Array.from({length:30},(_,index)=>`Evidence ${index}: ${'Complete relevant statement. '.repeat(15)}`).join('\n'),()=>5);
 expect(result.warning).toContain('potentially relevant');
});
it('still warns when weaker contradictory or qualifying evidence cannot fit',()=>{
 const direct=`Strong explicit evidence. ${'Complete sentence. '.repeat(90)}`;
 const denial=`However, this is not the current policy. ${'Qualification details. '.repeat(100)}`;
 const result=selectSourcePassages(`${direct}\n${denial}`,text=>text.includes('Strong')?5:2);
 expect(result.warning).toBeDefined();
});
