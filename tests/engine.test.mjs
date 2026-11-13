import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGroups, parseRequirements } from '../site/parser.mjs';
import { normalizeModel, evaluateModel, rankModels, normalizeCatalogue } from '../site/matching.mjs';
const value = (t, k) => parseRequirements(t).find(r => r.key === k)?.value;
const raw = {model:'F5 r2600', tier:1, specs:{'L4/L7 Throughput':'20G / 13G','L4 CPS':'170K','L7 RPS (HTTP)':'475K','SSL TPS (RSA 2K)':'7K','동시 커넥션':'19M','인터페이스':'4x 25G/10G SFP28, 4x 10G/1G Copper',Memory:'32 GB',Storage:'480GB M.2 SSD'}};
const model = () => normalizeModel(raw);
test('failure explanations use the comparison direction, strict boundary and original unit',()=>{
 for(const [source,expected] of [
  ['L4 Throughput 21Gbps 이상','1 Gbps 부족'],
  ['L4 Throughput 16Gbps 이하','4 Gbps 초과'],
  ['L4 Throughput 20Gbps 초과','등록값이 경계값과 같습니다. 20 Gbps 초과가 필요합니다.'],
  ['L4 Throughput 20Gbps 미만','등록값이 경계값과 같습니다. 20 Gbps 미만이 필요합니다.'],
  ['L4 Throughput 정확히 21.25Gbps','1.25 Gbps 부족']
 ]){
  const [check]=evaluateModel(model(),parseRequirements(source)).checks;
  assert.equal(check.status,'fail');assert.equal(check.explanation,expected);
 }
});
test('unknown explanations distinguish missing hardware data, test basis and input',()=>{
 const evaluate=source=>evaluateModel(model(),parseRequirements(source)).checks[0];
 assert.match(evaluate('CPU 주파수 2GHz 이상').explanation,/등록값이 없습니다/);
 assert.match(evaluate('SSL TPS (RSA 4096) 7000 이상').explanation,/RSA 4096.*없습니다.*RSA 2048/);
 assert.match(evaluate('L4 Throughput').explanation,/수치가 빠져/);
 assert.match(evaluate('Throughput 17Gbps 이상').explanation,/L4.*L7.*기준/);
 assert.match(evaluate('Throughput 22Gbps 이상').explanation,/L4.*2 Gbps 부족\nL7.*9 Gbps 부족/);
 const portChecks=evaluateModel(model(),parseRequirements('25G SFP28 4Port 이상\n10G SFP+ 2Port 이상')).checks;
 assert.equal(portChecks.find(c=>c.key==='physical_ports').explanation,'동시에 할당할 물리 포트 2개 부족');
});
const cases = [
 ['L4 Throughput 20Gbps 이상 L7 Throughput 40Gbps 이상','l7_gbps',40],
 ['SSL TPS (RSA 2048bit) 10000 이상','ssl_tps',10000],
 ['SSL TPS (RSA 2K) 7000 이상','ssl_tps',7000],
 ['SSL RSA 2048 TPS 10K 이상','ssl_tps',10000],
 ['Memory 32000MB 이상','memory_gb',32],
 ['DISK SSD 2TB 이상','ssd_gb',2000],
 ['Memory 32GiB 이상','memory_gb',34.359738368],
 ['CPU 2.4GHz 8Core 이상','cpu_cores',8],
 ['CPU 2.4GHz 8Core 이상','cpu_ghz',2.4],
 ['CPU/Memory\n요구규격: 4 Core/32GB 이상\n제품사양: 8 Core/64GB','memory_gb',32],
 ['L4/L7 Throughput 20Gbps / 13Gbps 이상','l4_gbps',20],
 ['L4/L7 Throughput\n20G / 13G 이상','l7_gbps',13],
 ['동시 커넥션 2,400만 CC 이상','concurrent_connections',24000000],
 ['동시 세션 1.5억 이상','concurrent_connections',150000000],
 ['L4 Throughput 1000Mbps 이상','l4_gbps',1],
 ['L7 Throughput 1Tbps 이상','l7_gbps',1000],
 ['L4 HTTP RPS 850K 이상 L7 RPS 475K 이상','l4_rps',850000],
 ['40G 6포트 이상 10G 12포트 이상','sfp_plus_10g_ports',12],
 ['25G SFP28 4Port 이상','sfp28_25g_ports',4],
 ['10G Copper 4Port 이상','copper_10g_ports',4]
];
for (const [text,key,expected] of cases) test(`extract ${key}: ${text}`, () => assert.ok(Math.abs(value(text,key)-expected)<1e-8,JSON.stringify(parseRequirements(text))));
test('same-line missing performance cannot pass',()=> assert.equal(evaluateModel(model(),parseRequirements('L4 Throughput 20Gbps 이상 L7 Throughput 40Gbps 이상')).numericCandidate,false));
test('linebreak does not change metric pairs',()=> assert.deepEqual(parseRequirements('L4 Throughput 20Gbps 이상 L7 Throughput 40Gbps 이상').filter(r=>r.kind==='numeric').map(r=>[r.key,r.value]),parseRequirements('L4 Throughput 20Gbps 이상\nL7 Throughput 40Gbps 이상').filter(r=>r.kind==='numeric').map(r=>[r.key,r.value])));
test('qualitative tail remains reviewable without vetoing numeric comparison',()=>{const r=evaluateModel(model(),parseRequirements('L4 Throughput 20Gbps 이상 특수 인증서 제출 필수'));assert.equal(r.numericCandidate,true);assert.ok(r.reviewRequirements.some(r=>/인증서/.test(r.source)));assert.equal(r.allPassed,false);});
test('missing heading is never discarded',()=>assert.ok(parseRequirements('L4 Throughput\nL7 Throughput 13Gbps').some(r=>r.kind==='unknown'&&/L4/.test(r.source))));
test('RSA4096 cannot use RSA2048 figure',()=>assert.equal(evaluateModel(model(),parseRequirements('SSL TPS 7000 이상 RSA 4096')).checks[0].status,'unknown'));
test('unspecified SSL algorithm is unknown',()=>assert.equal(evaluateModel(model(),parseRequirements('SSL TPS 7000 이상')).checks[0].status,'unknown'));
test('RSA2048 numeric comparison works but evidence not certified',()=>{let r=evaluateModel(model(),parseRequirements('SSL TPS (RSA 2048bit) 7000 이상'));assert.equal(r.numericCandidate,true);assert.equal(r.allPassed,false);});
test('upper bound preserved',()=>{let r=parseRequirements('SSD 1TB 이하');assert.equal(r[0].operator,'<=');assert.equal(evaluateModel(model(),r).checks[0].status,'pass');});
test('strict greater-than preserved',()=>assert.equal(evaluateModel(model(),parseRequirements('L4 Throughput 20Gbps 초과')).checks[0].status,'fail'));
test('strict less-than preserved',()=>assert.equal(evaluateModel(model(),parseRequirements('L4 Throughput 20Gbps 미만')).checks[0].status,'fail'));
test('two unrelated numbers stay reviewable',()=>assert.equal(evaluateModel(model(),parseRequirements('L4 Throughput 20~40Gbps')).numericCandidate,false));
test('test condition not stripped',()=>assert.equal(evaluateModel(model(),parseRequirements('L4 Throughput 20Gbps 이상 512byte 기준')).numericCandidate,false));
test('unknown unit not accepted',()=>assert.equal(evaluateModel(model(),parseRequirements('Memory 32FOO 이상')).numericCandidate,false));
test('negative amount is rejected',()=>assert.equal(evaluateModel(model(),parseRequirements('Memory -32GB')).numericCandidate,false));
test('unregistered fields are null not zero',()=>assert.equal(normalizeModel({model:'X',specs:{}}).metrics.l4_cps,null));
test('shared physical ports cannot be double counted',()=>assert.ok(evaluateModel(model(),parseRequirements('25G SFP28 4Port 이상\n10G SFP+ 4Port 이상')).checks.some(r=>r.key==='physical_ports'&&r.status==='fail')));
test('optical and copper pools are independent',()=>assert.equal(evaluateModel(model(),parseRequirements('25G SFP28 4Port 이상\n10G Copper 4Port 이상')).numericCandidate,true));
test('a model without a supplied GSLB comparison row stays unknown',()=>assert.ok(evaluateModel(model(),parseRequirements('DNS GSLB QPS 300000 이상')).checks.some(r=>r.status==='unknown')));
test('CPU physical and tenant are not conflated',()=>assert.ok(evaluateModel(model(),parseRequirements('CPU 4Core 이상')).checks.some(r=>r.status==='unknown')));
test('product column is not a requirement',()=>assert.equal(value('Storage\n요구규격: 1TB 이상\n제품사양: 480GB M.2 SSD\n검토결과: 미충족','ssd_gb'),1000));
test('features remain separate and cannot become full approval',()=>{const r=evaluateModel(model(),parseRequirements('전원/FAN 이중화'));assert.equal(r.checks.length,0);assert.ok(r.reviewRequirements.some(r=>r.kind==='boolean'));assert.equal(r.allPassed,false);});
test('log server separated and not ADC candidate',()=>{let g=parseGroups('웹방화벽(WAF)\nSSD 2TB 이상\n로그서버(WAF)\nStorage 20TB 이상');assert.equal(g.length,2);assert.equal(g[1].kind,'log');assert.equal(g[1].requirements[0].value,20000);});
test('quantity is metadata not performance',()=>{let g=parseGroups('[A]\n8 대\nMemory 32GB');assert.equal(g[0].quantity,'8대');assert.equal(g[0].requirements.length,1);});
test('empty input has no candidates',()=>assert.equal(evaluateModel(model(),[]).numericCandidate,false));
test('ties favor lower tier not expensive tier',()=>{let ms=[normalizeModel({...raw,model:'HIGH',tier:9}),model()];assert.equal(rankModels(ms,parseRequirements('L4 Throughput 10Gbps'))[0].model.tier,1);});
test('no official evidence means no full approval',()=>assert.equal(evaluateModel(model(),parseRequirements('L4 Throughput 10Gbps')).allPassed,false));
test('original excluded model policy visible',()=>{let c=normalizeCatalogue({f5_models:[raw,{...raw,model:'F5 r12900-DS'}]});assert.equal(c.models.length,1);assert.equal(c.excluded[0].model,'F5 r12900-DS');});
test('invalid manual number rejected during matching',()=>assert.equal(evaluateModel(model(),[{key:'l4_gbps',value:NaN,operator:'>=',kind:'numeric',source:'bad'}]).numericCandidate,false));
test('unrecognized terms cannot become a recommendation',()=>assert.equal(evaluateModel(model(),parseRequirements('대역폭 최소 조건은 담당자 문의')).numericCandidate,false));
test('combined throughput upper bound applies to both values',()=>assert.deepEqual(parseRequirements('L4/L7 Throughput 20G / 13G 이하').filter(r=>r.kind==='numeric').map(r=>r.operator),['<=','<=']));
test('throughput byte unit is not silently interpreted as bits',()=>assert.equal(evaluateModel(model(),parseRequirements('L4 Throughput 2GBps 이상')).numericCandidate,false));
test('mixed product and requirement line must not be silently discarded',()=>assert.equal(evaluateModel(model(),parseRequirements('L4 Throughput 20Gbps 이상\n제품사양: 32GB 요구규격: Memory 128GB 이상')).numericCandidate,false));
test('registered value with attached junk is unknown',()=>assert.equal(normalizeModel({model:'x',specs:{Memory:'32GBps'}}).metrics.memory_gb,null));
