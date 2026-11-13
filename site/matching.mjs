/** Numerical comparisons and evidence approval are intentionally separate. */
import { LABELS, PORT_SPEEDS, quantity, splitRequirements } from './parser.mjs';
const RSERIES='https://www.f5.com/content/dam/f5/corp/global/pdf/data-sheet/f5-application-delivery-controller-system-rseries-data-sheet.pdf';
const DNS='https://cdn.studio.f5.com/files/k6fem79d/production/e34b659aa50f6d9f5006a487b2865f708128dab2.pdf';
const DNS_CONDITIONS='BIG-IP DNS 데이터시트 18쪽 · DNS Express 권한 DNS 최대 Query RPS';
// Preserved values from matching.py at 023b17a. NOT re-certified by this migration.
const LEGACY_R2600={l4_rps:850000,ecdsa_tps:5000,ssl_gbps:8,dns_qps:590000,cpu_cores:8};
function registered(text,unit){
 if(text===undefined||text===null||text==='')return null;
 const m=String(text).trim().match(/^(\d[\d,]*(?:\.\d+)?)\s*(tbps|gbps|mbps|tib|gib|mib|tb|gb|mb|k|m|g)?/i);
 return m?quantity(m[1],m[2]??'',unit):null;
}
function poolFamily(key){return key.startsWith('copper')?'copper':key.startsWith('qsfp')?'qsfp':'sfp';}
export function normalizeModel(raw){
 const s=raw.specs??{}, pair=String(s['L4/L7 Throughput']??'').split('/');
 const metrics={l4_gbps:registered(pair[0],'Gbps'),l7_gbps:pair.length===2?registered(pair[1],'Gbps'):null,
 l4_cps:registered(s['L4 CPS'],'CPS'),l7_rps:registered(s['L7 RPS (HTTP)'],'RPS'),
 ssl_tps:registered(s['SSL TPS (RSA 2K)']??s['SSL TPS RSA 2K'],'TPS'),
 concurrent_connections:registered(s['동시 커넥션'],'CC'),ssd_gb:registered(s.Storage,'GB'),memory_gb:registered(s.Memory,'GB'),
 ssl_gbps:registered(s['SSL Bulk'],'Gbps'),cpu_cores:null,tenant_vcpus:null,cpu_ghz:null};
 if(String(raw.model).toLowerCase()==='f5 r2600')Object.assign(metrics,LEGACY_R2600);
 const tenant=String(s['CPU / Tenancy']??s['CPU (Total)']??'').match(/(\d+)\s*Tenancy/i);if(tenant)metrics.tenant_vcpus=Number(tenant[1]);
 const pools=[];
 for(const m of String(s['인터페이스']??'').matchAll(/(\d+)\s*x\s*([^,]+)/ig)){
  const desc=m[2].toLowerCase();const speeds=[...desc.matchAll(/(?<!\d)(\d+)\s*g/ig)].map(x=>Number(x[1]));
  if(/base-t/.test(desc)&&/1000/.test(desc))speeds.push(1);
  const family=/copper|utp|rj|base.?t/.test(desc)?'copper':/qsfp/.test(desc)?'qsfp':'sfp';
  pools.push({count:Number(m[1]),family,speeds:[...new Set(speeds)]});
 }
 for(const [key,speed] of Object.entries(PORT_SPEEDS))metrics[key]=pools.length?pools.filter(p=>p.family===poolFamily(key)&&p.speeds.includes(speed)).reduce((n,p)=>n+p.count,0):null;
 // Future audited numbers can be provided as structured metrics, without regex parsing.
 for(const [key,val] of Object.entries(raw.metrics??{}))if(typeof val==='number'&&Number.isFinite(val)&&val>=0)metrics[key]=val;
 const performance=raw.servicePerformance??{};
 if(Number.isFinite(performance.dns_qps))metrics.dns_qps=performance.dns_qps;
 return {model:String(raw.model??'미등록'),tier:Number.isFinite(Number(raw.tier))?Number(raw.tier):999,series:raw.series??'',metrics,pools,rawSpecs:s,evidence:raw.metric_evidence??{},servicePerformance:performance};
}
export function normalizeCatalogue(reference,includeExcluded=false){
 if(!reference||!Array.isArray(reference.f5_models))throw new Error('장비 기준 데이터 형식이 올바르지 않습니다.');
 const excluded=[],models=[];
 for(const raw of reference.f5_models){
  if(!includeExcluded&&String(raw.model).toLowerCase()==='f5 r12900-ds'){excluded.push({model:raw.model,reason:'기존 저장소의 제안 제외 정책 유지. 포함 옵션으로 직접 변경 가능.'});continue;}
  models.push(normalizeModel(raw));
 }
 return {models,excluded,sources:reference.sources??[]};
}
function compare(actual,required,op){
 switch(op){case '>=':return actual>=required;case '<=':return actual<=required;case '>':return actual>required;case '<':return actual<required;case '=':return actual===required;default:return null;}
}
/** Small capacitated max-flow: one physical port can satisfy only one demand. */
function missingPhysicalPorts(pools,requirements){
 const demands=requirements.filter(r=>PORT_SPEEDS[r.key]!==undefined&&['>=','='].includes(r.operator));
 if(!demands.length)return 0;
 const n=2+pools.length+demands.length,s=n-2,t=n-1,cap=Array.from({length:n},()=>Array(n).fill(0));let needed=0;
 pools.forEach((p,i)=>{cap[s][i]=p.count;demands.forEach((r,j)=>{if(p.family===poolFamily(r.key)&&p.speeds.includes(PORT_SPEEDS[r.key]))cap[i][pools.length+j]=p.count;});});
 demands.forEach((r,j)=>{cap[pools.length+j][t]=r.value;needed+=r.value;});
 let flow=0;
 for(;;){const parent=Array(n).fill(-1),q=[s];parent[s]=s;for(let qi=0;qi<q.length&&parent[t]<0;qi++){let u=q[qi];for(let v=0;v<n;v++)if(parent[v]<0&&cap[u][v]>0){parent[v]=u;q.push(v);}}
  if(parent[t]<0)break;
  let amount=Infinity;for(let v=t;v!==s;v=parent[v])amount=Math.min(amount,cap[parent[v]][v]);
  for(let v=t;v!==s;v=parent[v]){cap[parent[v]][v]-=amount;cap[v][parent[v]]+=amount;}flow+=amount;
 }
 return needed-flow;
}
function gapExplanation(actual,required,unit,operator){
 const delta=actual-required;
 const gap=formatNumber(Math.abs(delta),unit);
 if(operator==='>'||operator==='<'){
  const bound=operator==='>'?'초과가':'미만이';
  const position=delta===0?'등록값이 경계값과 같습니다.':`경계값보다 ${gap} ${delta<0?'낮습니다':'높습니다'}.`;
  return `${position} ${formatNumber(required,unit)} ${bound} 필요합니다.`;
 }
 return gap+(delta<0?' 부족':' 초과');
}
export const interpretations={
 ssl:[{name:'RSA 2048',key:'ssl_tps',algorithm:'rsa2048'},{name:'ECDSA P-256',key:'ecdsa_tps',algorithm:'ecdsa_p256'}],
 layer:[{name:'L4 처리량',key:'l4_gbps'},{name:'L7 처리량',key:'l7_gbps'}]
};
export function interpret(r,choice){
 return {...r,...LABELS[choice.key],key:choice.key,algorithm:choice.algorithm??'unspecified',ambiguity:null,deferred:false};
}
export function materialQuestions(models,requirements){
 const open=requirements.filter(r=>r.ambiguity&&!r.deferred);
 if(!open.length)return new Set();
 const fixed=requirements.filter(r=>!r.ambiguity&&!r.deferred);
 const eligible=models.filter(m=>!evaluateModel(m,fixed).checks.some(c=>c.status!=='pass'));
 const questions=new Set();
 for(const model of eligible){
  const possible=open.map(r=>interpretations[r.ambiguity].map(choice=>evaluateModel(model,[interpret(r,choice)]).numericCandidate));
  if(possible.every(options=>options.some(Boolean))){
   possible.forEach((options,i)=>{if(!options.every(Boolean))questions.add(open[i]);});
  }
 }
 return questions;
}
export function evaluateModel(model,requirements){
 const {comparison,review:reviewRequirements}=splitRequirements(requirements);
 const checks=comparison.map(r=>{
  if(r.ambiguity){
   const variants=interpretations[r.ambiguity].map(choice=>evaluateModel(model,[interpret(r,choice)]).checks[0]);
   const same=variants.every(v=>v.status===variants[0].status);
   const registeredOptions=variants.map(v=>({label:v.label,value:v.actual,unit:v.unit}));
   const basis=interpretations[r.ambiguity].map(c=>c.name).join(' / ');
   const missing=variants.filter(v=>v.actual==null).map(v=>v.label);
   let explanation=same?'':`${basis} 중 적용할 시험 기준을 선택해야 합니다.`;
   if(missing.length)explanation+=(explanation?' ':'')+missing.join(' · ')+' 등록값이 없습니다.';
   if(same&&variants[0].status==='fail')explanation=variants.map(v=>v.label+' · '+v.explanation).join('\n');
   if(!explanation&&variants[0].status==='unknown')explanation=variants[0].explanation;
   return {...r,actual:null,registeredOptions,status:same?variants[0].status:'unknown',conditionPending:true,evidenceVerified:false,
    explanation,reason:variants.map(v=>`${v.label}: ${formatNumber(v.actual,v.unit)}`).join(' / '),evidenceNote:'가능한 두 시험 기준을 각각 비교했습니다.'};
  }
  let actual=model.metrics[r.key]??null,status='unknown',reason=r.note??'',conditionPending=false;
  let serviceSource='',serviceNote='',comparisonBasis='',label=r.label,explanation='';
  const gslb=r.key==='gslb_rps'||(r.key==='dns_qps'&&r.context==='gslb');
  if(gslb){
   actual=model.servicePerformance?.dns_qps??null;
   label='GSLB 요구 RPS';comparisonBasis='DNS Express 기준';
   reason+=' 첨부 표의 권한 DNS 최대 Query RPS로 비교합니다. 실제 GSLB 부하분산 성능은 별도 시험 대상입니다.';
  }
  if((r.key==='dns_qps'||gslb)&&actual!==null){serviceSource=DNS+'#page=18';serviceNote=DNS_CONDITIONS;}
  const valid=typeof r.value==='number'&&Number.isFinite(r.value)&&r.value>=0&&r.value<=Number.MAX_SAFE_INTEGER&&['>=','<=','>','<','='].includes(r.operator);
  const integerRequired=/ports$/.test(r.key)||['cpu_cores','tenant_vcpus','concurrent_connections','arp_table'].includes(r.key);
  if(r.kind==='numeric'&&valid&&(!integerRequired||Number.isInteger(r.value))&&actual!==null)status=compare(actual,r.value,r.operator)?'pass':'fail';
  if(r.key==='ssl_tps'&&r.algorithm!=='rsa2048'){
   status='unknown';explanation=r.algorithm==='rsa4096'?'RSA 4096 시험값이 없습니다.':'요구한 RSA 키 길이를 확인하세요.';
   if(actual!=null)explanation+=' 등록값은 RSA 2048 기준입니다.';
   reason+=' '+explanation;
  }
  if(r.key==='ecdsa_tps'&&r.algorithm!=='ecdsa_p256'){
   conditionPending=true;
   if(r.algorithm&&r.algorithm!=='unspecified'){status='unknown';explanation='요구한 ECDSA 곡선의 시험값이 없습니다.';if(actual!=null)explanation+=' 등록값은 P-256 기준입니다.';reason+=' '+explanation;}
   else reason+=' ECDSA 수치를 우선 비교합니다. 곡선·시험 조건은 별도 확인이 필요합니다.';
  }
  if(!gslb&&r.key==='dns_qps'&&r.context!=='dns_express'){
   conditionPending=true;
   if(r.context&&r.context!=='unspecified'){status='unknown';explanation='요구한 DNS 시험 기준에 맞는 등록값이 없습니다.';reason+=' '+explanation;}
   else reason+=' 등록 DNS Express 값과 수치만 비교합니다. DNS/GSLB 시험 기준은 별도 확인이 필요합니다.';
  }
  if(r.key==='cpu_cores'&&r.context!=='physical'){status='unknown';explanation='물리 코어와 테넌트 vCPU 중 요구 기준을 확인하세요.';reason+=' '+explanation;}
  if(r.kind==='unknown'){status='unknown';explanation=r.note||'원문에서 비교할 항목과 요구값을 지정하세요.';}
  else if(!valid||integerRequired&&!Number.isInteger(r.value)){
   status='unknown';
   explanation=!['>=','<=','>','<','='].includes(r.operator)?'요구값의 비교 조건을 지정하세요.':
    integerRequired?'요구값에 유효한 0 이상의 정수를 입력하세요.':'요구값에 유효한 0 이상의 수치를 입력하세요.';
  }
  if(actual===null){reason+=' 등록된 수치/지원 근거가 없습니다.';if(!explanation)explanation=label+' 등록값이 없습니다.';}
  if(status==='fail')explanation=gapExplanation(actual,r.value,r.unit,r.operator);
  const e=model.evidence[r.key];const evidenceVerified=e?.verified===true&&/^https:\/\//.test(e.url??'')&&/^\d{4}-\d{2}-\d{2}$/.test(e.checked_at??'')&&Boolean(e.conditions);
  let source=e?.url??((model.model.toLowerCase()==='f5 r2600'&&r.key in LEGACY_R2600)?(r.key==='dns_qps'?DNS:RSERIES):'');
  return {...r,label,actual,status,reason,explanation,conditionPending,comparisonBasis,evidenceVerified:evidenceVerified&&!conditionPending&&!gslb,sourceUrl:serviceSource||source,evidenceNote:serviceNote||(evidenceVerified&&!conditionPending?`등록된 검증 기록: ${e.checked_at}`:'등록값 기준 · 공식 사양 확인 필요')};
 });
 const ports=checks.filter(c=>PORT_SPEEDS[c.key]!==undefined);
 if(ports.length&&ports.every(c=>c.status==='pass')){
  const missing=missingPhysicalPorts(model.pools,requirements);
  if(missing)checks.push({key:'physical_ports',label:'물리 포트 동시 할당',actual:null,value:null,unit:'',source:'속도별 요구 포트 동시 확보',status:'fail',explanation:`동시에 할당할 물리 포트 ${missing}개 부족`,reason:'동일 물리 포트를 중복 사용해야 하는 요구입니다. 자동 브레이크아웃은 가정하지 않습니다.',evidenceVerified:false,evidenceNote:'등록 포트 구성 기준'});
 }
 const passed=checks.filter(c=>c.status==='pass').length,failed=checks.filter(c=>c.status==='fail').length,unknown=checks.length-passed-failed;
 const shortfall=checks.reduce((n,c)=>n+(c.status==='fail'&&typeof c.value==='number'&&c.value>0&&typeof c.actual==='number'?Math.abs(c.value-c.actual)/c.value:c.status==='fail'?1:0),0);
 return {model,checks,reviewRequirements,passed,failed,unknown,shortfall,numericCandidate:checks.length>0&&failed===0&&unknown===0,
 allPassed:checks.length>0&&reviewRequirements.length===0&&checks.every(c=>c.status==='pass'&&c.evidenceVerified)};
}
export function rankModels(models,requirements){
 const results=models.map(m=>evaluateModel(m,requirements));
 const gslbOrder=e=>{
  const rows=e.checks.filter(c=>c.comparisonBasis);
  if(rows.some(c=>c.status==='unknown'))return 2;
  return rows.some(c=>c.status==='fail')?1:0;
 };
 return results.sort((a,b)=>Number(b.numericCandidate)-Number(a.numericCandidate)||gslbOrder(a)-gslbOrder(b)||a.failed-b.failed||a.unknown-b.unknown||a.shortfall-b.shortfall||a.model.tier-b.model.tier||a.model.model.localeCompare(b.model.model));
}
export function formatNumber(value,unit='') {return value===null||value===undefined?'자료 없음':typeof value==='boolean'?'필수':`${new Intl.NumberFormat('ko-KR',{maximumFractionDigits:8}).format(value)} ${unit}`.trim();}
export function registeredValue(check){
 if(check.registeredOptions)return check.registeredOptions.map(o=>o.label+' · '+formatNumber(o.value,o.unit)).join('\n');
 return formatNumber(check.actual,check.unit);
}
export function reportText(group,evaluation){
 const title=evaluation.numericCandidate?'등록 수치상 검토 후보':'추가 검토 대상 (충족 추천 아님)';
 return [`[RFQ 검토] ${group.name}`,`${title}: ${evaluation.model.model}`,'이 결과는 등록 자료와의 비교이며, 최신 공식 사양·라이선스·구성 확인 전 최종 제안을 확정하지 않습니다.',
 `수치 ${evaluation.checks.length}개: 충족 ${evaluation.passed} / 미충족 ${evaluation.failed} / 수치 확인 ${evaluation.unknown}`,
 ...evaluation.checks.map(c=>`- ${c.label}: ${c.status==='pass'?'수치상 충족':c.status==='fail'?'미충족':'수치 확인 필요'} | 요구 ${c.operator??''} ${formatNumber(c.value,c.unit)} | 등록 ${registeredValue(c).replaceAll('\n',' / ')}${c.comparisonBasis?' ('+c.comparisonBasis+')':''}${c.conditionPending?' | 시험조건 확인 필요':''}`),
 ...(evaluation.reviewRequirements.length?['별도 기능·문구 검토 (수치 집계에서 제외):',...evaluation.reviewRequirements.map(r=>`- ${r.label}: ${r.source}`)]:[])].join('\n');
}
