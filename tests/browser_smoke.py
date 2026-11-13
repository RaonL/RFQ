import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
base=ROOT/'dist-fixture'
ART=ROOT/'test-artifacts'
ART.mkdir(exist_ok=True)
checks=[]
with sync_playwright() as p:
  executable=os.getenv('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
  browser=p.chromium.launch(executable_path=executable,headless=True)
  page=browser.new_page(viewport={'width':1440,'height':1100})
  errors=[];requests=[]
  page.on('pageerror',lambda e: errors.append(str(e)))
  page.on('request',lambda r: requests.append((r.method,r.url)))
  def offline_load():
   # Offline DOM test harness: network navigation is blocked by container policy.
   # This deliberately tests UI/state logic, NOT CSP, CDN delivery or ESM networking.
   import re
   html=(base/'index.html').read_text()
   html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>', '', html)
   html=re.sub(r'<script[^>]*>.*?</script>', '', html)
   html=re.sub(r'<link[^>]+>', '', html)
   page.set_content(html)
   page.add_style_tag(content=(base/'styles.css').read_text())
   def module(name, imports, exports):
    code=(base/(name+'.mjs')).read_text()
    code=re.sub(r'^import .*?;\n','',code,flags=re.M)
    code=re.sub(r'\bexport (?=(?:async )?function|const)', '', code)
    return 'const '+name+'Module=(()=>{'+imports+code+';return {'+exports+'};})();'
   src=module('parser','', 'parseGroups,parseRequirements,LABELS,PORT_SPEEDS,quantity,splitRequirements')
   src+=module('matching','const {LABELS,PORT_SPEEDS,quantity,splitRequirements}=parserModule;', 'normalizeCatalogue,rankModels,formatNumber,registeredValue,reportText,materialQuestions,interpret,interpretations')
   src+=module('files','', 'extractFile')
   src+='const {parseGroups,LABELS,splitRequirements}=parserModule;const {normalizeCatalogue,rankModels,formatNumber,registeredValue,reportText,materialQuestions,interpret,interpretations}=matchingModule;const {extractFile}=filesModule;'
   src+=re.sub(r'^import .*?;\n','',(base/'app.mjs').read_text(),flags=re.M)
   fixture=json.loads((base/'data/catalogue.json').read_text())
   page.evaluate('(data)=>{window.fetch=async()=>({ok:true,json:async()=>data});}', fixture)
   page.evaluate('async()=>{'+src+'}')
   page.wait_for_function("!document.getElementById('parse').disabled")
  offline_load()
  page.click('#example');page.click('#parse');assert page.locator('#draft-count').inner_text()=='1개 그룹 · 수치 8개 · 별도 검토 0개';checks.append('example: 8 requirements')
  assert page.locator('#compare').is_enabled();page.click('#compare')
  assert page.locator('#results .candidate-name').inner_text()=='F5 r2600';checks.append('minimum tier candidate with human review')
  page.screenshot(path=str(ART/'ui-desktop.png'),full_page=True)
  page.locator('#draft input[type=number]').first.fill('1000');assert page.locator('#results').is_hidden();assert page.locator('#compare').is_enabled();checks.append('editing extraction invalidates previous result')
  page.fill('#requirements','L4 Throughput 20Gbps 이상 L7 Throughput 40Gbps 이상');page.click('#parse');page.click('#compare')
  assert page.locator('#results .candidate-name').inner_text()=='F5 r5600';checks.append('same-line L7 condition changes selected candidate')
  page.fill('#requirements','SSL TPS (RSA 2048bit) 10000 이상');page.click('#parse');assert page.locator('#draft input[type=number]').first.input_value()=='10000';page.click('#compare');assert page.locator('#results .candidate-name').inner_text()=='F5 r2800';checks.append('RSA key length not confused with TPS')
  page.fill('#requirements','SSL TPS 7000 이상 RSA 4096');page.click('#parse');page.click('#compare');assert '전체 수치 조건을 확인한 모델이 없습니다.' in page.locator('#results').inner_text();checks.append('RSA4096 not declared satisfied by RSA2048')
  page.fill('#requirements','L4 Throughput 20Gbps 이상 <img src=x onerror="window.injected=1">');page.click('#parse');page.click('#compare');assert page.evaluate('window.injected') is None;assert '전체 수치 조건을 확인한 모델이 없습니다.' in page.locator('#results').inner_text();checks.append('unparsed tail blocks candidate; HTML not executed')
  page.fill('#requirements','');page.set_input_files('#file',{'name':'rfq.csv','mimeType':'text/csv','buffer':'항목,요구규격,제품사양\nStorage,1TB 이상,480GB'.encode()});page.wait_for_function("document.getElementById('requirements').value.includes('Storage 1TB')");assert '480GB' not in page.locator('#requirements').input_value();page.click('#parse');assert page.locator('#draft input[type=number]').first.input_value()=='1000';checks.append('real CSV upload selects requirement not offered value')
  page.fill('#requirements','');page.select_option('#encoding','euc-kr');page.set_input_files('#file',{'name':'korean.txt','mimeType':'text/plain','buffer':'동시 커넥션 2,400만 CC 이상'.encode('cp949')});page.wait_for_function("document.getElementById('requirements').value.includes('2,400만')");page.click('#parse');assert page.locator('#draft input[type=number]').first.input_value()=='24000000';checks.append('real CP949 upload')
  page.fill('#requirements','로그서버(WAF)\nStorage 20TB 이상');page.click('#parse');page.click('#compare');assert 'rSeries ADC 후보 추천에서 제외' in page.locator('#results').inner_text();checks.append('log server not recommended as ADC')
  page.click('#example');page.click('#parse');page.click('#compare')
  with page.expect_download() as download:page.click('#export')
  assert download.value.suggested_filename=='rfq-review.json';data=json.loads(Path(download.value.path()).read_text());assert data['format']=='f5-rfq-review-v2';checks.append('local JSON export')
  page.set_input_files('#file',{'name':'unsupported.bin','mimeType':'application/octet-stream','buffer':b'x'});page.wait_for_function("document.getElementById('messages').textContent.includes('지원 형식')");assert page.locator('#results').is_hidden();checks.append('starting a file import clears stale previous results even on failure')
  page.set_viewport_size({'width':390,'height':844});offline_load();page.click('#example');page.click('#parse');assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth') is True;page.screenshot(path=str(ART/'ui-mobile.png'),full_page=True);checks.append('mobile layout contained')
  page.fill('#requirements','Memory 32GB 이상\nSSL TPS (RSA 4096) 7000 이상\nL4 Throughput 1000Gbps 이상')
  page.click('#parse');page.click('#compare')
  card=page.locator('#results .result-card')
  rows=card.locator(':scope > .scroll tbody tr:visible')
  for status in ['unknown','fail']:
   button=card.locator('button.result-stat.'+status)
   button.click()
   assert button.get_attribute('aria-pressed')=='true'
   assert rows.count()==1 and rows.first.get_attribute('class')==status
  card.get_by_role('button',name='전체 보기',exact=True).click()
  assert rows.count()==3
  checks.append('mobile status buttons filter and restore the comparison rows')
  page.fill('#requirements','SSL TPS (RSA 4096) 7000 이상');page.click('#parse');page.click('#compare')
  card.locator('button.result-stat.unknown').click()
  editor=card.locator('.inline-editor');editor.locator('summary').click()
  editor.get_by_label('시험 기준',exact=True).select_option('rsa2048')
  editor.get_by_label('요구값 (TPS)',exact=True).fill('10000')
  editor.get_by_role('button',name='수정하고 다시 비교').click()
  outcome=card.locator('.inline-outcome')
  assert 'F5 r2600 → F5 r2800' in outcome.inner_text() and 'RSA 2048' in outcome.inner_text()
  assert outcome.evaluate('n=>n===document.activeElement') and page.locator('#requirements').input_value()=='SSL TPS (RSA 4096) 7000 이상'
  checks.append('inline basis and value edits rerank candidates and focus the local result')
  assert not errors,errors;assert not [r for r in requests if r[0]!='GET'],requests;assert not [r for r in requests if not r[1].startswith('http://127.0.0.1:8765')],requests;checks.append('offline DOM harness: no page errors')
  browser.close()
(ART/'browser-results.json').write_text(json.dumps({'passed':len(checks),'checks':checks,'scope':'Offline DOM harness with fixture data, fetch replaced for local data only; network navigation prohibited; CSP/ESM/CDN/PDF/XLSX not exercised'},ensure_ascii=False,indent=2))
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
