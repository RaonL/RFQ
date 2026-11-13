import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGroups,parseRequirements} from '../site/parser.mjs';
import {materialQuestions,normalizeModel,evaluateModel,interpret,interpretations} from '../site/matching.mjs';

test('colloquial clauses preserve their original wording, units and strict bounds',()=>{
 const input='엘포 20기가, GSLB 백만은 넘어야 하고 메모리 32기가면 돼';
 const rows=parseRequirements(input);
 assert.deepEqual(rows.map(r=>[r.key,r.operator,r.value,r.unit]),[
  ['l4_gbps','>=',20,'Gbps'],['gslb_rps','>',1000000,'RPS'],['memory_gb','>=',32,'GB']
 ]);
 assert.ok(rows.every(r=>input.includes(r.source)));
 assert.equal(parseRequirements('엘세븐 13기가')[0].key,'l7_gbps');
 assert.equal(parseRequirements('GSLB 초당 2천만 건')[0].value,20000000);
 assert.equal(parseRequirements('GSLB 백만 안 넘어야')[0].operator,'<=');
 assert.equal(parseRequirements('SSL 만은 나와야 돼')[0].value,10000);
 assert.equal(parseRequirements('SSL TPS (RSA 2048) 7000 이상')[0].ambiguity,undefined);
});

test('ask about SSL only when the set of models meeting the other conditions changes',()=>{
 const models=[normalizeModel({model:'A',metrics:{ssl_tps:10000,ecdsa_tps:5000,memory_gb:16}}),
  normalizeModel({model:'B',metrics:{ssl_tps:12000,ecdsa_tps:12000,memory_gb:32}})];
 const [ssl]=parseRequirements('SSL 만은 나와야 돼');
 assert.ok(materialQuestions(models,[ssl]).has(ssl));
 const [mem]=parseRequirements('메모리 32기가');
 assert.equal(materialQuestions(models,[ssl,mem]).size,0);
 assert.ok(evaluateModel(models[1],[ssl,mem]).numericCandidate);
 assert.equal(evaluateModel(models[0],[interpret(ssl,interpretations.ssl[0])]).passed,1);
 assert.equal(evaluateModel(models[0],[interpret(ssl,interpretations.ssl[1])]).failed,1);
 const deferred={...ssl,deferred:true};
 assert.deepEqual(evaluateModel(models[1],[deferred,mem]).reviewRequirements,[deferred]);
 assert.equal(evaluateModel(models[1],[deferred]).numericCandidate,false);
});

test('relative branch bandwidth and shared memory retain the original clauses',()=>{
 const [hq,dr]=parseGroups('본점은 20기가, DR은 그 절반, 메모리는 둘 다 64');
 assert.deepEqual([hq.name,dr.name],['본점','DR']);
 assert.deepEqual(hq.requirements.map(r=>r.value),[20,64]);
 assert.deepEqual(dr.requirements.map(r=>r.value),[10,64]);
 assert.equal(dr.requirements[0].source,'DR은 그 절반');
 assert.equal(hq.requirements[0].ambiguity,'layer');
});
