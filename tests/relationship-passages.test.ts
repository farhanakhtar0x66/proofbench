import {expect,it} from 'vitest';
import {selectEvidenceExcerpt} from '../packages/tavily/src/excerpts';
import {relationshipPassageScore} from '../packages/tavily/src/relationship-passages';

it.each([
 ['Parent company of Harbor is Aster.','Aster is the parent company of Harbor.'],
 ['The parent firm of Meridian is Cedar.','Cedar is the parent firm of Meridian.'],
 ['Aster owns Harbor.','Another Group owns Harbor.'],
 ['Harbor is owned by Aster.','Harbor is owned by Another Group.'],
 ['Harbor is a subsidiary of Aster.','Harbor is an independent company.'],
 ["Harbor's parent company is Aster.",'Another Group is the parent company of Harbor.'],
])('ranks matching relationships without assuming the claimed owner is correct: %s',(claim,text)=>{
 expect(relationshipPassageScore(claim,text)).toBe(10);
});
it('rejects a statement about ownership of the claimed parent instead of the target company',()=>{
 expect(relationshipPassageScore('Parent company of Harbor is Aster.','Investors own shares in Aster.')).toBe(0);
 expect(relationshipPassageScore('Aster owns Harbor.','Aster owns a different business.')).toBe(0);
});
it('selects the relationship from a long financial article with repeated profile blocks',()=>{
 const statement='Aster is the parent company of Harbor.';
 const finance=Array.from({length:20},(_,i)=>`Investor ${i} owns shares in Aster. ${'The investment portfolio grew. '.repeat(10)}`).join('\n');
 const profile=Array.from({length:10},()=>`Company Profile\n${statement}\nRead More`).join('\n');
 const result=selectEvidenceExcerpt('Parent company of Harbor is Aster.',`${finance}\n${profile}`);
 expect(result.excerpt).toContain(statement);expect(result.selection.warning).toBeUndefined();
 expect(result.excerpt.match(/Aster is the parent company of Harbor\./gu)).toHaveLength(1);
});
it('does not discard a repeated statement whose nearby context qualifies it',()=>{
 const statement='Aster is the parent company of Harbor.';
 const content=`${'Menu item\n'.repeat(300)}Company Profile\n${statement}\nRead More\nCompany Profile\n${statement}\nHowever, this relationship is disputed and may have ended.`;
 const result=selectEvidenceExcerpt('Parent company of Harbor is Aster.',content);
 expect(result.excerpt).toContain('However, this relationship is disputed');
});
