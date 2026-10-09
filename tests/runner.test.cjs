const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../extension/core.js'),Runner=require('../extension/runner.js');
const {CODES,fields}=require('./fixtures.cjs');
const url='https://fasih-sm.bps.go.id/app/surveys/survey/period/data?page=1&perPage=100&view=list';
function scenario(modes=['CAWI','CAWI']) {
  const mutable=modes.map((mode,i)=>({fields:fields(CODES[i],mode)}));
  const job={id:'test-job',context:F.context(url),options:{prefix:'7271',region:'Kota Palu',pilot:false,limit:0,linkHost:'esurvey.bps.go.id'},
    phase:'INVENTORY',status:'RUNNING',pages:{},visitPages:[],processPages:[],attempted:[]};
  const saved=new Map(),events=[],store={job};
  const send=async m=>{
    if(m.type==='PATCH') {store.job={...store.job,...m.patch};return structuredClone(store.job);}
    if(m.type==='CHECKPOINT') {m.rows.forEach(r=>saved.set(r.key,structuredClone(r)));store.job={...store.job,...m.patch};return structuredClone(store.job);}
    if(m.type==='ROWS') {m.rows.forEach(r=>saved.set(r.key,structuredClone(r)));return true;}
    throw new Error(m.type);
  };
  const adapter={doc:{hidden:false},location:{href:url,assign:newUrl=>{adapter.location.href=newUrl;}},
    filterStamp:()=>'',readRows:()=>mutable,ready:async()=>mutable,cleanup:async()=>{},lastPage:()=>true,
    findRow:k=>{const row=mutable.find(r=>F.key(r.fields['Kode Identitas'])===k);if(!row)throw new F.BotError('Missing');return row;},
    openMenu:async(k,item)=>{events.push(item+':'+k);return {key:k};},selectCawi:async()=>{throw new Error('Forbidden CAWI step');},switchesOff:async()=>{throw new Error('Forbidden toggle step');},
    saveMode:async()=>{events.push('SAVE');throw new Error('Forbidden mode save');},
    getLink:async(k)=>{events.push('LINK');const dialog=await adapter.openMenu(k,'Pengaturan Email');return {link:'https://esurvey.bps.go.id/h/s/'+k.slice(-3),dialog};},closeDialog:async()=>{}};
  const runner=new Runner(adapter,send),delays=[];runner.sleep=async ms=>{delays.push(ms);};
  return {job,store,saved,mutable,send,adapter,events,runner,delays};
}
test('runner extracts links from CAWI rows without mode actions or mode-save stages',async()=> {
  const s=scenario();await s.runner.start(s.job);
  assert.equal(s.store.job.status,'COMPLETE');assert.equal(s.saved.size,2);
  assert.equal(s.events.filter(e=>e==='SAVE').length,0);
  assert.equal([...s.saved.values()].every(r=>r.result==='DONE'&&r.finalMode==='CAWI'&&r.link),true);
  assert.deepEqual(s.events.filter(e=>e.startsWith('Ganti Mode')),[]);
  assert.equal([...s.saved.values()].some(r=>r.stage==='SAVE_MODE_DICOBA'),false);
  assert.equal(s.store.job.operation,'EXTRACT_LINK');
});

test('default and custom pacing apply to the adapter and between records, including a legacy resumed job',async()=>{
  const s=scenario();await s.runner.start(s.job);
  assert.equal(s.adapter.actionDelayMs,500);assert.deepEqual(s.delays,[1000,1000]);
  const custom=scenario();custom.job.options.actionDelayMs=750;custom.job.options.nextDelayMs=1500;
  await custom.runner.start(custom.job);
  assert.equal(custom.adapter.actionDelayMs,750);assert.deepEqual(custom.delays,[1500,1500]);
  const old=scenario(['CAWI']);old.job.options={...old.job.options};old.job.phase='PROCESS';old.job.status='PAUSED';
  const key=F.key(CODES[0]);old.job.pages={1:key};
  await old.runner.resume(old.job,[{key,fields:old.mutable[0].fields,result:'ERROR',error:'Timeout',attempts:1,page:1}],true);
  assert.equal(old.saved.get(key).result,'DONE');assert.equal(old.adapter.actionDelayMs,500);assert.deepEqual(old.delays,[1000]);
});

test('starting from table routes to list and preserves the search before any action',async()=> {
  const s=scenario(['CAWI']);const tableUrl=url.replace('view=list','view=table')+'&search=-+EC+-';
  s.adapter.location.href=tableUrl;s.job.context=F.context(tableUrl);
  await s.runner.start(s.job);
  assert.equal(F.context(s.adapter.location.href).view,'list');assert.equal(new URL(s.adapter.location.href).searchParams.get('search'),'- EC -');
  assert.equal(s.events.length,0);assert.equal(s.saved.size,0);assert.equal(s.store.job.navigating.url,s.adapter.location.href);
  await s.runner.start(s.store.job);assert.equal(s.store.job.status,'COMPLETE');assert.equal(F.totals([...s.saved.values()]).done,1);
});

