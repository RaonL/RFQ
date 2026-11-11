/** File bytes stay in the browser; only fixed-version library assets use the CDN. */
export const MAX_FILE_BYTES=16*1024*1024;
const MAX_ROWS=5000, MAX_CELLS=100000, MAX_PAGES=100;
export function decodeText(bytes,encoding='utf-8') {
 if(!['utf-8','euc-kr'].includes(encoding))throw new Error('지원하지 않는 인코딩입니다.');
 try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch {throw new Error('문자 인코딩을 읽지 못했습니다. UTF-8 또는 CP949 옵션을 확인하세요.');}
}
export function parseDelimited(text,delimiter){
 if(text.length>250000)throw new Error('CSV 텍스트는 250,000자 이내로 나누어 주세요.');
 if(!delimiter){const first=text.split(/\r?\n/,1)[0];delimiter=first.includes('\t')?'\t':',';}
 let rows=[],row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else {quoted=false;closed=true;}}else cell+=ch;continue;}
  if(ch==='"'){if(cell||closed)throw new Error('CSV 따옴표 형식을 확인하세요.');quoted=true;}
  else if(ch===delimiter){row.push(cell);cell='';closed=false;}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';closed=false;if(rows.length>MAX_ROWS)throw new Error('행이 너무 많습니다. 요구사항 시트만 분리하세요.');}
  else {if(closed&&!/\s/.test(ch))throw new Error('CSV 닫힌 따옴표 뒤에 잘못된 문자가 있습니다.');if(!closed)cell+=ch;}
 }
 if(quoted)throw new Error('CSV 따옴표가 닫히지 않았습니다.');
 if(cell||row.length){row.push(cell);rows.push(row);}
 return rows;
}
export function rowsToText(rows){
 if(rows.length>MAX_ROWS||rows.reduce((n,r)=>n+r.length,0)>MAX_CELLS)throw new Error('표가 너무 큽니다. 요구사항 범위를 줄여 주세요.');
 const clean=rows.map(r=>r.map(x=>x===null||x===undefined?'':String(x).trim()));
 let header=-1,req=-1,metric=-1;const warnings=[];
 for(let i=0;i<Math.min(clean.length,20);i++){
  const candidates=clean[i].map((x,j)=>/^(요구\s*(규격|사항|성능)|필수\s*규격|requirements?)$/i.test(x)?j:-1).filter(j=>j>=0);
  if(candidates.length){if(candidates.length>1)warnings.push('요구 열이 여러 개입니다. 첫 번째 요구 열을 사용하고 나머지도 원문에 보존합니다.');header=i;req=candidates[0];metric=clean[i].findIndex(x=>/^(항목|구분|성능항목|metric|item)$/i.test(x));break;}
 }
 const lines=[];
 if(header>=0){
  const excluded=new Set(clean[header].map((x,j)=>/제품\s*사양|제안\s*(규격|사양)|검토\s*결과|offered|actual/i.test(x)?j:-1).filter(j=>j>=0));
  for(const row of clean.slice(header+1)){
   if(!row.some(Boolean))continue;
   const label=metric>=0?(row[metric]??''):'',value=row[req]??'';
   if(!label&&!value)continue;
   lines.push(value?`${label&& !value.includes(label)?label+' ':''}${value}`:`${label} 요구값 누락`);
   row.forEach((v,j)=>{if(v&&j!==req&&j!==metric&&!excluded.has(j))lines.push(`${clean[header][j]??'추가 조건'}: ${v}`);});
  }
 }else {warnings.push('요구규격/제품사양 열을 식별하지 못했습니다. 추출된 원문을 편집하여 요구조건만 남기세요.');for(const row of clean)if(row.some(Boolean))lines.push(row.filter(v=>v!=='').join(' '));}
 return {text:lines.join('\n'),warnings};
}
export function pdfItemsToText(items){
 const lines=[];
 for(const item of [...items].filter(x=>typeof x.str==='string'&&x.str.trim()).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4])){
  const y=item.transform[5];let row=lines.find(r=>Math.abs(r.y-y)<=2);
  if(!row){row={y,items:[]};lines.push(row);}row.items.push(item);
 }
 return lines.sort((a,b)=>b.y-a.y).map(r=>r.items.sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join(' ')).join('\n');
}
export async function extractFile(file,{encoding='utf-8'}={}){
 if(!file||file.size>MAX_FILE_BYTES)throw new Error('파일은 16MB 이하여야 합니다.');
 const ext=file.name.split('.').at(-1).toLowerCase();
 if(!['txt','csv','xlsx','xlsm','pdf'].includes(ext))throw new Error('지원 형식: TXT, CSV, XLSX, XLSM, PDF');
 const bytes=await file.arrayBuffer();
 if(ext==='txt')return {text:decodeText(bytes,encoding),warnings:[]};
 if(ext==='csv')return rowsToText(parseDelimited(decodeText(bytes,encoding)));
 try{
  if(ext==='xlsx'||ext==='xlsm'){
   const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
   const wb=XLSX.read(bytes,{type:'array',cellFormula:true,cellHTML:false,bookVBA:false,sheetRows:MAX_ROWS+2});
   const parts=[],warnings=[];
   for(const name of wb.SheetNames){
    const sheet=wb.Sheets[name],range=sheet['!fullref']??sheet['!ref'];
    if(range){const r=XLSX.utils.decode_range(range);if(r.e.r-r.s.r+1>MAX_ROWS||(r.e.r-r.s.r+1)*(r.e.c-r.s.c+1)>MAX_CELLS)throw new Error('시트가 너무 큽니다. 필요한 행·열만 분리하세요.');}
    const missing=[],formula=[];
    for(const [address,cell] of Object.entries(sheet))if(!address.startsWith('!')&&cell?.f){formula.push(address);if(cell.v===undefined||cell.v===null)missing.push(address);}
    const result=rowsToText(XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:''}));
    if(result.text)parts.push(`[${name.replace(/[\[\]\r\n]/g,' ')}]\n${result.text}`);
    warnings.push(...result.warnings.map(w=>`${name}: ${w}`));
    if(formula.length)warnings.push(`${name}: 수식 ${formula.length}개는 저장된 계산값을 사용합니다. 재계산하지 않습니다.`);
    if(missing.length)parts.push(`수식 계산값 없음: ${name} ${missing.join(', ')}`);
   }
   return {text:parts.join('\n'),warnings};
  }
  const PDF=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.mjs');
  PDF.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/pdf.worker.mjs';
  const task=PDF.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/cmaps/',cMapPacked:true,standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/standard_fonts/'});
  let doc;
  try{
   doc=await task.promise;if(doc.numPages>MAX_PAGES)throw new Error('PDF는 100페이지 이하로 분리해 주세요.');
   const texts=[];let total=0;
   for(let n=1;n<=doc.numPages;n++){const p=await doc.getPage(n);const text=pdfItemsToText((await p.getTextContent()).items);total+=text.length;if(total>250000)throw new Error('PDF 텍스트가 너무 많습니다. 요구규격 페이지만 분리하세요.');texts.push(text);p.cleanup();}
   const text=texts.join('\n');if(!text.trim())throw new Error('텍스트가 없는 스캔 PDF입니다. OCR을 수행하지 않습니다. 요구사항을 직접 입력하세요.');
   return {text,warnings:['PDF 표·다단 문서는 열 순서가 달라질 수 있습니다. 제품사양 열을 제거하고 요구규격 원문과 반드시 대조하세요.']};
  }finally{if(doc)await doc.destroy();else await task.destroy();}
 }catch(e){throw new Error(`파일 추출 실패: ${e.message}. CDN 접근·파일 암호화 여부를 확인하거나 TXT/CSV로 입력하세요.`);}
}
