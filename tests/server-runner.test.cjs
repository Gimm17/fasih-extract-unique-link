const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../extension/core.js');require('../extension/runner.js');const ServerRunner=require('../extension/server-runner.js');
const {fields,CODES}=require('./fixtures.cjs');
const url='https://fasih-sm.bps.go.id/app/surveys/server/period/data?page=1&perPage=100&view=list';
function scenario(){
 const rows=CODES.map(code=>({fields:fields(code,'CAWI')})),saved=new Map(),events=[];
 const records=rows.map(r=>({key:F.key(r.fields['Kode Identitas']),fields:r.fields,result:'PENDING',stage:'DATA_TERSIMPAN',page:1,attempts:0}));
 const campaign={id:'campaign',generation:1,sourceUrl:url,filterStamp:''};
 const store={job:{id:'job',context:F.context(url),options:{prefix:'7271',linkHost:'esurvey.bps.go.id',server:{mode:'WORK',campaignId:'campaign',workerId:'worker',generation:1}},phase:'INVENTORY',status:'RUNNING',pages:{},visitPages:[],processPages:[],attempted:[]}};
 let claims=0;
 const adapter={doc:{hidden:false},location:{href:url,assign:u=>{adapter.location.href=u;}},filterStamp:()=>'',readRows:()=>rows,ready:async()=>rows,cleanup:async()=>{},lastPage:()=>true,findRow:k=>rows.find(r=>F.key(r.fields['Kode Identitas'])===k),
 getLink:async k=>{events.push('menu:'+k);return {link:'https://esurvey.bps.go.id/h/s/'+k,dialog:{}};},closeDialog:async()=>{events.push('close');}};
 const send=async m=>{
  if(m.type==='PATCH'){store.job={...store.job,...structuredClone(m.patch)};return structuredClone(store.job);}
  if(m.type==='ROWS'){for(const r of m.rows)saved.set(r.key,structuredClone(r));return true;}
  if(m.type==='CHECKPOINT'){for(const r of m.rows)saved.set(r.key,structuredClone(r));store.job={...store.job,...m.patch};return structuredClone(store.job);}
  if(m.type==='REMOTE_FLUSH'){events.push('flush');return {synced:0};}
  if(m.type==='REMOTE_INFO')return {worker:{id:'worker'},campaign};
  if(m.type==='REMOTE'){
   events.push(m.action);
   if(m.action==='claim')return claims++?{empty:true,counts:{done:2}}:{page:1,claimToken:'lease',leaseSeconds:300,keys:records.map(r=>r.key),rows:structuredClone(records)};
   if(m.action==='begin_record')return {leaseSeconds:300};
   if(m.action==='checkpoint'){assert.ok(saved.has(m.data.record.key),'Local result must persist before upload');return {saved:true};}
   return {};
  }
  throw Error(m.type);
 };
 const runner=new ServerRunner(adapter,send);runner.sleep=async ms=>{events.push('delay:'+ms);};return {rows,records,saved,events,store,adapter,send,runner,campaign};
}
test('server runner extracts only its claimed package and uploads after durable local save',async()=>{
 const s=scenario();await s.runner.start(s.store.job);
 assert.equal(s.store.job.status,'COMPLETE');assert.equal(s.saved.size,2);
 assert.equal([...s.saved.values()].every(r=>r.result==='DONE'),true);
 assert.equal(s.events.filter(e=>e.startsWith('menu:')).length,2);assert.equal(s.events.filter(e=>e==='delay:1000').length,2);
 assert.equal(s.events.indexOf('claim')<s.events.indexOf('begin_record'),true);assert.ok(s.events.includes('close_page'));
});
test('server runner fences wrong inventory, expired leases and reset generations before popup actions',async()=>{
 const changed=scenario();changed.rows.pop();await changed.runner.start(changed.store.job);
 assert.equal(changed.store.job.status,'PAUSED');assert.match(changed.store.job.notice,/Daftar assignment/);assert.equal(changed.events.some(e=>e.startsWith('menu:')),false);
 const reset=scenario();reset.campaign.generation=2;await reset.runner.start(reset.store.job);assert.equal(reset.store.job.status,'PAUSED');assert.equal(reset.events.includes('claim'),false);
 const expired=scenario();expired.runner.job={...expired.store.job,phase:'PROCESS',filterStamp:''};expired.runner.pack={page:1};expired.runner.deadline=Date.now()-1;assert.throws(()=>expired.runner.guard(),/kedaluwarsa/);
});
test('server recovery reuses a link saved locally before network acknowledgment without opening menu',async()=>{
 const s=scenario();s.records[1].result='DONE';s.records[1].link='https://esurvey.bps.go.id/h/s/already';
 const local={...s.records[0],link:'https://esurvey.bps.go.id/h/s/persisted',stage:'LINK_TERSIMPAN'};
 await s.runner.start(s.store.job,[local]);assert.equal(s.store.job.status,'COMPLETE');assert.equal(s.saved.get(local.key).link,local.link);
 assert.equal(s.events.some(e=>e.startsWith('menu:')),false);assert.equal(s.saved.get(local.key).result,'DONE');
});
test('a lost final upload acknowledgment preserves DONE and retries the same checkpoint, never ERROR',async()=>{
 const s=scenario(),send=s.send;let lost=true;const checkpoints=[];
 s.runner.send=async m=>{if(m.type==='REMOTE'&&m.action==='checkpoint'){checkpoints.push(structuredClone(m.data.record));if(m.data.record.result==='DONE'&&lost){lost=false;throw new F.BotError('Acknowledgment lost','REMOTE_NETWORK',true);}}return send(m);};
 await s.runner.start(s.store.job);
 assert.equal(s.store.job.status,'PAUSED');assert.equal(s.saved.get(s.records[0].key).result,'DONE');assert.equal(checkpoints.at(-1).result,'DONE');
 assert.equal(checkpoints.some(r=>r.result==='ERROR'),false);assert.ok(s.saved.get(s.records[0].key).link);
});
test('server inventory uploads every page and finishes without extraction',async()=>{
 const s=scenario();s.store.job.options.server.mode='INVENTORY';await s.runner.start(s.store.job);
 assert.equal(s.store.job.status,'COMPLETE');assert.ok(s.events.includes('import_begin'));assert.ok(s.events.includes('import_page'));assert.ok(s.events.includes('import_finish'));
 assert.equal(s.events.includes('claim'),false);assert.equal(s.events.some(e=>e.startsWith('menu:')),false);
 await assert.rejects(s.runner.start(s.store.job),/Inventaris server sudah ditutup/);
});
test('navigation preserves claim and job session, then resumes the same package',async()=>{
 const s=scenario();s.adapter.location.href=url.replace('page=1','page=2');await s.runner.start(s.store.job);
 assert.equal(s.store.job.status,'RUNNING');assert.equal(s.store.job.remoteClaim.page,1);assert.equal(s.adapter.location.href,url);assert.equal(s.events.some(e=>e.startsWith('menu:')),false);
 // The server returns the existing owned package after a content-script reload.
 const send=s.send;s.runner.send=async m=>m.type==='REMOTE'&&m.action==='claim'&&s.store.job.navigating?{page:1,claimToken:'lease',leaseSeconds:300,keys:s.records.map(r=>r.key),rows:s.records}:send(m);
 await s.runner.start(s.store.job);assert.equal(s.store.job.status,'COMPLETE');assert.equal(s.saved.size,2);
});