test('list cards missing optional fields still reach link extraction',async()=> {
  const s=scenario();
  for(const row of s.mutable)for(const c of F.sourceColumns)if(!['Kode Identitas','Status','Mode'].includes(c))delete row.fields[c];
  await s.runner.start(s.job);
  assert.equal(s.store.job.status,'COMPLETE');assert.equal(F.totals([...s.saved.values()]).done,2);
  assert.equal([...s.saved.values()].every(r=>!Object.hasOwn(r.fields,'Keterangan')),true);
  assert.equal(s.events.filter(e=>e==='SAVE').length,0);assert.equal(s.events.filter(e=>e==='LINK').length,2);
});

test('retrying a legacy table job uses list, keeps completed work and preserves previously captured optional fields',async()=> {
  const s=scenario();
  const records=s.mutable.map((r,i)=>({key:F.key(r.fields['Kode Identitas']),fields:{...r.fields,'Petugas Saat Ini':'PETUGAS UJI'},initialMode:r.fields.Mode,
    stage:i?'SELESAI':'LINK_DICOBA',result:i?'DONE':'ERROR',link:i?'https://esurvey.bps.go.id/h/s/already-done':'',error:i?'':'Menu gagal',attempts:1,page:1}));
  const legacy={...s.job,context:F.context(url.replace('view=list','view=table')),status:'PAUSED',phase:'PROCESS',lastDataPage:1,pages:{1:records.map(r=>r.key).join('|')}};
  s.store.job=legacy;records.forEach(r=>s.saved.set(r.key,r));
  for(const r of s.mutable){delete r.fields['Petugas Saat Ini'];delete r.fields.Keterangan;}
  s.adapter.location.href=url.replace('view=list','view=table');
  await s.runner.resume(legacy,records,true);assert.equal(F.context(s.adapter.location.href).view,'list');assert.equal(s.events.length,0);
  await s.runner.start(s.store.job,[...s.saved.values()]);
  assert.equal(s.store.job.status,'COMPLETE');assert.equal(F.totals([...s.saved.values()]).done,2);
  assert.equal(s.events.filter(e=>e==='LINK').length,1);assert.equal([...s.saved.values()][0].fields['Petugas Saat Ini'],'PETUGAS UJI');
  assert.equal([...s.saved.values()][1].link,'https://esurvey.bps.go.id/h/s/already-done');
});

test('a legacy failed mode-save record resumes directly to extraction after the centre updates CAWI',async()=> {
  const s=scenario(['CAWI']),old=fields(CODES[0],'CAPI');
  const record={key:F.key(CODES[0]),fields:old,initialMode:'CAPI',stage:'SAVE_MODE_DICOBA',result:'ERROR',error:'Old save timeout',attempts:1,page:1};
  s.store.job={...s.job,phase:'PROCESS',status:'PAUSED',pages:{1:record.key},lastDataPage:1};s.saved.set(record.key,record);
  await s.runner.resume(s.store.job,[record],true);
  assert.equal(s.store.job.status,'COMPLETE');assert.equal(s.saved.get(record.key).result,'DONE');
  assert.equal(s.saved.get(record.key).initialMode,'CAPI');assert.equal(s.saved.get(record.key).finalMode,'CAWI');
  assert.equal(s.events.filter(e=>e==='LINK').length,1);assert.equal(s.events.includes('SAVE'),false);
});
test('a remaining non-CAWI row is reported without any mode action; retry works after the centre changes it',async()=> {
  const s=scenario(['CAPI']);await s.runner.start(s.job);
  assert.equal(s.store.job.status,'NEEDS_ATTENTION');assert.equal([...s.saved.values()][0].result,'ERROR');
  assert.match([...s.saved.values()][0].error,/pusat/);assert.equal(s.events.length,0);
  assert.equal(s.mutable[0].fields.Mode,'CAPI');
  s.mutable[0].fields.Mode='CAWI';
  await s.runner.resume(s.store.job,[...s.saved.values()],true);
  assert.equal(s.store.job.status,'COMPLETE');assert.equal([...s.saved.values()][0].initialMode,'CAPI');
  assert.equal(s.events.includes('SAVE'),false);assert.equal(s.events.filter(e=>e==='LINK').length,1);
});

