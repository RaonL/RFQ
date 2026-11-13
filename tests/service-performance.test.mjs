import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseGroups } from '../site/parser.mjs';
import { normalizeCatalogue, evaluateModel, rankModels, reportText } from '../site/matching.mjs';

execFileSync(process.execPath,['scripts/build.mjs']);
const {models}=normalizeCatalogue(JSON.parse(readFileSync('dist/data/catalogue.json','utf8')),true);
const group=input=>parseGroups(input)[0];
const evaluate=(model,input)=>evaluateModel(models.find(m=>m.model==='F5 '+model),group(input).requirements);

test('published DNS rates match all ten supplied rows and are attributed to DNS Express',()=>{
 const rates=[590000,1100000,1800000,2500000,2700000,3800000,4900000,5000000,5700000,6900000];
 assert.deepEqual(models.filter(m=>m.servicePerformance.dns_qps).map(m=>m.metrics.dns_qps),rates);
 const best=rankModels(models,group('DNS Express Max Query RPS 1.8M 이상').requirements)[0];
 assert.equal(best.model.model,'F5 r4600');assert.equal(best.checks[0].actual,1800000);
 assert.equal(best.checks[0].conditionPending,false);
});

test('GSLB ranks all passing table entries first, with an explicit DNS Express basis',()=>{
 for(const input of ['GSLB 110만 QPS 이상','[GSLB]\nMax Query RPS 1.1M 이상','GSLB RPS\n1100000']){
  const g=group(input),best=rankModels(models,g.requirements)[0];
  assert.equal(best.model.model,'F5 r2800');assert.equal(best.checks.length,1);assert.equal(best.passed,1);
  assert.equal(best.checks[0].actual,1100000);assert.equal(best.allPassed,false);
  assert.match(reportText(g,best),/1,100,000 RPS \(DNS Express 기준\)/);
  const results=rankModels(models,g.requirements);
  assert.equal(results.slice(0,9).every(e=>e.numericCandidate),true);
  assert.equal(results[9].failed,1);assert.ok(results.slice(10).every(e=>e.unknown===1));
 }
 assert.equal(evaluate('r12600-DS','GSLB QPS 1000000').checks[0].actual,null);
 assert.equal(evaluate('r2800','GSLB RPS 110만 초과').failed,1);
 assert.equal(evaluate('r2800','GSLB RPS 110만 이하').passed,1);
 const aboveMax=rankModels(models,group('GSLB RPS 700만 이상').requirements);
 assert.equal(aboveMax.some(e=>e.numericCandidate),false);assert.equal(aboveMax[0].model.model,'F5 r10900');
});

test('SSLO benchmarks are absent from the published catalogue and hardware comparison',()=>{
 assert.ok(models.every(m=>!('sslo' in m.servicePerformance)));
 for(const input of ['SSLO L3 인라인 처리량 10Gbps','SSLO 처리량\n10Gbps 이상',
  'SSL Throughput (SSLO) 10Gbps','BIG-IP SSL Orchestrator\nSSL TPS RSA 2048 7000']){
  const result=evaluate('r2800',input);
  assert.equal(result.checks.length,0,input);assert.equal(result.numericCandidate,false,input);
  assert.ok(result.reviewRequirements.length,input);
 }
});

test('GSLB and hardware SSL still compare when a document includes an SSLO clause',()=>{
 const input='GSLB RPS 110만 이상 SSLO L3 인라인 10Gbps\nSSL TPS (RSA 2048) 7000 이상';
 const best=rankModels(models,group(input).requirements)[0];
 assert.equal(best.model.model,'F5 r2800');assert.deepEqual(best.checks.map(c=>c.key),['gslb_rps','ssl_tps']);
 assert.equal(best.passed,2);assert.equal(best.checks[0].comparisonBasis,'DNS Express 기준');
 assert.equal(evaluate('r2800','SSLO 처리량 10Gbps Memory 32GB').checks[0].key,'memory_gb');
});
