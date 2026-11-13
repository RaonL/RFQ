import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseGroups,parseRequirements} from '../site/parser.mjs';
import {normalizeCatalogue,evaluateModel,rankModels,reportText,materialQuestions} from '../site/matching.mjs';

// Same requirement values as the reported failure; customer details are synthetic.
const rfq=`고객사 : 예시 고객
설치장소 : 본부(예시), DR센터(예시)
수량 : 2식
인터페이스
- 1G/10G/25G SFP+ 4Port 이상 제공
- 1G/10G UTP 4Port 이상 제공
별도 관리용 Management Port 지원
SSD Storage : 480GB 이상
전원부, FAN 이중화 및 Hot-Swap, Fan Tray 기능 제공
L4 Throughput : 양방향 20Gbps 이상 제공
L7 Throughput : 양방향 13Gbps 이상 제공
Concurrent Connection: 19M 이상 제공
L4 CPS : 170,000 cps 이상
L4 RPS : 850,000 rps 이상
L7 RPS : 475,000 rps 이상
Maximum Query RPS : 590,000 이상
SSL 2K TPS : 7,000 TPS 이상
ECDSA TPS : 5,000 TPS 이상
SSL Throughput : 8Gbps 이상
이상입니다.`;
const reference=JSON.parse(await readFile(new URL('../data/reference_data.json',import.meta.url),'utf8'));
const {models}=normalizeCatalogue(reference);
const r2600=models.find(m=>m.model==='F5 r2600');
const fieldVariants=JSON.parse(await readFile(new URL('fixtures/field-rfq.json',import.meta.url),'utf8'));
const performance=JSON.parse(await readFile(new URL('../data/service_performance.json',import.meta.url),'utf8'));
const catalogue=normalizeCatalogue({...reference,f5_models:reference.f5_models.map(m=>({...m,servicePerformance:performance[m.model]}))});
function outcome(text){
 const [group]=parseGroups(text);
 return {
  quantity:group.quantity,
  questions:[...materialQuestions(catalogue.models,group.requirements)].map(r=>r.key),
  features:group.requirements.filter(r=>r.kind==='boolean').map(r=>r.key).sort(),
  ranking:rankModels(catalogue.models,group.requirements).map(e=>({
   model:e.model.model,candidate:e.numericCandidate,
   checks:e.checks.map(c=>[c.key,c.operator,c.value,c.unit,c.algorithm,c.context,c.status,c.conditionPending]).sort(([a],[b])=>a.localeCompare(b))
  }))
 };
}
for(const [style,lines] of Object.entries(fieldVariants)){
 test(`field RFQ preserves all thresholds, rankings and clarification prompts: ${style}`,()=>{
  assert.deepEqual(outcome(lines.join('\n')),outcome(rfq));
 });
}
test('a stricter boundary or a different RSA key does change compliance',()=>{
 for(const [before,after] of [['엘포는 20기가','엘포는 20기가 초과'],['RSA 2048 기준','RSA 4096 기준']]){
  const changed=fieldVariants['통화 메모'].join('\n').replace(before,after);
  const r=outcome(changed).ranking.find(e=>e.model==='F5 r2600');
  assert.equal(r.candidate,false,after);
 }
});