test('completed assignments are not repeated on resume',async()=> {
  const s=scenario();await s.runner.start(s.job);const before=s.events.length;
  await s.runner.resume(s.store.job,[...s.saved.values()]);assert.equal(s.events.length,before);
});
test('status becomes non-OPEN after inventory and is skipped without mode/link action',async()=> {
  const s=scenario(['CAWI']);let calls=0;
  const ready=s.adapter.ready;s.adapter.ready=async()=>{calls++;if(calls>=3)s.mutable[0].fields.Status='CLOSED';return ready();};
  await s.runner.start(s.job);
  assert.equal([...s.saved.values()][0].result,'SKIPPED');assert.equal(s.events.length,0);
});
test('ambiguous popup causes persisted ERROR and pauses the entire run',async()=> {
  const s=scenario(['CAWI']);s.adapter.getLink=async()=>{throw new F.BotError('Ambiguous email popup','AMBIGUOUS',true);};
  await s.runner.start(s.job);
  assert.equal(s.store.job.status,'PAUSED');assert.equal([...s.saved.values()][0].result,'ERROR');assert.equal(s.events.includes('SAVE'),false);
});

test('a failed menu trigger stops on the first assignment and preserves its exact reason in the panel notice',async()=> {
  const s=scenario();let openings=0;
  s.adapter.openMenu=async()=>{openings++;throw new F.BotError('Menu titik tiga tidak terbuka.','UI',true);};
  await s.runner.start(s.job);
  assert.equal(openings,1);assert.equal(s.store.job.status,'PAUSED');
  assert.equal(s.store.job.notice,'Menu titik tiga tidak terbuka.');assert.equal(s.store.job.lastFailure,'Menu titik tiga tidak terbuka.');
  assert.equal(F.totals([...s.saved.values()]).error,1);assert.equal(F.totals([...s.saved.values()]).pending,1);
});

