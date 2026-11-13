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

test('explicit GSLB queries show a labelled reference and can never pass on DNS Express alone',()=>{
 for(const input of ['GSLB 110만 QPS 이상','[GSLB]\nMax Query RPS 1.1M 이상','GSLB RPS\n1100000']){
  const g=group(input),best=rankModels(models,g.requirements)[0];
  assert.equal(best.model.model,'F5 r2800');assert.equal(best.checks.length,1);assert.equal(best.unknown,1);
  assert.equal(best.checks[0].actual,null);assert.equal(best.checks[0].referenceValue,1100000);
  assert.match(reportText(g,best),/DNS Express 참고 1,100,000 RPS/);
 }
 assert.equal(evaluate('r12600-DS','GSLB QPS 1000000').checks[0].referenceValue,null);
});

test('published SSLO records select the service chain, units and TPS direction independently',()=>{
 const inputs=[
  ['SSLO L3 inline throughput 4800Mbps',4.8],
  ['SSLO receive only outbound 6.7K TPS',6700],
  ['[SSLO]\n인바운드 L3 인라인 + L2 1개 TPS 10,300 이상',10300],
  ['BIG-IP SSL Orchestrator L3 inline + (2) L2 services outbound TPS\n5000',5000],
 ];
 for(const [input,actual] of inputs){
  const e=evaluate('r2800',input);assert.equal(e.checks.length,1,input);
  assert.equal(e.checks[0].actual,actual,input);assert.equal(e.passed,1,input);
  assert.match(e.checks[0].sourceUrl,/ssl-orchestrator-datasheet/);
 }
 assert.equal(evaluate('r2800','SSLO L3 인라인 처리량 5Gbps 이상').failed,1);
 assert.equal(evaluate('r5900','SSLO L3 inline inbound TPS 53.4K').checks[0].actual,53400);
 assert.equal(evaluate('r10900','SSLO L3 inline 처리량 37.7Gbps').checks[0].actual,37.7);
 const aboveMaximum=rankModels(models,group('SSLO L3 inline 처리량 40Gbps 이상').requirements)[0];
 assert.equal(aboveMaximum.model.model,'F5 r10900');assert.equal(aboveMaximum.failed,1);
});

test('missing topology, directions and unpublished models cannot inherit generic SSL performance',()=>{
 for(const [model,input] of [['r2800','SSLO 처리량 4Gbps'],['r4800','SSLO L3 inline TPS 10000'],['r2600','SSLO L3 인라인 처리량 1Gbps']]){
  const e=evaluate(model,input);assert.equal(e.unknown,1);assert.equal(e.checks[0].actual,null);
 }
 const mixed=evaluate('r2800','GSLB QPS 1M SSLO L3 inline throughput 4Gbps');
 assert.equal(mixed.checks.length,2);assert.equal(mixed.passed,1);assert.equal(mixed.unknown,1);
});
