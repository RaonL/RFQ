/** Conservative RFQ extraction. Never treats an unparsed clause as compliance. */
export const METRICS = [
 ['l4_rps','L4 HTTP RPS','RPS',/\bl4\s*(?:http\s*)?(?:rps|requests per second)/ig],
 ['l7_rps','L7 HTTP RPS','RPS',/\bl7\s*(?:http\s*)?(?:rps|requests per second)/ig],
 ['dns_qps','DNS Query QPS/RPS','QPS',/(?:maximum\s*query\s*rps|(?:초당\s*)?dns\s*(?:(?:express|query|쿼리)\s*)?(?:qps|rps|쿼리)|\bqps\b)/ig],
 ['ssl_gbps','SSL/TLS Throughput','Gbps',/(?:ssl|tls)(?:\/tls)?\s*(?:throughput|처리량|bulk)/ig],
 ['ecdsa_tps','ECDSA TPS','TPS',/ecdsa(?:\s*p[- ]?256)?\s*tps/ig],
 ['ssl_tps','SSL RSA TPS','TPS',/(?:ssl|tls)(?:\/tls)?\s*(?:(?:rsa\s*)?(?:2k|4k|2048(?:bit)?|4096(?:bit)?)\s*)?tps/ig],
 ['http_gbps','HTTP/WAF Throughput','Gbps',/(?:http|waf)\s*(?:throughput|처리량)/ig],
 ['http_cps','HTTP CPS','CPS',/http\s*cps/ig],
 ['http_tps','HTTP TPS','TPS',/http\s*tps/ig],
 ['http_rps','HTTP RPS (계층 확인)','RPS',/http\s*rps/ig],
 ['l4_cps','L4 CPS','CPS',/(?:\bl4\s*)?(?:\bcps\b|connections per second)|단위\s*커넥션/ig],
 ['l4_gbps','L4 Throughput','Gbps',/\bl4\s*(?:throughput|처리량)/ig],
 ['l7_gbps','L7 Throughput','Gbps',/\bl7\s*(?:throughput|처리량)/ig],
 ['concurrent_connections','동시 커넥션','CC',/concurrent\s*connections?|동시\s*(?:커넥션|세션|연결|접속)/ig],
 ['ssd_gb','SSD / Storage','GB',/storage|hard\s*(?:drive|disk)|disk(?:\s*:?\s*ssd)?|ssd(?:\s*storage)?|스토리지/ig],
 ['memory_gb','Memory','GB',/memory|메모리|\bram\b|\bmem\b/ig],
 ['tenant_vcpus','Tenant vCPU','vCPU',/(?:tenant|테넌트)\s*(?:v?cpu|코어)/ig],
 ['cpu_cores','CPU Core','Core',/\bcpu\b|물리\s*코어/ig],
 ['arp_table','ARP Table','Entry',/arp\s*(?:table)?/ig],
 ['generic_tps','TPS (시험 기준 확인)','TPS',/단위\s*트랜잭션|transactions? per second/ig],
 ['generic_gbps','Throughput (계층 확인)','Gbps',/throughput|처리\s*성능/ig],
 ['cpu_ghz','CPU 주파수','GHz',/cpu\s*주파수/ig]
];
export const PORT_SPEEDS = {sfp_1g_ports:1,sfp_plus_10g_ports:10,sfp28_25g_ports:25,copper_1g_ports:1,copper_10g_ports:10,qsfp_40g_ports:40,qsfp28_100g_ports:100};
export const LABELS = Object.fromEntries(METRICS.map(([key,label,unit])=>[key,{label,unit}]));
for(const [key,speed] of Object.entries(PORT_SPEEDS)) LABELS[key]={label:`${speed}G ${key.startsWith('copper')?'Copper':'광'} Port`,unit:'Port'};
const FEATURES=[
 ['redundant_power','전원 이중화',/(?:전원|power|psu)(?:\s*\/\s*(?:fan|팬))?\s*(?:이중화|redundant|dual)/ig],
 ['redundant_fan','FAN 이중화',/(?:전원\s*\/\s*)?(?:fan|팬)\s*(?:이중화|redundant|dual)/ig],
 ['ha','HA 구성',/\bha\b(?:\s*구성)?/ig],['qos','QoS',/\bqos\b/ig],['ddos','DDoS',/\bddos\b/ig],
 ['hot_swap','Hot-Swap',/hot[ -]?swap|fan\s*tray/ig],
 ['port_mirroring','포트 미러링',/포트\s*미러링|port\s*mirroring/ig],
 ['management_port','관리 포트',/management\s*port|별도\s*관리\s*포트|관리\s*포트/ig],
 ['monitoring','상태 모니터링',/모니터링|monitoring|health\s*check/ig],
 ['backup_restore','백업·복구',/백업|복구|backup|restore/ig],
 ['integrity_document','무결성 확인서',/악의적인\s*백도어\s*미설치\s*확인서|백도어\s*미설치\s*확인서|무결성\s*확인서/ig]
];
const NUMBER=/(\d[\d,]*(?:\.\d+)?)\s*(tbps|gbps|mbps|tbit\/s|gbit\/s|mbit\/s|tb|gb|mb|tib|gib|mib|억|만|ghz|mhz|vcpus?|cores?|코어|k|m|g)?/ig;
const HEADING=/^(?:\d+[.)]\s*)?(?:웹방화벽\s*\(waf\)|로그서버\s*\(waf\)|dns\s*gslb(?:\s*[-—–].*)?|l4\s*스위치(?:\s*요구사항)?|\[.+\])$/i;
const IGNORE=/^(?:구분|주요\s*기능요건|수량|단위|비고|h\/w|인터페이스|주요기능|세부내용|세부\s*규격|성능\s*및\s*규격|요구규격\s*[:：]?)$/i;
export function normalizeText(text){
 return String(text??'').replace(/\r\n?/g,'\n').replace(/&nbsp;/gi,' ').replace(/&gt;/gi,'>').replace(/&lt;/gi,'<').replace(/&amp;/gi,'&').replace(/\s+\|\s+/g,'\n').replace(/(?<!\d),(?!\d)|;/g,'\n');
}
export function quantity(number,suffix='',unit=''){
 if(unit==='Gbps' && /[MGT]B(?:ps|\/s)/.test(suffix))return null;
 const raw=String(number); if(raw.includes(',')&&!/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw))return null;
 let n=Number(raw.replaceAll(',','')); const u=suffix.toLowerCase();
 if(unit==='GB') {const f={'':1,g:1,gb:1,mb:.001,tb:1000,gib:1.073741824,mib:.001048576,tib:1099.511627776};if(!(u in f))return null;n*=f[u];}
 else if(unit==='Gbps'){const f={'':1,g:1,gbps:1,mbps:.001,tbps:1000,'gbit/s':1,'mbit/s':.001,'tbit/s':1000};if(!(u in f))return null;n*=f[u];}
 else if(unit==='GHz'){const f={'':1,ghz:1,mhz:.001};if(!(u in f))return null;n*=f[u];}
 else {const f={'':1,k:1e3,m:1e6,'만':1e4,'억':1e8,core:1,cores:1,'코어':1,vcpu:1,vcpus:1};if(!(u in f))return null;n*=f[u];}
 return Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER?n:null;
}
function operator(text){
 const ops=[];for(const [op,rx] of [['>=',/>=|≥|이상|최소/],['<=',/<=|≤|이하|최대/],['>',/(?<![<>=])>(?!=)|초과/],['<',/(?<![<>=])<(?!=)|미만/],['=',/(?<![<>])=(?!=)|정확히/]])if(rx.test(text))ops.push(op);
 return ops.length>1?null:(ops[0]??'>=');
}
function unknown(source,note='해석되지 않은 조건입니다. 원문을 수정하거나 수동 검토하세요.') {return {key:'unparsed',label:'원문 검토 필요',kind:'unknown',value:null,unit:'',operator:'>=',source,note};}
function metric(key,value,source,extra={}) {return {key,...(LABELS[key]??{label:key,unit:''}),kind:'numeric',value,operator:'>=',source,note:'',...extra};}
function scrub(text){return text.replace(/요구\s*규격|요구\s*사항|최소\s*규격|최소|최대|이상|이하|초과|미만|정확히|필수|제공|지원|요구|기능|구성|통일|\b(?:rps|cps|tps|cc|entry|entries|core|cores|vcpu|vcpus|gbps|gb|ports?)\b|업링크|다운링크/gi,'').replace(/[\s:：()[\]{}=<>≥≤,./\-+•·]/g,'').trim();}
function maskAt(text,start,end){return text.slice(0,start)+' '.repeat(end-start)+text.slice(end);}
function parseBody(key,label,unit,body,source){
 let rest=body, result=[], algorithm='unspecified';
 if(key==='ssl_tps'){
  const alg=source.match(/rsa\s*[-:(]?\s*(2\s*k|4\s*k|2048|4096)\s*(?:bits?)?/i);
  if(alg)algorithm=/^(?:2\s*k|2048)$/i.test(alg[1])?'rsa2048':'rsa4096';
  else if(/(?:ssl|tls)(?:\/tls)?\s*2k\s*tps/i.test(source))algorithm='rsa2048';
  rest=rest.replace(/rsa\s*[-:(]?\s*(?:2\s*k|4\s*k|2048|4096)\s*(?:bits?)?/ig,' ');
 } else if(key==='ecdsa_tps') {algorithm=/p[- ]?256/i.test(source)?'ecdsa_p256':'unspecified';rest=rest.replace(/p[- ]?256/ig,' ');}
 if(key==='cpu_cores'){
  rest=rest.replace(/(\d+(?:\.\d+)?)\s*(ghz|mhz)/ig,(_,n,u)=>{result.push(metric('cpu_ghz',quantity(n,u,'GHz'),source,{note:'CPU 주파수는 코어 수와 별도로 검토합니다.'}));return ' ';});
 }
 const matches=[...rest.matchAll(new RegExp(NUMBER.source,'ig'))];
 if(!matches.length)return {missing:true, requirements:result};
 const m=matches[0], value=quantity(m[1],m[2]??'',unit), op=operator(rest);
 if(value===null||op===null||matches.length>1||/[-−]\s*\d/.test(rest))return {requirements:[...result,unknown(source,'수치·단위·범위 또는 비교 조건이 모호합니다. 한 항목에 한 수치 조건으로 정리하세요.')]};
 rest=maskAt(rest,m.index,m.index+m[0].length);
 // Unit suffixes following K/M (e.g. 7K TPS) are syntax, not another condition.
 const req=metric(key,value,source,{label,unit,operator:op,algorithm,
  context:key==='dns_qps'&&/dns\s*express/i.test(source)?'dns_express':key==='cpu_cores'&&/물리|physical/i.test(source)?'physical':'unspecified',
  note:!m[2]?`단위가 없으면 ${unit}로 해석합니다. 추출 결과를 확인하세요.`:''});
 result.unshift(req);
 if(scrub(rest))result.push(unknown(source,`추가 확인할 구문: ${rest.trim()}`));
 return {requirements:result};
}
function parseLine(line){
 const out=[]; let text=line;
 // BOM optics are not physical appliance ports. Retain their quantities for review.
 text=text.replace(/(?:지빅|gbic|transceiver|트랜시버)\s*(\d+)\s*g\s*[^,;]*?(\d+)\s*개(?:\([^)]*\))?/ig,(s,speed,count)=>{out.push(metric(`optics_${speed}g_count`,Number(count),s,{label:`${speed}G 트랜시버 공급`,unit:'개',note:'BOM 수량·장비별/전체 수량·정품·호환성 확인 필요'}));return ' ';});
 const ports=/(?<![a-z0-9])(\d+(?:\s*g?\s*\/\s*\d+)*\s*g(?:bps|e)?)\s*((?:(?:qsfp28|qsfp\+|sfp28|sfp\+|qsfp|sfp|copper|utp|rj[- ]?45|광|데이터|base[- ]?t)\s*)*)(\d+)\s*(?:ports?\b|포트|개)(?:\s*(이상|이하|초과|미만))?/ig;
 text=text.replace(ports,(s,speeds,medium,count)=>{
  const all=[...speeds.matchAll(/\d+/g)].map(m=>Number(m[0])), speed=Math.max(...all), copper=/copper|utp|rj|base/i.test(medium);
  const key=(copper?{1:'copper_1g_ports',10:'copper_10g_ports'}:{1:'sfp_1g_ports',10:'sfp_plus_10g_ports',25:'sfp28_25g_ports',40:'qsfp_40g_ports',100:'qsfp28_100g_ports'})[speed];
  if(!key)out.push(unknown(s,'등록되지 않은 포트 속도/매체입니다.'));
  else {out.push(metric(key,Number(count),s,{operator:operator(s)??'>=',note:'물리 포트 동시 할당 기준. 트랜시버·속도 모드와 호환성은 별도 확인.'}));if(all.length>1)out.push(unknown(s,'복수 속도 모드의 모든 속도 지원 여부를 별도 확인해야 합니다.'));}
  return ' ';
 });
 for(const [key,label,rx] of FEATURES){rx.lastIndex=0;const ms=[...line.matchAll(rx)];if(ms.length){out.push({key,label,kind:'boolean',value:true,unit:'',operator:'=',source:line,note:'라이선스·구성·공식 지원 근거 확인 필요'});for(const m of ms)text=text.replace(m[0],' ');}}
 const hits=[];
 for(const [key,label,unit,rx] of METRICS){rx.lastIndex=0;for(const m of text.matchAll(rx))hits.push({key,label,unit,start:m.index,end:m.index+m[0].length});}
 hits.sort((a,b)=>a.start-b.start||b.end-a.end);
 const spans=[];for(const h of hits)if(!spans.some(s=>h.start<s.end&&h.end>s.start))spans.push(h);
 if(!spans.length){if(scrub(text))out.push(unknown(line));return {out,pending:null};}
 if(scrub(text.slice(0,spans[0].start)))out.push(unknown(text.slice(0,spans[0].start)));
 let pending=null;
 for(let i=0;i<spans.length;i++){
  const h=spans[i], end=spans[i+1]?.start??text.length, source=text.slice(h.start,end).trim();
  const parsed=parseBody(h.key,h.label,h.unit,text.slice(h.end,end),source);
  out.push(...parsed.requirements);
  if(parsed.missing){if(i===spans.length-1)pending={...h,source};else out.push(unknown(source,'요구 수치가 빠져 있습니다.'));}
 }
 return {out,pending};
}
function pairHeader(line){if(/cpu\s*\/\s*memory/i.test(line))return 'cpu';if(/l4\s*\/\s*l7\s*throughput/i.test(line))return 'throughput';return null;}
function parsePair(line,kind){
 const tail=line.replace(/cpu\s*\/\s*memory|l4\s*\/\s*l7\s*throughput|요구규격\s*[:：]?/ig,'');
 const parts=tail.split('/');if(parts.length!==2)return null;
 const fields=kind==='cpu'?['cpu_cores','memory_gb']:['l4_gbps','l7_gbps'];const out=[];const sharedOperator=operator(tail);
 for(let i=0;i<2;i++){let key=fields[i],def=LABELS[key],r=parseBody(key,def.label,def.unit,parts[i],line);if(r.missing)return null;
  if(!/[<>≥≤=]|이상|이하|최소|최대|초과|미만|정확히/.test(parts[i]))for(const req of r.requirements)if(req.kind==='numeric')req.operator=sharedOperator??req.operator;
  out.push(...r.requirements);}
 return out;
}
export function parseRequirements(input){
 if(String(input??'').length>250000)throw new Error('입력은 250,000자 이내로 나누어 주세요.');
 const out=[];let pending=null,pair=null,productBlock=false;
 for(const raw of normalizeText(input).split('\n')){
  const line=raw.replace(/^[\s•ㅇ–—-]+/,'').trim();if(!line)continue;
  if(line.length>4000){out.push(unknown(line.slice(0,4000),'한 줄이 너무 깁니다. 항목별로 나누세요.'));continue;}
  if(/^(?:제품사양|검토결과)\s*[:：]?/i.test(line)){if(/요구규격|요구사항/.test(line))out.push(unknown(line,'제품사양과 요구규격이 같은 줄에 있습니다. 요구조건을 별도 줄로 분리하세요.'));productBlock=/^(?:제품사양|검토결과)\s*[:：]?\s*$/.test(line);continue;}
  if(/^요구규격/.test(line))productBlock=false;
  if(productBlock){out.push(unknown(line,'제품사양 블록입니다. 요구규격과 분리하여 확인하세요.'));continue;}
  if(HEADING.test(line)||IGNORE.test(line)||/^(?:수량\s*[:：]?\s*)?\d+\s*(?:대|식)(?:\s*일체형)?$/.test(line))continue;
  const ph=pairHeader(line);
  if(ph||pair){
   const kind=ph??pair.kind, r=parsePair(line,kind);
   if(r){if(pending)out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.'));pending=null;out.push(...r);pair=null;continue;}
   if(ph){if(pending)out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.'));pending=null;if(pair)out.push(unknown(pair.source,'복합 수치가 빠져 있습니다.'));pair={kind,source:line};continue;}
   out.push(unknown(pair.source,'복합 수치가 빠져 있습니다.'));pair=null;
  }
  if(pending){
   if(/^(?:요구규격\s*[:：]?\s*)?[<>≥≤=]*\s*\d/.test(line)){
    const r=parseBody(pending.key,pending.label,pending.unit,line,`${pending.source}\n${line}`);
    out.push(...r.requirements);if(r.missing)out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.'));pending=null;continue;
   }
   out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.'));pending=null;
  }
  const r=parseLine(line.replace(/^요구규격\s*[:：]?\s*/,''));out.push(...r.out);pending=r.pending;
 }
 if(pending)out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.'));
 if(pair)out.push(unknown(pair.source,'복합 수치가 빠져 있습니다.'));
 if(out.length>600)throw new Error('추출 항목은 한 번에 600개까지입니다. 장비별로 나누어 주세요.');
 return out.map((r,i)=>({...r,id:`req-${i+1}`,userEdited:false}));
}
export function parseGroups(input){
 const groups=[];let current={name:'요구사항',quantity:'',kind:'adc',lines:[]};
 for(const raw of normalizeText(input).split('\n')){
  const line=raw.trim();
  if(HEADING.test(line)){if(current.lines.length)groups.push(current);current={name:line,quantity:'',kind:/로그서버/i.test(line)?'log':'adc',lines:[]};}
  else {current.lines.push(raw);const q=line.match(/^(?:수량\s*[:：]?\s*)?(\d+)\s*(대|식)(?:\s*일체형)?$/);if(q)current.quantity=q[1]+q[2];}
 }
 if(current.lines.length)groups.push(current);
 return groups.map(({lines,...g})=>({...g,requirements:parseRequirements(lines.join('\n'))})).filter(g=>g.requirements.length);
}
