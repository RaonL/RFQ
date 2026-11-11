import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
test('fixture build is isolated and marked, never a production data substitute',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs','--fixture']);
 const data=JSON.parse(await readFile('dist-fixture/data/catalogue.json','utf8'));assert.equal(data.fixture,true);assert.equal(data.f5_models.length,4);
 const files=await readdir('dist-fixture');assert.ok(files.includes('index.html'));assert.ok(!files.includes('app.py'));assert.ok(!files.includes('matching.py'));
 const page=await readFile('dist-fixture/index.html','utf8');assert.match(page,/type="module"/);assert.doesNotMatch(page,/\{\{/);
});
