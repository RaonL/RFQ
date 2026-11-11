import {parseGroups,LABELS,splitRequirements} from './parser.mjs';
import {normalizeCatalogue,rankModels,formatNumber,reportText} from './matching.mjs';
import {extractFile} from './files.mjs';
const $=id=>document.getElementById(id);
const state={reference:null,groups:[],evaluations:[],fileGeneration:0};
const example='[L4 장비]\nL4 Throughput 20Gbps 이상\nL7 Throughput 13Gbps 이상\nSSL TPS (RSA 2048bit) 7000 이상\nConcurrent Connection 19M 이상\nMemory 32GB 이상\n25G SFP28 4Port 이상\n10G Copper 4Port 이상\nSSD 480GB 이상';
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function message(text){$('messages').textContent=text;}
function invalidateResults(){state.evaluations=[];$('results').hidden=true;$('reviewed').checked=false;$('compare').disabled=true;}
function invalidateDraft(){state.fileGeneration++;state.groups=[];$('draft').hidden=true;invalidateResults();}
function fieldSelect(options,value,fn){const s=el('select');for(const [key,label] of options){const opt=el('option',label);opt.value=key;s.append(opt);}s.value=value;s.addEventListener('change',()=>{fn(s.value);invalidateResults();});return s;}
function contextEditor(r){
 if(r.key==='ssl_tps')return fieldSelect([['unspecified','RSA 기준 확인 필요'],['rsa2048','RSA 2048'],['rsa4096','RSA 4096']],r.algorithm??'unspecified',v=>{r.algorithm=v;r.userEdited=true;});
 if(r.key==='ecdsa_tps')return fieldSelect([['unspecified','곡선 미지정 · 수치 우선 비교'],['ecdsa_p256','ECDSA P-256'],['ecdsa_p384','ECDSA P-384']],r.algorithm??'unspecified',v=>{r.algorithm=v;r.userEdited=true;});
 if(r.key==='cpu_cores')return fieldSelect([['unspecified','코어 기준 확인 필요'],['physical','물리 코어']],r.context??'unspecified',v=>{r.context=v;r.userEdited=true;});
 if(r.key==='dns_qps')return fieldSelect([['unspecified','DNS 기준 미지정 · 수치 우선 비교'],['dns_express','DNS Express 권한 DNS'],['gslb','GSLB']],r.context??'unspecified',v=>{r.context=v;r.userEdited=true;});
 return null;
}
function renderReview(requirements,editable=false){
 if(!requirements.length)return null;
 const detail=el('details',undefined,'review-details');detail.append(el('summary',`기능·문구 별도 검토 ${requirements.length}개`));
 detail.append(el('p','아래 내용은 수치 충족·미충족 집계에 포함하지 않습니다. 기능 지원과 시험조건은 따로 확인하세요.','hint'));
 const list=el('ul',undefined,'review-list');
 for(const r of requirements){const row=el('li');row.append(el('strong',r.kind==='boolean'?r.label:'검토 문구'),el('p',r.source));if(r.note)row.append(el('small',r.note));
  if(editable){const select=fieldSelect([['','필요하면 수치 항목으로 지정'],...Object.entries(LABELS).map(([k,d])=>[k,d.label])],'',v=>{if(!v)return;Object.assign(r,LABELS[v],{key:v,kind:'numeric',value:null,algorithm:'unspecified',context:'unspecified',userEdited:true});renderDraft();});select.setAttribute('aria-label','별도 검토를 수치 항목으로 지정');row.append(select);}
  list.append(row);
 }
 detail.append(list);return detail;
}
function renderDraft(){
 const host=$('draft-groups');host.replaceChildren();let count=0,reviewCount=0;
 for(const group of state.groups){
  host.append(el('h3',group.name+(group.quantity?' · '+group.quantity:'')));
  const table=el('table',undefined,'draft-table'),head=el('tr');for(const title of ['해석 항목 / 시험 기준','조건','값','단위','원문 · 확인 사항'])head.append(el('th',title));table.append(head);
  const {comparison,review}=splitRequirements(group.requirements);reviewCount+=review.length;
  for(const r of comparison){count++;const tr=el('tr'),name=el('td');
   const opts=[['','수동 확인 / 미해석'],...Object.entries(LABELS).map(([k,d])=>[k,d.label])];
   const select=fieldSelect(opts,LABELS[r.key]?r.key:'',v=>{if(v){r.key=v;Object.assign(r,LABELS[v]);r.kind='numeric';r.algorithm='unspecified';r.context='unspecified';r.userEdited=true;renderDraft();}});select.setAttribute('aria-label','해석 항목');name.append(select);
   const ctx=contextEditor(r);if(ctx){ctx.setAttribute('aria-label',r.key+' 시험 기준');name.append(ctx);}if(r.userEdited)name.append(el('small','수동 수정 · 원문과 대조 필요'));
   const op=el('td'),value=el('td'),unit=el('td',r.unit),src=el('td');
   const opInput=fieldSelect(['>=','<=','>','<','='].map(x=>[x,x]),r.operator,v=>{r.operator=v;r.userEdited=true;});opInput.disabled=r.kind!=='numeric';opInput.setAttribute('aria-label',r.label+' 비교 조건');op.append(opInput);
   if(r.kind==='numeric'){const num=el('input');num.type='number';num.step='any';num.min='0';num.value=r.value??'';num.setAttribute('aria-label',r.label+' 요구값');num.addEventListener('input',()=>{r.value=num.valueAsNumber;r.userEdited=true;invalidateResults();});value.append(num);}else value.textContent=r.kind==='boolean'?'필수':'확인 필요';
   const detail=el('details'),sum=el('summary','원문 보기');detail.append(sum,el('pre',r.source));if(r.note)detail.append(el('small',r.note));src.append(detail);
   tr.append(name,op,value,unit,src);table.append(tr);
  }
  if(comparison.length){const scroll=el('div',undefined,'scroll');scroll.append(table);host.append(scroll);}else host.append(el('p','비교할 수치가 없습니다. 별도 검토에서 항목을 지정하거나 요구 수치를 입력하세요.','hint'));
  const reviewDetail=renderReview(review,true);if(reviewDetail)host.append(reviewDetail);
 }
 $('draft-count').textContent=`${state.groups.length}개 그룹 · 수치 ${count}개 · 별도 검토 ${reviewCount}개`;$('draft').hidden=false;
}
function badge(status){return el('span',status==='pass'?'수치상 충족':status==='fail'?'미충족':'확인 필요','badge '+status);}
function renderChecks(ev){
 const table=el('table',undefined,'numeric-table'),head=el('tr');for(const t of ['항목','요구 조건','등록값','수치 판정','근거·주의사항'])head.append(el('th',t));table.append(head);
 for(const c of ev.checks){const tr=el('tr'),status=el('td'),note=el('td');status.append(badge(c.status));if(c.conditionPending)status.append(el('small','시험조건 별도 확인','condition-note'));
  const detail=el('details');detail.append(el('summary',c.conditionPending?'시험조건 확인':'근거 보기'),el('small',c.evidenceNote??''));if(c.reason)detail.append(el('p',c.reason));
  if(/^https:\/\//.test(c.sourceUrl??'')){const a=el('a','등록 원문 링크');a.href=c.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';detail.append(a);}note.append(detail);
  tr.append(el('td',c.label),el('td',`${c.kind==='numeric'?c.operator??'':''} ${formatNumber(c.value,c.unit)}`),el('td',formatNumber(c.actual,c.unit)),status,note);table.append(tr);
 }
 const wrap=el('div',undefined,'scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label',ev.model.model+' 요구값과 등록값 비교표');wrap.append(table);return wrap;
}
function renderCatalogue(){
 const models=normalizeCatalogue(state.reference,true).models,picker=$('model-picker');picker.replaceChildren();
 for(const m of models){const o=el('option',m.model);o.value=m.model;picker.append(o);}
 const show=()=>{const m=models.find(m=>m.model===picker.value),host=$('model-details');host.replaceChildren();if(!m)return;
  let family=/r[24]\d{3}/i.exec(m.model)?.[0][1];
  const file=family?`r${family}000-front-view.png`:/r5\d{3}/i.test(m.model)?'r5000-front-view.png':/r10\d{3}/i.test(m.model)?'r10000-front-view.png':null;
  if(file&&!state.reference.fixture){const img=el('img');img.src='./platforms/'+file;img.alt=m.model+' 계열 전면 참고 이미지';img.className='platform-image';img.addEventListener('error',()=>img.remove());host.append(img);}
  const table=el('table');for(const [label,value] of Object.entries(m.rawSpecs)){const row=el('tr');row.append(el('th',label),el('td',String(value)));table.append(row);}const wrap=el('div',undefined,'scroll');wrap.append(table);host.append(wrap,el('p','위 표와 판정기는 같은 등록 자료를 사용합니다. 최신 공식 사양과 다른 항목은 기준 파일부터 수정해야 합니다.','hint'));
 };picker.addEventListener('change',show);show();
}
function competitorTable(modelName){
 const c=(state.reference.comparisons??[]).find(c=>c.f5_model===modelName);if(!c)return null;
 const detail=el('details');detail.append(el('summary','경쟁 모델 비교 · 등록 자료 참고'),el('p','제품별 개정·라이선스·시험 기준이 다를 수 있습니다. 이 표는 자동 충족 판정에 사용하지 않습니다.','hint'));
 const products=[c.f5_model,...(c.competitors??[])],table=el('table'),head=el('tr');head.append(el('th','항목'));for(const name of products)head.append(el('th',name));table.append(head);
 for(const r of c.rows??[]){const row=el('tr');row.append(el('td',r.metric));for(const name of products)row.append(el('td',String(r.values?.[name]??'-')));table.append(row);}const scroll=el('div',undefined,'scroll');scroll.append(table);detail.append(scroll);return detail;
}
function compare(){
 if(!$('reviewed').checked)return;
 const catalogue=normalizeCatalogue(state.reference,$('include-excluded').checked),host=$('result-groups');host.replaceChildren();state.evaluations=[];
 for(const group of state.groups){
  const card=el('section',undefined,'result-card');card.append(el('h3',group.name));
  if(group.kind==='log'){card.append(el('p','로그서버 조건은 rSeries ADC 후보 추천에서 제외합니다. 보존 기간·수집량·스토리지는 별도 검토하세요.'));host.append(card);continue;}
  const evaluations=rankModels(catalogue.models,group.requirements);state.evaluations.push({group,evaluations});
  const best=evaluations[0];if(!best){card.append(el('p','비교 가능한 등록 모델이 없습니다.'));host.append(card);continue;}
  if(!best.checks.length){card.append(el('p','비교할 수치 요구조건이 없습니다.','summary'));const review=renderReview(best.reviewRequirements);if(review)card.append(review);host.append(card);continue;}
  const overview=el('div',undefined,'candidate-overview'),intro=el('div');
  intro.append(el('p',best.numericCandidate?'NUMERIC MATCH':'NUMERIC REVIEW','eyebrow'),el('p',best.model.model,'candidate-name'),el('p',best.numericCandidate?'등록 수치상 우선 검토 후보':'수치 조건을 더 확인해야 하는 모델','summary'));overview.append(intro);
  const stats=el('div',undefined,'result-stats');
  for(const [label,value,cls] of [['수치상 충족',best.passed,'pass'],['미충족',best.failed,'fail'],['수치 확인',best.unknown,'unknown']]){const stat=el('div',undefined,'result-stat '+cls);stat.append(el('strong',String(value)),el('span',label));stats.append(stat);}overview.append(stats);card.append(overview);
  card.append(el('p',best.numericCandidate?`수치 ${best.checks.length}개를 모두 충족합니다. 기능 지원·시험조건은 아래에서 별도로 확인하세요.`:'전체 수치 조건을 확인한 모델이 없습니다. 아래 요구값과 등록값을 확인하세요.','result-note'));
  const conditionCount=best.checks.filter(c=>c.conditionPending&&c.status!=='unknown').length;
  if(conditionCount)card.append(el('p',`시험조건이 미지정된 ${conditionCount}개 항목은 수치만 우선 비교했습니다. 해당 행에 별도로 표시했습니다.`,'hint'));
  card.append(el('h4','요구 수치와 등록값'),el('p','표를 좌우로 밀어 요구값·등록값·판정을 확인하세요.','table-hint'),renderChecks(best));
  const review=renderReview(best.reviewRequirements);if(review)card.append(review);
  const allModels=el('details',undefined,'model-comparison');allModels.append(el('summary',`전체 모델 ${evaluations.length}개 비교`));
  const table=el('table'),head=el('tr');for(const title of ['모델','구분','수치상 충족','미충족','수치 확인'])head.append(el('th',title));table.append(head);
  for(const e of evaluations){const tr=el('tr');tr.append(el('td',e.model.model),el('td',e.numericCandidate?'수치상 후보':'추가 검토'),el('td',String(e.passed)),el('td',String(e.failed)),el('td',String(e.unknown)));table.append(tr);}
  const scroll=el('div',undefined,'scroll');scroll.append(table);allModels.append(scroll);
  for(const e of evaluations.slice(1,3)){const d=el('details');d.append(el('summary',`${e.model.model} · 항목별 비교`),renderChecks(e));allModels.append(d);}card.append(allModels);
  const competition=competitorTable(best.model.model);if(competition)card.append(competition);
  const report=el('textarea');report.className='report';report.readOnly=true;report.value=reportText(group,best);report.setAttribute('aria-label',group.name+' 검토 문구');
  const reportDetail=el('details',undefined,'report-details');reportDetail.append(el('summary','검토 문구 내보내기'));
  const copy=el('button','검토 문구 복사','subtle');copy.type='button';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(report.value);copy.textContent='복사됨';}catch{report.focus();report.select();copy.textContent='선택된 문구를 Ctrl+C로 복사하세요';}});reportDetail.append(copy,report);card.append(reportDetail);host.append(card);
 }
 $('results').hidden=false;$('results').scrollIntoView({behavior:'smooth',block:'start'});
}
$('requirements').addEventListener('input',()=>{invalidateDraft();message('입력이 변경되었습니다. 다시 추출해 주세요.');});
$('example').addEventListener('click',()=>{$('requirements').value=example;invalidateDraft();message('예시를 입력했습니다. 요구사항 추출을 눌러 주세요.');});
$('include-excluded').addEventListener('change',invalidateResults);
$('parse').addEventListener('click',()=>{try{invalidateResults();state.groups=parseGroups($('requirements').value);if(!state.groups.length)throw new Error('추출할 요구조건이 없습니다.');renderDraft();message('수치 요구조건을 추출했습니다. 기능·문구는 별도 검토로 모았습니다. 값을 확인한 뒤 비교하세요.');}catch(e){state.groups=[];$('draft').hidden=true;message(e.message);}});
$('reviewed').addEventListener('change',()=>{$('compare').disabled=!$('reviewed').checked;});
$('compare').addEventListener('click',()=>{try{compare();}catch(e){message(e.message);}});
$('file').addEventListener('change',async()=>{
 const file=$('file').files[0];if(!file)return;invalidateDraft();const generation=state.fileGeneration;message('브라우저에서 파일을 읽는 중입니다…');$('parse').disabled=true;
 try{const result=await extractFile(file,{encoding:$('encoding').value});if(generation!==state.fileGeneration){message('원문이 변경되어 파일 자동 반영을 취소했습니다. 다시 선택해 주세요.');return;}
  if(!result.text.trim())throw new Error('요구사항 텍스트가 없습니다.');const text=[$('requirements').value,result.text].filter(Boolean).join('\n');if(text.length>250000)throw new Error('추출 텍스트가 너무 많습니다. 필요한 페이지만 분리하세요.');$('requirements').value=text;invalidateDraft();message(['기존 입력 뒤에 파일 내용을 추가했습니다. 원문을 확인한 뒤 추출하세요.',...result.warnings].join('\n'));
 }catch(e){message(e.message);}finally{$('file').value='';$('parse').disabled=!state.reference;}
});
$('export').addEventListener('click',()=>{
 const data={format:'f5-rfq-review-v2',createdAt:new Date().toISOString(),notice:'등록수치 비교이며 최종 제품 적합성 확정 아님',input:$('requirements').value,results:state.evaluations};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download='rfq-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
try{
 const response=await fetch('./data/catalogue.json',{cache:'no-cache'});if(!response.ok)throw new Error(`HTTP ${response.status}`);state.reference=await response.json();const c=normalizeCatalogue(state.reference);
 $('catalogue-status').textContent=`등록 ${c.models.length}개 모델 · 기본 제외 ${c.excluded.length}개 · 공식 개정/시험조건 재검토 필요`;
 $('source-status').textContent=`기준 파일: ${(c.sources??[]).map(s=>s.name??s.type).join(' / ')||'data/reference_data.json'}. 원본 자료 개정일과 최종 검증일은 별도 확인해야 합니다.`;
 if(state.reference.fixture)$('catalogue-status').textContent='시험용 샘플 데이터입니다. 실제 제안에 사용하지 마세요.';
 renderCatalogue();$('parse').disabled=false;
}catch(e){state.reference=null;$('catalogue-status').textContent='장비 기준 데이터를 불러오지 못했습니다.';message(`빌드 결과의 data/catalogue.json을 확인하세요 (${e.message}).`);}
