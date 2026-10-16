const test=require('node:test'),assert=require('node:assert/strict');
require('../extension/core.js');
const F=globalThis.Fasih;
require('../extension/runner.js');
const {CODES,fields}=require('./fixtures.cjs');
const fs=require('node:fs'),path=require('node:path');
if(fs.existsSync(path.join(__dirname,'../extension/identity-input.js')))require('../extension/identity-input.js');
if(fs.existsSync(path.join(__dirname,'../extension/identity-runner.js')))require('../extension/identity-runner.js');

test('identity input accepts Excel clipboard headers, deduplicates full keys, rejects truncated and malformed rows',()=>{
  assert.equal(typeof F.parseIdentityList,'function');
  const parsed=F.parseIdentityList('Kode Identitas\r\n'+CODES[0]+'\r\n'+CODES[0].replaceAll(' - ','-')+'\n\n'+CODES[1]);
  assert.deepEqual(parsed.codes,CODES);assert.equal(parsed.duplicates,1);
  assert.throws(()=>F.parseIdentityList('7271000000000000 - EC - …'),/baris 1/i);
  assert.throws(()=>F.parseIdentityList(CODES[0]+'\nwrong'),/baris 2/i);
  assert.throws(()=>F.parseIdentityList('Kode Identitas\n'),/kosong/i);
});

function scenario(codes=CODES){
  const base='https://fasih-sm.bps.go.id/app/surveys/identity/period/data?view=list&perPage=100&page=1&search=old';
  let job={id:'identity-job',context:F.context(base),options:{identityList:codes,prefix:'7271',linkHost:'esurvey.bps.go.id',actionDelayMs:50,nextDelayMs:0},status:'RUNNING',phase:'PROCESS',pages:{},targetCursor:0};
  const saved=new Map(codes.map((code,i)=>[F.key(code),{key:F.key(code),fields:{'Kode Identitas':code},inputOrder:i+1,result:'PENDING',stage:'MENUNGGU_PENCARIAN',attempts:0}]));
  let visible=[],empty=false;const links=[];
  const adapter={doc:{hidden:false},location:{href:base,assign(value){this.href=value;}},filterStamp:()=>'',cleanup:async()=>{},
    ready:async()=>{if(empty)return [];return visible;},readRows:()=>visible,lastPage:()=>true,
    findRow:key=>{const r=visible.find(r=>F.key(r.fields['Kode Identitas'])===key);if(!r)throw new Error('wrong identity');return r;},
    getLink:async key=>{links.push(key);return {link:'https://esurvey.bps.go.id/h/s/'+key,dialog:{}};},closeDialog:async()=>{}};
  const send=async m=>{if(m.type==='PATCH'){job={...job,...m.patch};return structuredClone(job);}if(m.type==='ROWS'){for(const r of m.rows)saved.set(r.key,structuredClone(r));return true;}throw Error(m.type);};
  const runner=()=>{const r=new F.IdentityRunner(adapter,send);r.sleep=async()=>{};return r;};
  return {get job(){return job;},saved,adapter,links,runner,setRows(rows){visible=rows.map(f=>({fields:f}));empty=!rows.length;}};
}
test('identity queue searches one full code per navigation and survives reload, exporting every input including not found',async()=>{
  assert.equal(typeof F.IdentityRunner,'function');const s=scenario();
  await s.runner().start(s.job,[...s.saved.values()]);
  assert.equal(new URL(s.adapter.location.href).searchParams.get('search'),CODES[0]);assert.equal(s.links.length,0);
  s.setRows([fields(CODES[0],'CAWI')]);await s.runner().start(s.job,[...s.saved.values()]);
  assert.equal(s.saved.get(F.key(CODES[0])).result,'DONE');assert.equal(new URL(s.adapter.location.href).searchParams.get('search'),CODES[1]);
  s.setRows([]);await s.runner().start(s.job,[...s.saved.values()]);
  assert.equal(s.saved.get(F.key(CODES[1])).result,'ERROR');assert.match(s.saved.get(F.key(CODES[1])).error,/tidak ditemukan/i);
  assert.equal(s.job.status,'NEEDS_ATTENTION');assert.equal(s.links.length,1);
  s.setRows([fields(CODES[1],'CAWI')]);await s.runner().resume(s.job,[...s.saved.values()],true);
  assert.equal(s.job.status,'COMPLETE');assert.equal(s.links.length,2);assert.equal(s.saved.get(F.key(CODES[0])).attempts,1);
});
test('similar search results cannot extract another identity; changed filters pause; saved link resumes without creation',async()=>{
  assert.equal(typeof F.IdentityRunner,'function');const s=scenario([CODES[0]]);
  await s.runner().start(s.job,[...s.saved.values()]);s.setRows([fields(CODES[1],'CAWI')]);
  await s.runner().start(s.job,[...s.saved.values()]);assert.equal(s.links.length,0);assert.equal(s.saved.get(F.key(CODES[0])).result,'ERROR');
  const row=s.saved.get(F.key(CODES[0]));row.result='PENDING';row.link='https://esurvey.bps.go.id/h/s/recovered';
  s.setRows([fields(CODES[0],'CAWI')]);s.adapter.filterStamp=()=> 'changed';
  await s.runner().start({...s.job,status:'RUNNING',targetCursor:0},[row]);assert.equal(s.job.status,'PAUSED');assert.equal(s.links.length,0);
  s.adapter.filterStamp=()=>'';await s.runner().resume(s.job,[row]);assert.equal(s.job.status,'COMPLETE');assert.equal(s.links.length,0);
});

