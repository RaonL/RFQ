/** Dependency-free static build. Only allowlisted browser assets are published. */
import {readFile,writeFile,mkdir,rm,cp,lstat,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';import {dirname,join} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const fixture=process.argv.includes('--fixture');
if(process.argv.slice(2).some(a=>a!=='--fixture'))throw new Error('지원 옵션: --fixture');
const source=join(root,fixture?'tests/fixtures/reference.json':'data/reference_data.json');
let reference;
try{reference=JSON.parse(await readFile(source,'utf8'));}catch(e){throw new Error(`기존 저장소의 data/reference_data.json이 필요합니다. 변경 파일을 원본 RFQ 저장소에 추가한 뒤 빌드하세요. (${e.message})`);}
if(!Array.isArray(reference.f5_models)||!reference.f5_models.length)throw new Error('등록 장비가 없거나 기준 JSON 형식이 잘못되었습니다.');
if(!fixture&&reference.fixture)throw new Error('시험용 사양은 실제 배포에 사용할 수 없습니다.');
const allowed=new Set(['L4/L7 Throughput','L4 CPS','L7 RPS (HTTP)','SSL TPS (RSA 2K)','SSL TPS RSA 2K','SSL Bulk','동시 커넥션','인터페이스','Memory','Storage','CPU / Tenancy','CPU (Total)']);
const servicePerformance=fixture?{}:JSON.parse(await readFile(join(root,'data/service_performance.json'),'utf8'));
const catalogue={schema_version:2,fixture,source_note:'원본 등록값 재사용. 공식 개정/라이선스/시험조건 재검토 필요.',sources:(reference.sources??[]).map(s=>({type:s.type,name:s.name})),
 f5_models:reference.f5_models.map(m=>({model:m.model,tier:m.tier,series:m.series,specs:Object.fromEntries(Object.entries(m.specs??{}).filter(([k])=>allowed.has(k))),metrics:m.metrics??{},metric_evidence:m.metric_evidence??{},servicePerformance:servicePerformance[m.model]})),
 comparisons:(reference.comparisons??[]).map(c=>({f5_model:c.f5_model,competitors:c.competitors??[],rows:c.rows??[]}))};
const output=join(root,fixture?'dist-fixture':'dist');
try{if((await lstat(output)).isSymbolicLink())throw new Error('배포 폴더 심볼릭 링크는 허용하지 않습니다.');}catch(e){if(e.code!=='ENOENT')throw e;}
await rm(output,{recursive:true,force:true});await mkdir(join(output,'data'),{recursive:true});
for(const name of ['index.html','styles.css','app.mjs','parser.mjs','matching.mjs','files.mjs'])await cp(join(root,'site',name),join(output,name));
await writeFile(join(output,'data/catalogue.json'),JSON.stringify(catalogue,null,2)+'\n');
try{await access(join(root,'static/platforms'));await cp(join(root,'static/platforms'),join(output,'platforms'),{recursive:true});}catch(e){if(e.code!=='ENOENT')throw e;}
console.log(`${fixture?'시험용':'배포용'} 정적 파일 생성: ${fixture?'dist-fixture':'dist'} / 모델 ${catalogue.f5_models.length}개`);
