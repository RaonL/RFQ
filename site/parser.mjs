/** Conservative RFQ extraction. Never treats an unparsed clause as compliance. */
export const METRICS = [
 ['gslb_rps','GSLB Query RPS','RPS',/(?:dns\s+)?gslb(?:\s*(?:max(?:imum)?\s*)?(?:query|쿼리))?(?:\s*(?:rps|qps|성능))?/ig],
 ['l4_rps','L4 HTTP RPS','RPS',/(?:\bl4|엘포)\s*(?:http\s*)?(?:rps|requests per second|초당\s*요청)/ig],
 ['l7_rps','L7 HTTP RPS','RPS',/(?:\bl7|엘세븐)\s*(?:http\s*)?(?:rps|requests per second|초당\s*요청)/ig],
 ['dns_qps','DNS Query QPS/RPS','QPS',/(?:(?:dns\s+express\s+)?max(?:imum)?\s*query\s*rps|(?:초당\s*)?dns\s*(?:express\s*)?(?:(?:query|쿼리)\s*)?(?:qps|rps|쿼리)|\bqps\b)/ig],
 ['ssl_gbps','SSL/TLS Throughput','Gbps',/(?:ssl|tls)(?:\/tls)?\s*(?:throughput|처리량|bulk)/ig],
 ['ecdsa_tps','ECDSA TPS','TPS',/ecdsa(?:\s*p[- ]?\d+)?\s*tps|ecdsa(?=(?:는|은)?\s*(?:초당\s*)?[\d천백만]+\s*tps\b)/ig],
 ['ssl_tps','SSL RSA TPS','TPS',/(?:ssl|tls)(?:\/tls)?\s*(?:(?:rsa\s*)?(?:2k|4k|2048(?:bit)?|4096(?:bit)?)\s*)?tps|\brsa\s*(?:2048|4096|[24]k)(?:\s*bit)?(?=\s*(?:기준(?:으로)?\s*)?(?:초당\s*)?[\d천백만]+\s*tps\b)|\bssl(?=\s+[\d일이삼사오육칠팔구십백천만억][\d,.일이삼사오육칠팔구십백천만억]*(?:\s*tps\b|[은는을를]|$|\s+(?:이상|이하|초과|미만|나와야|넘어야)))/ig],
 ['http_gbps','HTTP/WAF Throughput','Gbps',/(?:http|waf)\s*(?:throughput|처리량)/ig],
 ['http_cps','HTTP CPS','CPS',/http\s*cps/ig],
 ['http_tps','HTTP TPS','TPS',/http\s*tps/ig],
 ['http_rps','HTTP RPS (계층 확인)','RPS',/http\s*rps/ig],
 ['l4_cps','L4 CPS','CPS',/(?:\bl4|엘포)\s*(?:cps\b|초당\s*신규\s*(?:연결|세션))|\bcps\b|connections per second|단위\s*커넥션/ig],
 ['l4_gbps','L4 Throughput','Gbps',/(?:\bl4|엘포)(?:은|는)?(?:\s*(?:throughput|처리량)|(?=\s*\d+(?:\.\d+)?\s*(?:기가|[gmt]bps)))/ig],
 ['l7_gbps','L7 Throughput','Gbps',/(?:\bl7|엘세븐)(?:은|는)?(?:\s*(?:throughput|처리량)|(?=\s*\d+(?:\.\d+)?\s*(?:기가|[gmt]bps)))/ig],
 ['concurrent_connections','동시 커넥션','CC',/concurrent\s*connections?|동시\s*(?:커넥션|세션|연결|접속)/ig],
 ['ssd_gb','SSD / Storage','GB',/storage|hard\s*(?:drive|disk)|disk(?:\s*:?\s*ssd)?|ssd(?:\s*storage)?|스토리지(?:\s*ssd)?/ig],
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
const SSLO=/\b(?:sslo|ssl[-\s]+orchestrator)\b/i;
for(const [key,speed] of Object.entries(PORT_SPEEDS)) LABELS[key]={label:`${speed}G ${key.startsWith('copper')?'Copper':'광'} Port`,unit:'Port'};
const FEATURES=[
 ['redundant_power','전원 이중화',/(?:전원(?:부)?|power|psu)(?:\s*[,/]\s*(?:fan|팬))?\s*(?:이중화|redundant|dual)/ig],
 ['redundant_fan','FAN 이중화',/(?:전원\s*\/\s*)?(?:fan|팬)\s*(?:이중화|redundant|dual)/ig],
 ['ha','HA 구성',/\bha\b(?:\s*구성)?/ig],['qos','QoS',/\bqos\b/ig],['ddos','DDoS',/\bddos\b/ig],
 ['hot_swap','Hot-Swap',/hot[ -]?swap|fan\s*tray/ig],
 ['port_mirroring','포트 미러링',/포트\s*미러링|port\s*mirroring/ig],
 ['management_port','관리 포트',/management\s*port|별도\s*관리\s*포트|관리\s*포트/ig],
 ['monitoring','상태 모니터링',/모니터링|monitoring|health\s*check/ig],
 ['backup_restore','백업·복구',/백업|복구|backup|restore/ig],
 ['integrity_document','무결성 확인서',/악의적인\s*백도어\s*미설치\s*확인서|백도어\s*미설치\s*확인서|무결성\s*확인서/ig]
];
const NUMBER=/(\d+(?:,\d+)*(?:\.\d+)?)\s*(tbps|gbps|mbps|tbit\/s|gbit\/s|mbit\/s|tb|gb|mb|tib|gib|mib|억|만|ghz|mhz|vcpus?|cores?|코어|k|m|g)?/ig;
const HEADING=/^(?:\d+[.)]\s*)?(?:웹방화벽\s*\(waf\)|로그서버\s*\(waf\)|(?:dns\s*)?gslb|(?:big-ip\s+)?(?:sslo|ssl[-\s]+orchestrator)|dns\s*gslb\s*[-—–]\s*\D+|l4\s*스위치(?:\s*요구사항)?|\[.+\])$/i;
const IGNORE=/^(?:구분|주요\s*기능요건|수량|단위|비고|h\/w|인터페이스|주요기능|세부내용|세부\s*규격|성능\s*및\s*규격|요구규격\s*[:：]?)$/i;
export function normalizeText(text){
 return String(text??'').replace(/\r\n?/g,'\n').replace(/&nbsp;/gi,' ').replace(/&gt;/gi,'>').replace(/&lt;/gi,'<').replace(/&amp;/gi,'&').replace(/\s+\|\s+/g,'\n').replace(/;/g,'\n');
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
function unknown(source,note='해석되지 않은 조건입니다. 원문을 수정하거나 수동 검토하세요.',blocksNumeric=/\d/.test(source)) {return {key:'unparsed',label:blocksNumeric?'수치 해석 필요':'별도 검토',kind:'unknown',value:null,unit:'',operator:'>=',source,note,blocksNumeric};}
export function splitRequirements(requirements){
 const comparison=[],review=[];
 for(const r of requirements)(!r.deferred&&(r.kind==='numeric'||r.blocksNumeric)?comparison:review).push(r);
 return {comparison,review};
}
function metric(key,value,source,extra={}) {return {key,...(LABELS[key]??{label:key,unit:''}),kind:'numeric',value,operator:'>=',source,note:'',...extra};}
function scrub(text){return text.replace(/요구\s*규격|요구\s*사항|최소\s*규격|최소|최대|이상|이하|초과|미만|정확히|필수|제공|지원|요구|기능|구성|통일|\b(?:rps|cps|tps|cc|entry|entries|core|cores|vcpu|vcpus|gbps|gb|ports?)\b|업링크|다운링크/gi,'').replace(/[\s:：()[\]{}=<>≥≤,./\-+•·]/g,'').trim();}
function maskAt(text,start,end){return text.slice(0,start)+' '.repeat(end-start)+text.slice(end);}
// Convert one complete Sino-Korean quantity. Reject malformed units instead of guessing.
function koreanAmount(token){
 const digits='영일이삼사오육칠팔구',units={십:10,백:100,천:1000,만:10000,억:100000000};
 let total=0,section=0,pending=null,lastSmall=10000,lastLarge=Infinity;
 for(const part of token.match(/\d+(?:\.\d+)?|./g)){
  const scale=units[part];
  if(!scale){
   if(pending!==null)return token;
   pending=/^\d/.test(part)?Number(part):digits.indexOf(part);
  }else if(scale<10000){
   if(scale>=lastSmall)return token;
   section+=(pending??1)*scale;pending=null;lastSmall=scale;
  }else{
   if(scale>=lastLarge)return token;
   total+=(section+(pending??(section?0:1)))*scale;
   section=0;pending=null;lastSmall=10000;lastLarge=scale;
  }
 }
 return String(total+section+(pending??0));
}
function spokenBody(body,unit){
 let s=body.replace(/(\d+만)\s+(?=\d+[천백십])/g,'$1');
 s=s.replace(/(?<![가-힣\d,.])[\d영일이삼사오육칠팔구십백천만억]+(?:\.\d+[십백천만억]?)?(?=\s|$|[은는을를건,]|기가|이상|이하)/g,
  token=>/[가-힣]/.test(token)?koreanAmount(token):token);
 if(unit==='Gbps'||unit==='GB')s=s.replace(/(\d)\s*기가(?![바비])/g,'$1 '+unit);
 if(unit==='GB')s=s.replace(/(\d)\s*테라(?:바이트)?(?!비트)/g,'$1 TB');
 return s.replace(/안\s*넘어야|넘(?:으면\s*안\s*(?:돼요?|되(?:나요|는데|면)?|됩니다)|지\s*(?:않아야|않는|말아야))|넘어서는\s*안\s*돼/g,' 이하 ')
  .replace(/넘어야|넘는|넘게/g,' 초과 ')
  .replace(/초당|([0-9만억])\s*건/g,'$1 ')
  .replace(/(?:은|는|을|를)?\s*(?:나와야|되어야|돼야|필요하|충족하)(?:\s*(?:하고요|하고|해요|해|돼요|돼|한다))?|(?:이?면)\s*(?:돼요|돼|됩니다)/g,' ')
  .replace(/([0-9])(?:은|는|을|를)/g,'$1').replace(/(초과|이상|미만|이하)\s*(?:하고|해요|해|합니다)/g,'$1');
}
function parseBody(key,label,unit,body,source){
 let rest=spokenBody(body,unit), result=[], algorithm='unspecified';
 if(key==='ssl_tps'){
  const alg=source.match(/rsa\s*[-:(]?\s*(2\s*k|4\s*k|2048|4096)\s*(?:bits?)?/i);
  if(alg)algorithm=/^(?:2\s*k|2048)$/i.test(alg[1])?'rsa2048':'rsa4096';
  else if(/(?:ssl|tls)(?:\/tls)?\s*2k\s*tps/i.test(source))algorithm='rsa2048';
  rest=rest.replace(/rsa\s*[-:(]?\s*(?:2\s*k|4\s*k|2048|4096)\s*(?:bits?)?/ig,' ');
 } else if(key==='ecdsa_tps') {const curve=source.match(/p[- ]?(\d+)/i);algorithm=curve?'ecdsa_p'+curve[1]:'unspecified';rest=rest.replace(/p[- ]?\d+/ig,' ');}
 if(key==='cpu_cores'){
  rest=rest.replace(/(\d+(?:\.\d+)?)\s*(ghz|mhz)/ig,(_,n,u)=>{result.push(metric('cpu_ghz',quantity(n,u,'GHz'),source,{note:'CPU 주파수는 코어 수와 별도로 검토합니다.'}));return ' ';});
 }
 const matches=[...rest.matchAll(new RegExp(NUMBER.source,'ig'))];
 if(!matches.length)return {missing:true, requirements:result};
 const m=matches[0], value=quantity(m[1],m[2]??'',unit), op=operator(rest);
 if(value===null||op===null||matches.length>1||/[-−]\s*\d/.test(rest))return {requirements:[...result,unknown(source,'수치·단위·범위 또는 비교 조건이 모호합니다. 한 항목에 한 수치 조건으로 정리하세요.',true)]};
 const attachedUnit=/^[a-z]/i.test(rest.slice(m.index+m[0].length))&&!/^(?:rps|cps|tps|cc|entry|entries|ports?)\b/i.test(rest.slice(m.index+m[0].length));
 rest=maskAt(rest,m.index,m.index+m[0].length);
 if(key==='gslb_rps'||key==='dns_qps')rest=rest.replace(/\bqps\b/ig,' ');
 // Unit suffixes following K/M (e.g. 7K TPS) are syntax, not another condition.
 const req=metric(key,value,source,{label,unit,operator:op,algorithm,
  context:key==='dns_qps'&&/dns\s*express/i.test(source)?'dns_express':key==='cpu_cores'&&/물리|physical/i.test(source)?'physical':'unspecified',
  note:!m[2]?`단위가 없으면 ${unit}로 해석합니다. 추출 결과를 확인하세요.`:''});
 if(key==='ssl_tps'&&algorithm==='unspecified'&&!/rsa|ecdsa|키\s*길이/i.test(source)){
  req.ambiguity='ssl';req.label='SSL TPS';
 }
 if(key==='generic_gbps'&&/^(throughput|처리\s*성능)/i.test(source))req.ambiguity='layer';
 result.unshift(req);
 // Only discard particles and endings after the actual value and bound have been read.
 const remaining=rest.replace(/(?:최소|이상|이하|초과|미만)(?:이요|이고요|예요|으로요|으로\s*잡아\s*주세요)|필요해요|기준으로|정도가(?=\s*최소)|(?:^|\s)(?:은|는|가|랑)(?=\s|$)/g,' ');
 if(scrub(remaining))result.push(unknown(source,`추가 확인할 구문: ${rest.trim()}`,attachedUnit||/\d/.test(rest)));
 return {requirements:result};
}
function parseLine(line){
 const out=[]; let text=line;
 // BOM optics are not physical appliance ports. Retain their quantities for review.
 text=text.replace(/(?:지빅|gbic|transceiver|트랜시버)\s*(\d+)\s*g\s*[^,;]*?(\d+)\s*개(?:\([^)]*\))?/ig,(s,speed,count)=>{out.push(metric(`optics_${speed}g_count`,Number(count),s,{label:`${speed}G 트랜시버 공급`,unit:'개',note:'BOM 수량·장비별/전체 수량·정품·호환성 확인 필요'}));return ' ';});
 const ports=/(?<![a-z0-9])(\d+(?:\s*(?:g|기가)?\s*\/\s*\d+)*\s*(?:g(?:bps|e)?|기가))\s*((?:(?:qsfp28|qsfp\+|sfp28|sfp\+|qsfp|sfp|copper|utp|rj[- ]?45|광|데이터|base[- ]?t)\s*)*)(\d+|한|두|세|네)\s*(?:ports?\b|포트|개)(?:\s*(이상|이하|초과|미만))?/ig;
 text=text.replace(ports,(s,speeds,medium,count)=>{
  const all=[...speeds.matchAll(/\d+/g)].map(m=>Number(m[0])), speed=Math.max(...all), copper=/copper|utp|rj|base/i.test(medium);
  const key=(copper?{1:'copper_1g_ports',10:'copper_10g_ports'}:{1:'sfp_1g_ports',10:'sfp_plus_10g_ports',25:'sfp28_25g_ports',40:'qsfp_40g_ports',100:'qsfp28_100g_ports'})[speed];
  if(!key)out.push(unknown(s,'등록되지 않은 포트 속도/매체입니다.'));
  else {out.push(metric(key,({한:1,두:2,세:3,네:4})[count]??Number(count),s,{operator:operator(s)??'>=',note:'물리 포트 동시 할당 기준. 트랜시버·속도 모드와 호환성은 별도 확인.'}));if(all.length>1)out.push(unknown(s,'최고 속도의 포트 수를 비교합니다. 나머지 속도 모드와 매체 호환성은 별도 확인하세요.',false));}
  return ' ';
 });
 for(const [key,label,rx] of FEATURES){rx.lastIndex=0;const ms=[...line.matchAll(rx)];if(ms.length){out.push({key,label,kind:'boolean',value:true,unit:'',operator:'=',source:line,note:'라이선스·구성·공식 지원 근거 확인 필요'});for(const m of ms)text=text.replace(m[0],' ');}}
 const hits=[];
 for(const [key,label,unit,rx] of METRICS){rx.lastIndex=0;for(const m of text.matchAll(rx))hits.push({key,label,unit,start:m.index,end:m.index+m[0].length});}
 hits.sort((a,b)=>a.start-b.start||b.end-a.end);
 const spans=[];for(const h of hits){
  if(spans.some(s=>h.start<s.end&&h.end>s.start))continue;
  // A trailing CPS after a number is a unit, not another metric heading.
  const previous=spans.at(-1);
  if(h.key==='dns_qps'&&/^qps$/i.test(text.slice(h.start,h.end))&&['gslb_rps','dns_qps'].includes(previous?.key)&&/\d[\d,.]*\s*[km만억]?\s*$/i.test(text.slice(previous.end,h.start)))continue;
  if(h.key==='l4_cps'&&/^cps$/i.test(text.slice(h.start,h.end))&&previous?.key.endsWith('_cps')&&/\d[\d,.]*\s*[km]?\s*$/i.test(text.slice(previous.end,h.start))&&!/^\s*\d/.test(text.slice(h.end)))continue;
  spans.push(h);
 }
 if(!spans.length){if(scrub(text))out.push(unknown(line,undefined,/\d/.test(text)));return {out,pending:null};}
 if(scrub(text.slice(0,spans[0].start)))out.push(unknown(text.slice(0,spans[0].start)));
 let pending=null;
 for(let i=0;i<spans.length;i++){
  const h=spans[i], end=spans[i+1]?.start??text.length, source=text.slice(h.start,end).trim();
  const parsed=parseBody(h.key,h.label,h.unit,text.slice(h.end,end),source);
  out.push(...parsed.requirements);
  if(parsed.missing){if(i===spans.length-1)pending={...h,source};else out.push(unknown(source,'요구 수치가 빠져 있습니다.',true));}
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
export function parseRequirements(input,groupName=''){
 if(String(input??'').length>250000)throw new Error('입력은 250,000자 이내로 나누어 주세요.');
 const out=[];let pending=null,pair=null,productBlock=false;
 let excludedGroup=SSLO.test(groupName),excludedContinuation=false;
 // Remove standalone metadata; preserve the complete original input in the UI.
 const content=String(input??'').split(/\r?\n/).filter(line=>!/^(?:고객사|고객명|설치\s*장소|설치\s*위치)\s*[:：]|^(?:이상입니다|감사합니다)[.!。]?\s*$/.test(line.trim())).join('\n');
 for(const raw of normalizeText(content).split('\n')){
  let line=raw.replace(/^[\s•ㅇ–—-]+/,'').trim();if(!line)continue;
  if(HEADING.test(line)){excludedGroup=SSLO.test(line);excludedContinuation=false;continue;}
  if(excludedGroup){out.push(unknown(line,'하드웨어 수치 비교 범위 밖의 요구사항입니다.',false));continue;}
  if(excludedContinuation&&/^(?:요구규격\s*[:：]?\s*)?[<>≥≤=]*\s*[\d,.]+\s*(?:[kmg만억]\s*)?(?:[gmt]?bps|tps)?\s*(?:이상|이하|초과|미만)?$/i.test(line)){
   out.push(unknown(line,'앞선 SSLO 요구사항의 수치입니다.',false));excludedContinuation=false;continue;
  }
  excludedContinuation=false;
  const excluded=line.match(SSLO);
  if(excluded){
   // Keep independent hardware or GSLB clauses on either side of an SSLO requirement.
   const before=line.slice(0,excluded.index).replace(/BIG-IP\s*$/i,'').trim();
   const tail=line.slice(excluded.index+excluded[0].length);
   const next=tail.search(/(?:\b(?:gslb|l[47]\s+(?:throughput|cps|rps)|memory|storage|ssd|cpu)\b|메모리|스토리지)/i);
   const after=next<0?'':tail.slice(next);
   const independentPrefix=/\d/.test(before)&&!/[([]\s*$/.test(before);
   if(independentPrefix)out.push(...parseRequirements(before));
   out.push(unknown(line.slice(independentPrefix?excluded.index:0,after?line.length-after.length:line.length).trim(),'하드웨어 수치 비교 범위 밖의 요구사항입니다.',false));
   excludedContinuation=!after;
   if(!after)continue;
   line=after;
  }
  if(line.length>4000){out.push(unknown(line.slice(0,4000),'한 줄이 너무 깁니다. 항목별로 나누세요.'));continue;}
  if(/^(?:제품사양|검토결과)\s*[:：]?/i.test(line)){if(/요구규격|요구사항/.test(line))out.push(unknown(line,'제품사양과 요구규격이 같은 줄에 있습니다. 요구조건을 별도 줄로 분리하세요.'));productBlock=/^(?:제품사양|검토결과)\s*[:：]?\s*$/.test(line);continue;}
  if(/^요구규격/.test(line))productBlock=false;
  if(productBlock){out.push(unknown(line,'제품사양 블록입니다. 요구규격과 분리하여 확인하세요.'));continue;}
  if(IGNORE.test(line)||/^(?:수량\s*[:：]?\s*)?\d+\s*(?:대|식)(?:\s*일체형)?$/.test(line))continue;
  const ph=pairHeader(line);
  if(ph||pair){
   const kind=ph??pair.kind, r=parsePair(line,kind);
   if(r){if(pending)out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.',true));pending=null;out.push(...r);pair=null;continue;}
   if(ph){if(pending)out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.',true));pending=null;if(pair)out.push(unknown(pair.source,'복합 수치가 빠져 있습니다.',true));pair={kind,source:line};continue;}
   out.push(unknown(pair.source,'복합 수치가 빠져 있습니다.',true));pair=null;
  }
  if(pending){
   if(/^(?:요구규격\s*[:：]?\s*)?[<>≥≤=]*\s*\d/.test(line)){
    const r=parseBody(pending.key,pending.label,pending.unit,line,`${pending.source}\n${line}`);
    out.push(...r.requirements);if(r.missing)out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.',true));pending=null;continue;
   }
   out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.',true));pending=null;
  }
  const r=parseLine(line.replace(/^요구규격\s*[:：]?\s*/,''));out.push(...r.out);pending=r.pending;
 }
 if(pending)out.push(unknown(pending.source,'요구 수치가 빠져 있습니다.',true));
 if(pair)out.push(unknown(pair.source,'복합 수치가 빠져 있습니다.',true));
 if(out.length>600)throw new Error('추출 항목은 한 번에 600개까지입니다. 장비별로 나누어 주세요.');
 return out.map((r,i)=>({...r,id:`req-${i+1}`,userEdited:false}));
}
export function parseGroups(input){
 // Compact two-site requests with an explicit relative bandwidth and shared memory.
 const sites=String(input).trim().match(/^(본점|본사)(?:은|는)?\s*(?:(엘포|엘세븐|L4|L7)\s*)?(\d+(?:\.\d+)?)\s*기가\s*,\s*(DR)(?:은|는)?\s*그\s*절반\s*,\s*메모리(?:는|은)?\s*둘\s*다\s*(\d+(?:\.\d+)?)(?:\s*기가)?[.!]?\s*$/i);
 if(sites){
  const [,hq,layer,bandwidth,dr,memory]=sites;
  const clauses=String(input).trim().split(/\s*,\s*/);
  return [hq,dr].map((name,i)=>{
   const key=layer?(/엘포|L4/i.test(layer)?'l4_gbps':'l7_gbps'):'generic_gbps';
   const rate=metric(key,i===0?Number(bandwidth):Number(bandwidth)/2,clauses[i],{id:'req-1',userEdited:false});
   if(!layer)rate.ambiguity='layer';
   return {name,kind:'adc',quantity:'',requirements:[rate,metric('memory_gb',Number(memory),clauses[2],{id:'req-2',userEdited:false})]};
  });
 }
 const groups=[];let current={name:'요구사항',quantity:'',kind:'adc',lines:[]};
 for(const raw of normalizeText(input).split('\n')){
  const line=raw.trim();
  if(HEADING.test(line)){if(current.lines.length)groups.push(current);current={name:line,quantity:'',kind:/로그서버/i.test(line)?'log':'adc',lines:[]};}
  else {current.lines.push(raw);const q=line.match(/^(?:수량\s*[:：]?\s*)?(\d+)\s*(대|식)(?:\s*일체형)?$/);if(q)current.quantity=q[1]+q[2];}
 }
 if(current.lines.length)groups.push(current);
 return groups.map(({lines,...g})=>{
  const requirements=parseRequirements(lines.map(line=>{
   if(/gslb/i.test(g.name)&&/^\s*rps\b/i.test(line))return 'GSLB '+line;
   return line;
  }).join('\n'),g.name);
  if(/gslb/i.test(g.name))for(const r of requirements)if(r.key==='dns_qps'&&r.context!=='dns_express')Object.assign(r,LABELS.gslb_rps,{key:'gslb_rps'});
  return {...g,requirements};
 }).filter(g=>g.requirements.length);
}