test('ambiguous results and inactive tabs pause without extracting; stopping retains every target',async()=>{
  const s=scenario([CODES[0]]);await s.runner().start(s.job,[...s.saved.values()]);
  s.setRows([fields(CODES[0],'CAWI'),fields(CODES[0],'CAWI')]);
  await s.runner().start(s.job,[...s.saved.values()]);assert.equal(s.job.status,'PAUSED');assert.match(s.job.notice,/lebih dari sekali/);assert.equal(s.links.length,0);
  s.setRows([fields(CODES[0],'CAWI')]);s.adapter.doc.hidden=true;
  await s.runner().resume(s.job,[...s.saved.values()]);assert.equal(s.job.status,'PAUSED');assert.equal(s.links.length,0);
  s.adapter.doc.hidden=false;
  const runner=s.runner();s.adapter.getLink=async()=>{runner.pause(true);throw new F.BotError('stopped','CONTROL',true);};
  await runner.resume(s.job,[...s.saved.values()]);assert.equal(s.job.status,'STOPPED');assert.equal(s.saved.get(F.key(CODES[0])).result,'PENDING');assert.equal(s.saved.size,1);
});

test('broad search visits subsequent pages before declaring an identity missing',async()=>{
  const s=scenario([CODES[0]]);await s.runner().start(s.job,[...s.saved.values()]);
  s.setRows([fields(CODES[1],'CAWI')]);s.adapter.lastPage=()=>false;
  await s.runner().start(s.job,[...s.saved.values()]);assert.equal(new URL(s.adapter.location.href).searchParams.get('page'),'2');
  assert.equal(s.saved.get(F.key(CODES[0])).result,'PENDING');
  s.setRows([fields(CODES[0],'CAWI')]);s.adapter.lastPage=()=>true;
  await s.runner().start(s.job,[...s.saved.values()]);assert.equal(s.job.status,'COMPLETE');assert.equal(s.saved.get(F.key(CODES[0])).page,2);assert.equal(s.links.length,1);
});

test('a capped search with Next disabled pauses rather than reporting a false missing identity',async()=>{
  const s=scenario([CODES[0]]);await s.runner().start(s.job,[...s.saved.values()]);
  const tenth={...s.job,searchPage:10};await s.runner().start(tenth,[...s.saved.values()]);
  s.setRows(Array.from({length:100},(_,i)=>fields('7271000000000000 - EC - 1 - '+(20000+i),'CAWI')));
  await s.runner().start(s.job,[...s.saved.values()]);
  assert.equal(s.job.status,'PAUSED');assert.match(s.job.notice,/batas 1.000/);assert.equal(s.saved.get(F.key(CODES[0])).result,'PENDING');assert.equal(s.links.length,0);
});