test('a user pause retains the earlier per-row failure instead of hiding it behind Proses dijeda',async()=> {
  const s=scenario();
  s.adapter.openMenu=async()=>{s.runner.pause();throw new F.BotError('Timeout: menu Pengaturan Email','TIMEOUT');};
  await s.runner.start(s.job);
  assert.equal(s.store.job.status,'PAUSED');
  assert.match(s.store.job.notice,/Proses dijeda/);assert.match(s.store.job.notice,/Timeout: menu Pengaturan Email/);
});
test('pilot limits link extraction, keeps unprocessed rows pending and does not declare scope complete',async()=> {
  const s=scenario();s.job.options.pilot=true;s.job.options.limit=1;await s.runner.start(s.job);
  assert.equal(s.store.job.status,'PILOT_DONE');assert.equal(s.store.job.inventoryComplete,false);
  assert.equal(F.totals([...s.saved.values()]).done,1);assert.equal(F.totals([...s.saved.values()]).pending,1);
});
test('same unique link for different assignments is persisted as anomaly and pauses',async()=> {
  const s=scenario(['CAWI','CAWI']);s.adapter.getLink=async()=>({link:'https://esurvey.bps.go.id/h/s/same',dialog:{}});
  await s.runner.start(s.job);assert.equal(s.store.job.status,'PAUSED');assert.equal(F.totals([...s.saved.values()]).error,1);
});
test('pause before link extraction leaves the assignment pending for safe resume',async()=> {
  const s=scenario(['CAWI']);let saves=0;const send=s.send;
  s.runner.send=async msg=>{const result=await send(msg);if(msg.type==='ROWS'&&++saves===1)s.runner.pause();return result;};
  await s.runner.start(s.job);assert.equal(s.store.job.status,'PAUSED');
  assert.equal([...s.saved.values()][0].result,'PENDING');assert.equal(s.events.includes('SAVE'),false);
});
test('changed query pauses before assignment actions',async()=> {
  const s=scenario(['CAWI']);s.adapter.location.href=url+'&search=changed';await s.runner.start(s.job);
  assert.equal(s.store.job.status,'PAUSED');assert.equal(s.events.length,0);
});
test('two-page inventory survives navigation back to page 1, then every assignment is processed once',async()=> {
  const s=scenario();let page=1;
  s.adapter.readRows=()=>[s.mutable[page-1]];
  s.adapter.ready=async()=>s.adapter.readRows();
  s.adapter.lastPage=()=>page===2;
  s.adapter.location.assign=newUrl=>{s.adapter.location.href=newUrl;page=Number(new URL(newUrl).searchParams.get('page'));};
  s.adapter.nextPage=async()=>{page++;const u=new URL(s.adapter.location.href);u.searchParams.set('page',String(page));s.adapter.location.href=u.href;};
  await s.runner.start(s.job);
  assert.equal(s.store.job.phase,'PROCESS');assert.equal(s.saved.size,2);assert.equal(page,1);
  assert.ok(s.store.job.navigating);
  await s.runner.start(s.store.job,[...s.saved.values()]);
  assert.equal(s.store.job.status,'COMPLETE');assert.equal(F.totals([...s.saved.values()]).done,2);
  assert.equal(s.events.filter(e=>e==='LINK').length,2);
});
test('changed page membership after inventory pauses before any write',async()=> {
  const s=scenario(['CAWI']);let calls=0;
  s.adapter.ready=async()=>{calls++;if(calls>=3)s.mutable[0].fields['Kode Identitas']=CODES[1];return s.mutable;};
  await s.runner.start(s.job);assert.equal(s.store.job.status,'PAUSED');assert.equal(s.events.includes('SAVE'),false);
});
test('a link already saved before interrupted dialog cleanup is reused without requesting another link',async()=> {
  const s=scenario(['CAWI']);let closes=0;
  s.adapter.closeDialog=async()=>{closes++;if(closes===1)throw new F.BotError('Close selector failed','CLOSE',true);};
  await s.runner.start(s.job);
  const saved=[...s.saved.values()][0];assert.ok(saved.link);assert.equal(saved.result,'ERROR');
  assert.equal(s.events.filter(e=>e==='LINK').length,1);
  await s.runner.resume(s.store.job,[...s.saved.values()],true);
  assert.equal(s.events.filter(e=>e==='LINK').length,1);assert.equal(s.store.job.status,'COMPLETE');
});
test('lowercase open reaches link extraction; draft is skipped',async()=> {
  const s=scenario();s.mutable[0].fields.Status='open';s.mutable[1].fields.Status='draft';
  await s.runner.start(s.job);
  assert.equal(F.totals([...s.saved.values()]).done,1);assert.equal(F.totals([...s.saved.values()]).skipped,1);
  assert.equal(s.events.filter(e=>e==='SAVE').length,0);
});
test('existing 1000-row false skips are recovered without resetting draft or rescanning pages; empty page 11 ends inventory',async()=> {
  const s=scenario(['CAWI']),records=[];
  for(let n=1;n<=1000;n++) {
    const f=fields('7271000000000000 - EC - 1 - '+n,'CAPI',n===1000?'draft':'open');
    records.push({key:F.key(f['Kode Identitas']),fields:f,initialMode:'CAPI',page:Math.ceil(n/100),stage:'DATA_TERSIMPAN',
      result:'SKIPPED',error:'Status bukan OPEN.',attempts:0});
  }
  const pages={};for(let p=1;p<=10;p++)pages[p]=records.filter(r=>r.page===p).map(r=>r.key).join('|');
  s.store.job={...s.job,status:'PAUSED',pages,visitPages:Object.keys(pages).map(Number)};
  records.forEach(r=>s.saved.set(r.key,structuredClone(r)));
  s.adapter.location.href=url.replace('page=1','page=11');
  s.adapter.readRows=()=>[];
  s.adapter.ready=async(prefix,complete,allowEmpty)=>{assert.equal(allowEmpty,true);return [];};
  await s.runner.resume(s.store.job,records);
  assert.equal(F.totals([...s.saved.values()]).pending,999);assert.equal(F.totals([...s.saved.values()]).skipped,1);
  assert.equal(s.store.job.recoveredFalseSkips,999);assert.equal(s.store.job.inventoryComplete,true);
  assert.equal(s.store.job.phase,'PROCESS');assert.equal(s.store.job.lastDataPage,10);
  assert.equal(s.store.job.emptyPage,11);assert.equal(F.context(s.adapter.location.href).page,1);assert.equal(s.events.length,0);
});
test('processing stops at the known last inventory page even when Next remains enabled',async()=> {
  const s=scenario(['CAWI']);let page=1;s.adapter.lastPage=()=>false;
  s.adapter.readRows=()=>page===1?s.mutable:[];
  s.adapter.ready=async()=>s.adapter.readRows();
  s.adapter.nextPage=async()=>{page=2;s.adapter.location.href=url.replace('page=1','page=2');return {empty:true};};
  s.adapter.location.assign=value=>{s.adapter.location.href=value;page=Number(new URL(value).searchParams.get('page'));};
  await s.runner.start(s.job);assert.equal(s.store.job.phase,'PROCESS');assert.equal(page,1);
  await s.runner.start(s.store.job,[...s.saved.values()]);
  assert.equal(s.store.job.status,'COMPLETE');assert.equal(page,1);assert.equal(F.totals([...s.saved.values()]).done,1);
});
test('migration leaves completed work and genuine non-OPEN skips untouched',async()=> {
  const s=scenario(['CAWI','CAWI']);s.mutable[1].fields.Status='draft';await s.runner.start(s.job);
  const original=[...s.saved.values()],before=s.events.length;
  await s.runner.resume(s.store.job,original);
  assert.equal(s.events.length,before);assert.equal(s.store.job.recoveredFalseSkips,0);
  assert.equal(F.totals([...s.saved.values()]).done,1);assert.equal(F.totals([...s.saved.values()]).skipped,1);
});