test('reported RFQ ranks r2600 using 13 numerical conditions, with ancillary review separate',()=>{
 const group=parseGroups(rfq)[0],results=rankModels(models,group.requirements),best=results[0];
 assert.equal(group.quantity,'2식');assert.equal(best.model.model,'F5 r2600');
 assert.equal(best.numericCandidate,true);assert.equal(best.passed,13);assert.equal(best.failed,0);assert.equal(best.unknown,0);
 assert.equal(best.checks.length,13);assert.ok(best.reviewRequirements.length>0);assert.equal(best.allPassed,false);
 assert.equal(best.checks.find(c=>c.key==='dns_qps').conditionPending,true);
 assert.equal(best.checks.find(c=>c.key==='ecdsa_tps').conditionPending,true);
 const report=reportText(group,best);assert.match(report,/수치.*13/);assert.doesNotMatch(report,/고객사|설치장소|이상입니다/);
});
test('customer metadata and greetings do not create comparison or review rows',()=>{
 assert.deepEqual(parseRequirements('고객사 : 예시\n설치장소 : 본부(123), DR센터\n수량 : 2식\n이상입니다.'),[]);
});
test('CPS unit after a value does not become a second requirement',()=>{
 const requirements=parseRequirements('L4 CPS : 170,000 cps 이상');
 assert.equal(requirements.length,1);assert.equal(requirements[0].value,170000);
});
test('a distinct CPS metric after a bare throughput value is preserved',()=>{
 const requirements=parseRequirements('L4 Throughput 20 CPS 170000 이상');
 assert.equal(requirements.find(r=>r.key==='l4_gbps')?.value,20);
 assert.equal(requirements.find(r=>r.key==='l4_cps')?.value,170000);
});
test('GSLB does not fall back to legacy values when the supplied table is absent',()=>{
 const group=parseGroups('[DNS GSLB]\nMaximum Query RPS 300000 이상')[0];
 assert.equal(evaluateModel(r2600,group.requirements).numericCandidate,false);
});
test('feature requirements and qualitative text do not veto a numerical candidate',()=>{
 const result=evaluateModel(r2600,parseRequirements('L4 Throughput 20Gbps 이상\n전원/FAN 이중화\n관리 포트 지원\n특수 인증서 제출 필수'));
 assert.equal(result.numericCandidate,true);assert.equal(result.checks.length,1);assert.equal(result.unknown,0);
 assert.ok(result.reviewRequirements.some(r=>r.key==='management_port'));assert.equal(result.allPassed,false);
});
test('numerical shortfall still excludes a candidate with ancillary features present',()=>{
 const result=evaluateModel(r2600,parseRequirements('L7 Throughput 40Gbps 이상\n전원/FAN 이중화'));
 assert.equal(result.numericCandidate,false);assert.equal(result.failed,1);assert.equal(result.unknown,0);
});
test('missing or unparseable numeric requirements stay in the comparison',()=>{
 for(const input of ['Memory','Memory 32FOO 이상','L4 Throughput 20~40Gbps','L7 Throughput']){
  const result=evaluateModel(r2600,parseRequirements('Storage 480GB 이상\n'+input));
  assert.equal(result.numericCandidate,false,input);assert.ok(result.unknown>0,input);
 }
});
test('unknown model numbers are not replaced with zero or silently ignored',()=>{
 const result=evaluateModel(models.find(m=>m.model==='F5 r2800'),parseRequirements('L4 RPS 850000 이상'));
 assert.equal(result.numericCandidate,false);assert.equal(result.checks[0].actual,null);assert.equal(result.unknown,1);
});
test('unspecified DNS and ECDSA conditions allow provisional numbers but explicit mismatches do not',()=>{
 for(const input of ['Maximum Query RPS 590000 이상','ECDSA TPS 5000 이상']){
  const result=evaluateModel(r2600,parseRequirements(input));assert.equal(result.numericCandidate,true,input);
  assert.equal(result.checks[0].conditionPending,true);assert.equal(result.allPassed,false);
 }
 for(const input of ['DNS GSLB QPS 300000 이상','ECDSA P-384 TPS 5000 이상','SSL TPS RSA 4096 7000 이상']){
  assert.equal(evaluateModel(r2600,parseRequirements(input)).numericCandidate,false,input);
 }
});
test('a list of features alone cannot produce a numeric candidate',()=>{
 const result=evaluateModel(r2600,parseRequirements('관리 포트 지원\n전원/FAN 이중화'));
 assert.equal(result.numericCandidate,false);assert.equal(result.checks.length,0);
});
