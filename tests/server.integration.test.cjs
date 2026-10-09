const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const F=require('../extension/core.js'),{fields}=require('./fixtures.cjs');
const root=path.resolve(__dirname,'..'),php=path.join(root,'.tools/php/php.exe'),config=path.join(root,'.tools/fulx-test.php'),base='http://127.0.0.1:9079';
const fixture=path.join(__dirname,'server-worker.php');
function cli(input){return new Promise((resolve,reject)=>{const p=spawn(php,['-d','extension_dir='+path.join(root,'.tools/php/ext'),'-d','extension=pdo_mysql',fixture],{env:{...process.env,FASIH_CONFIG:config},windowsHide:true});let out='',err='';p.stdout.on('data',s=>out+=s);p.stderr.on('data',s=>err+=s);p.on('exit',()=>{try{resolve(JSON.parse(out));}catch{reject(new Error(err+out));}});p.stdin.end(JSON.stringify(input));});}
function client(token){let cookie='',csrf='';return async(action,data={})=>{const r=await fetch(base+'/api.php',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,...data})});const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];const json=await r.json();if(json.value?.csrf)csrf=json.value.csrf;return {status:r.status,...json};};}

test('PHP/MariaDB integration: five concurrent workers, ownership, review recovery, CSRF, retries and central reset',
 {skip:!fs.existsSync(php)||!fs.existsSync(config),timeout:45000},async()=>{
  await cli({action:'__reset'});
  const install=await fetch(base+'/install.php',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({setup_key:'fulx-local-install-fixture-only-2026-key',username:'localadmin',password:'local-fixture-password-2026'})});
  assert.equal(install.status,302);assert.equal((await fetch(base+'/install.php')).status,410);
  const admin=client();assert.equal((await admin('session')).status,401);
  assert.equal((await admin('login',{username:'localadmin',password:'wrong'})).status,401);
  assert.equal((await admin('login',{username:'localadmin',password:'local-fixture-password-2026'})).ok,true);
  const source='https://fasih-sm.bps.go.id/app/surveys/integration/period/data?page=1&perPage=100&search=-+EC+-&view=list';
  const created=await admin('create_campaign',{name:'FULX · Simulasi 5 komputer',url:source,prefix:'7271',expectedTotal:20,linkHost:'esurvey.bps.go.id'});
  assert.equal(created.ok,true,created.error);const id=created.value.id;
  assert.equal((await admin('edit_campaign',{campaignId:id,name:'FULX · Simulasi 5 komputer',url:source,prefix:'7271',expectedTotal:20,linkHost:'esurvey.bps.go.id'})).ok,true);
  assert.equal((await admin('create_campaign',{name:'duplicate',url:source,prefix:'7271'})).status,409);
  const workers=[];for(let i=0;i<5;i++){const w=await admin('create_worker',{campaignId:id,name:'Komputer '+(i+1),role:i===0?'COORDINATOR':'WORKER'});assert.equal(w.ok,true);workers.push({...w.value,api:client(w.value.token)});}
  assert.equal((await workers[1].api('import_begin',{url:source,prefix:'7271',filterStamp:''})).status,403);
  assert.equal((await workers[0].api('import_begin',{url:source,prefix:'7271',filterStamp:''})).ok,true);
  const all=[];for(let page=1;page<=10;page++){
    const rows=[1,2].map(n=>{const f=fields('7271000000000000 - EC - 1 - '+(page*10+n),'CAWI');return {key:F.key(f['Kode Identitas']),fields:f};});all.push(rows);
    assert.equal((await workers[0].api('import_page',{page,rows})).ok,true);
    if(page===1){assert.equal((await workers[0].api('import_page',{page,rows})).value.reused,true);assert.equal((await workers[0].api('import_page',{page:2,rows})).status,409);}
  }
  assert.equal((await workers[0].api('import_finish',{lastPage:10})).ok,true);
  // Lost finalization acknowledgments may resend import messages without reopening inventory.
  assert.equal((await workers[0].api('import_begin',{url:source,prefix:'7271',filterStamp:''})).value.campaign.state,'READY');
  assert.equal((await workers[0].api('import_page',{page:10,rows:all[9]})).value.reused,true);
  assert.equal((await workers[0].api('import_page',{page:11,rows:all[9]})).status,409);
  assert.equal((await workers[0].api('import_finish',{lastPage:10})).ok,true);
  assert.equal((await admin('edit_campaign',{campaignId:id,name:'changed',url:source,prefix:'72',expectedTotal:20,linkHost:'esurvey.bps.go.id'})).status,409);
  const packs=await Promise.all(workers.map((w,i)=>cli({action:'claim',token:w.token,session:'session-'+i})));
  assert.equal(packs.every(p=>p.ok),true);assert.equal(new Set(packs.map(p=>p.value.page)).size,5);
  const p=packs[0].value,w=workers[0],owned={page:p.page,claimToken:p.claimToken,session:'session-0'};
  assert.equal((await workers[1].api('begin_record',{...owned,key:p.rows[0].key})).status,409);
  assert.equal((await w.api('begin_record',{...owned,key:p.rows[0].key})).ok,true);
  const done={...p.rows[0],result:'DONE',stage:'SELESAI',link:'https://esurvey.bps.go.id/h/s/unique-test'};
  assert.equal((await w.api('checkpoint',{...owned,record:done})).ok,true);
  assert.equal((await w.api('checkpoint',{...owned,record:done})).value.reused,true);
  assert.equal((await w.api('checkpoint',{...owned,record:{...done,result:'ERROR'}})).status,409);
  assert.equal((await w.api('begin_record',{...owned,key:p.rows[1].key})).ok,true);
  assert.equal((await w.api('checkpoint',{...owned,record:{...p.rows[1],result:'DONE',stage:'SELESAI',link:done.link}})).status,409);
  assert.equal((await admin('reset',{campaignId:id,confirm:'FULX · Simulasi 5 komputer'})).status,409);
  assert.equal((await admin('pause',{campaignId:id})).ok,true);
  assert.equal((await w.api('heartbeat',owned)).value.paused,true);
  assert.equal((await w.api('begin_record',{...owned,key:p.rows[1].key})).status,409);
  assert.equal((await admin('resume',{campaignId:id})).ok,true);
  const error={...p.rows[1],result:'ERROR',stage:'LINK_DICOBA',error:'Simulasi popup gagal'};
  assert.equal((await w.api('checkpoint',{...owned,record:error})).ok,true);
  assert.equal((await w.api('close_page',{...owned,complete:true})).ok,true);
  assert.equal((await admin('retry',{campaignId:id})).ok,true);
  const retry=await w.api('claim',{session:'session-0'});assert.equal(retry.value.page,p.page);
  assert.equal(retry.value.rows[0].result,'DONE');assert.equal(retry.value.rows[1].result,'PENDING');
  const review=packs[1].value;await cli({action:'__expire',campaignId:id,page:review.page});
  const overview=await admin('overview',{campaignId:id});assert.equal(overview.value.packages.find(x=>Number(x.page_no)===review.page).state,'REVIEW');
  assert.equal((await workers[1].api('heartbeat',{page:review.page,claimToken:review.claimToken,session:'session-1'})).status,409);
  assert.equal((await admin('release_review',{campaignId:id,page:review.page,confirm:'REQUEUE'})).ok,true);
  assert.equal((await workers[1].api('checkpoint',{page:review.page,claimToken:review.claimToken,session:'session-1',record:review.rows[0]})).status,409);
  const exportRows=await admin('export',{campaignId:id,limit:500});assert.equal(exportRows.value.rows.length,20);assert.equal(exportRows.value.rows.filter(r=>r.result==='DONE').length,1);
  for(const active of (await admin('overview',{campaignId:id})).value.packages)await cli({action:'__expire',campaignId:id,page:Number(active.page_no)});
  assert.equal((await admin('reset',{campaignId:id,confirm:'wrong'})).status,400);
  assert.equal((await admin('reset',{campaignId:id,confirm:'FULX · Simulasi 5 komputer'})).ok,true);
  assert.equal((await admin('overview',{campaignId:id})).value.counts.total,0);
  // Leave a populated fictional dashboard for visual/browser QA.
  await w.api('import_begin',{url:source,prefix:'7271',filterStamp:''});
  for(let i=0;i<all.length;i++)await w.api('import_page',{page:i+1,rows:all[i]});await w.api('import_finish',{lastPage:10});
  await Promise.all(workers.map((w,i)=>cli({action:'claim',token:w.token,session:'preview-'+i})));
  fs.mkdirSync(path.join(root,'test-output'),{recursive:true});fs.writeFileSync(path.join(root,'test-output/server-fixture.json'),JSON.stringify({campaignId:id,worker:workers[0],source}));
 });

test('browser + live PHP backend: worker extracts assigned links; dashboard renders five computers and downloads XLSX',
 {skip:!fs.existsSync(php)||!fs.existsSync(config)||!fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe'),timeout:45000},async()=>{
 const {chromium}=require('C:/Users/BPSAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const {card}=require('./fixtures.cjs'),browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const admin=client();assert.equal((await admin('login',{username:'localadmin',password:'local-fixture-password-2026'})).ok,true);
  const source='https://fasih-sm.bps.go.id/app/surveys/browser-server/period/data?page=1&perPage=100&view=list';
  const campaign=(await admin('create_campaign',{name:'Browser end-to-end',url:source,prefix:'7271',expectedTotal:3,linkHost:'esurvey.bps.go.id'})).value;
  const w=(await admin('create_worker',{campaignId:campaign.id,name:'Komputer browser',role:'COORDINATOR'})).value,worker=client(w.token);
  const rows=[fields('7271000000000000 - EC - 1 - 901','CAWI'),fields('7271000000000000 - EC - 1 - 902','CAWI'),fields('7271000000000000 - EC - 1 - 903','CAWI','CLOSED')];
  await worker('import_begin',{url:campaign.sourceUrl,prefix:'7271',filterStamp:''});await worker('import_page',{page:1,rows:rows.map(f=>({key:F.key(f['Kode Identitas']),fields:f}))});await worker('import_finish',{lastPage:1});
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),saved=new Map();let job=null,settings={actionDelayMs:50,nextDelayMs:0};
  await page.route('https://fasih-sm.bps.go.id/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><h1>FASIH · Simulasi server</h1>'+rows.map(card).join('')+'<button aria-label="Go to next page" disabled>Next</button>'}));
  await page.exposeFunction('bridge',async m=>{
   let value;
   if(m.type==='GET_SETTINGS')value=settings;
   else if(m.type==='SET_SETTINGS'){settings=m.settings;value=settings;}
   else if(m.type==='GET_SERVER_SETTINGS')value={configured:true,url:base+'/api.php',workerName:w.name,campaignName:campaign.name,outboxCount:0};
   else if(m.type==='LATEST')value=job?.id;
   else if(m.type==='READ')value={job,rows:[...saved.values()],owned:true};
   else if(m.type==='CREATE'){job={id:'browser-job',context:F.context(campaign.sourceUrl),options:m.options,status:'RUNNING',phase:'INVENTORY',owner:1,createdAt:new Date().toISOString(),pages:{},visitPages:[],processPages:[],attempted:[]};value=job;}
   else if(m.type==='PATCH'){job={...job,...m.patch};value=job;}
   else if(m.type==='ROWS'){for(const r of m.rows)saved.set(r.key,structuredClone(r));value=true;}
   else if(m.type==='REMOTE_FLUSH')value={synced:0};
   else if(m.type==='REMOTE_INFO'||m.type==='REMOTE'){
    const result=await worker(m.type==='REMOTE_INFO'?'worker_info':m.action,{...m.data,session:job?.id});return result;
   }else throw Error(m.type);
   return {ok:true,value};
  });
  await page.goto(campaign.sourceUrl);
  await page.evaluate(()=>{
   const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return attach.call(this,{...o,mode:'open'});};
   window.chrome.runtime={sendMessage:m=>window.bridge(m),onMessage:{addListener:()=>{}}};window.menus=0;window.links=0;
   for(const [i,button] of [...document.querySelectorAll('[aria-haspopup="menu"]')].entries())button.onclick=()=>{
    window.menus++;const menu=document.createElement('div');menu.setAttribute('role','menu');
    const action=document.createElement('div');action.setAttribute('role','menuitem');action.textContent='Pengaturan Email';menu.append(action);document.body.append(menu);
    action.onclick=()=>{menu.remove();const d=document.createElement('section');d.setAttribute('role','dialog');d.innerHTML='<h2>Pengaturan Email</h2><div><div>Unique Link untuk assignment CAWI</div><button>Dapatkan Unique Link</button></div><button aria-label="Close">Close</button>';document.body.append(d);
     d.querySelector('button').onclick=()=>{window.links++;const input=document.createElement('input');input.value='https://esurvey.bps.go.id/h/s/browser-'+i;d.querySelector('div').append(input);d.querySelector('button').remove();};d.querySelector('[aria-label="Close"]').onclick=()=>d.remove();};
   }
  });
  for(const script of ['core.js','adapter.js','runner.js','server-runner.js','content.js'])await page.addScriptTag({path:path.join(root,'extension',script)});
  await page.getByRole('button',{name:'Mulai tugas server',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#fasih-cawi-bot').shadowRoot.querySelector('#state').textContent.includes('Selesai'));
  assert.equal(job.status,'COMPLETE',job.notice);assert.equal(saved.size,2);assert.deepEqual(await page.evaluate(()=>[window.menus,window.links,document.querySelectorAll('[role="dialog"]').length]),[2,2,0]);
  assert.equal((await admin('overview',{campaignId:campaign.id})).value.counts.done,2);
  const dashboard=await browser.newPage({viewport:{width:1536,height:1050}});const errors=[];dashboard.on('pageerror',e=>errors.push(e.message));
  await dashboard.goto(base+'/index.html');await dashboard.locator('#username').fill('localadmin');await dashboard.locator('#password').fill('local-fixture-password-2026');await dashboard.getByRole('button',{name:'Masuk dashboard'}).click();
  const fixture=JSON.parse(fs.readFileSync(path.join(root,'test-output/server-fixture.json'),'utf8'));
  await dashboard.locator('#campaign').selectOption(fixture.campaignId);await dashboard.waitForFunction(()=>document.querySelectorAll('#workers tr').length===5);
  await dashboard.waitForTimeout(500);assert.equal(await dashboard.locator('#progressBar').evaluate(e=>e.style.width),'0%');
  await dashboard.screenshot({path:path.join(root,'test-output/dashboard-desktop.png'),fullPage:true});
  await dashboard.getByRole('button',{name:/Kelola proyek/}).click();assert.ok((await dashboard.locator('#inventoryOwner').textContent()).includes(fixture.worker.id.slice(0,8)));assert.ok((await dashboard.locator('#workers').textContent()).includes('Pemilik inventaris'));await dashboard.locator('#newExpected').fill('123');await dashboard.waitForTimeout(3200);assert.equal(await dashboard.locator('#newExpected').inputValue(),'123');
  await dashboard.getByRole('button',{name:/Data & hasil/}).click();await dashboard.locator('#search').fill('CONTOH');await dashboard.locator('#searchApply').click();await dashboard.waitForFunction(()=>document.querySelectorAll('#rows tr').length===20);
  assert.equal(await dashboard.locator('#rows').locator('script').count(),0);assert.ok((await dashboard.locator('#rows').textContent()).includes('<CONTOH>'));
  const download=dashboard.waitForEvent('download');await dashboard.locator('#excel').click();const file=await download;assert.match(file.suggestedFilename(),/\.xlsx$/);await file.saveAs(path.join(root,'test-output/server-browser-export.xlsx'));
  assert.equal(fs.readFileSync(path.join(root,'test-output/server-browser-export.xlsx')).subarray(0,2).toString(),'PK');
  await dashboard.getByRole('button',{name:/Monitor pekerjaan/}).click();await dashboard.setViewportSize({width:390,height:844});await dashboard.screenshot({path:path.join(root,'test-output/dashboard-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const csrf=await dashboard.evaluate(async()=>{const r=await fetch('api.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pause',campaignId:document.querySelector('#campaign').value})});return r.status;});assert.equal(csrf,403);
 }finally{await browser.close();}
});

test('territory migration preserves links, deduplicates cross-filter rows, checks zero branches and leases five distinct villages',
 {skip:!fs.existsSync(php)||!fs.existsSync(config),timeout:45000},async()=>{
  const admin=client();assert.equal((await admin('login',{username:'localadmin',password:'local-fixture-password-2026'})).ok,true);
  const source='https://fasih-sm.bps.go.id/app/surveys/territory-integration/period/data?page=1&perPage=100&view=list';
  const c=(await admin('create_campaign',{name:'Migration + territories',url:source,prefix:'7271',expectedTotal:6,linkHost:'esurvey.bps.go.id'})).value;
  const workers=[];for(let i=0;i<5;i++){const w=(await admin('create_worker',{campaignId:c.id,name:'Geo PC '+i,role:i?'WORKER':'COORDINATOR'})).value;workers.push({...w,api:client(w.token)});}
  const legacy=fields('7271000000000000 - EC - 1 - 9000','CAWI'),row={key:F.key(legacy['Kode Identitas']),fields:legacy},w=workers[0];
  await w.api('import_begin',{url:source,prefix:'7271',filterStamp:''});await w.api('import_page',{page:1,rows:[row]});await admin('expected',{campaignId:c.id,expectedTotal:1});await w.api('import_finish',{lastPage:1});
  const pack=(await w.api('claim',{session:'legacy-session'})).value,owned={session:'legacy-session',page:pack.page,claimToken:pack.claimToken};await w.api('begin_record',{...owned,key:row.key});
  const link='https://esurvey.bps.go.id/h/s/legacy-geo-preserved';await w.api('checkpoint',{...owned,record:{...pack.rows[0],result:'DONE',link,stage:'SELESAI'}});await w.api('close_page',{...owned,complete:true});
  assert.equal((await admin('enable_territories',{campaignId:c.id})).ok,true);assert.equal((await admin('expected',{campaignId:c.id,expectedTotal:6})).ok,true);
  assert.equal((await w.api('claim',{session:'legacy-session'})).status,409);assert.equal((await w.api('import_begin',{url:source})).status,409);
  const geo=(action,data={})=>w.api(action,{protocol:3,session:'geo-session',...data});
  assert.equal((await geo('geo_begin',{url:source})).ok,true);
  const roots=[{level:'PROVINSI',code:'72',name:'SULAWESI TENGAH'},{level:'KABUPATEN/KOTA',code:'71',name:'PALU'}],district={level:'KECAMATAN',code:'010',name:'PALU BARAT'};
  const recipes=Array.from({length:5},(_,i)=>[...roots,district,{level:'DESA',code:String(i+1).padStart(3,'0'),name:'DESA UJI '+i}]);recipes.push([...roots,{level:'KECAMATAN',code:'000',name:'-'}]);
  const catalog=await geo('geo_catalog',{recipes,complete:true});assert.equal(catalog.ok,true,catalog.error);const parts=catalog.value.partitions;
  for(const p of parts){const i=recipes.findIndex(r=>r.at(-1).code===p.recipe.at(-1).code&&r.length===p.recipe.length);const rows=i===5?[]:[{key:F.key('7271000000000000 - EC - 1 - '+(9100+i)),fields:fields('7271000000000000 - EC - 1 - '+(9100+i),'CAWI')},...(i<2?[row]:[])];
    if(rows.length){assert.equal((await geo('geo_page',{partitionId:p.id,localPage:1,rows})).ok,true);assert.equal((await geo('geo_page',{partitionId:p.id,localPage:1,rows})).value.reused,true);}
    assert.equal((await geo('geo_finish_partition',{partitionId:p.id,lastPage:rows.length?1:0,boundary:'NEXT_DISABLED'})).ok,true);
  }
  const overview=await admin('overview',{campaignId:c.id});assert.equal(overview.value.territories.unmapped,0);assert.equal(overview.value.counts.total,6);assert.equal(overview.value.territories.duplicates.length,1);
  assert.equal(overview.value.territories.regionCounts.find(r=>r.total===6).total,6);assert.equal((await geo('geo_finish')).ok,true);
  assert.equal((await geo('geo_begin',{url:source})).value.finished,true);
  const packs=await Promise.all(workers.map((w,i)=>cli({action:'geo_claim',token:w.token,session:'geo-work-'+i})));assert.equal(packs.every(p=>p.ok),true,JSON.stringify(packs));assert.equal(new Set(packs.map(p=>p.value.partitionId)).size,5);
  for(const p of packs){assert.equal(p.value.localPage,1);assert.ok(p.value.recipe.some(r=>r.level==='DESA'));}
  const exported=(await admin('export',{campaignId:c.id,limit:500})).value.rows;assert.equal(exported.find(r=>r.key===row.key).link,link);assert.equal(exported.find(r=>r.key===row.key).result,'DONE');
  const first=packs[0].value;assert.equal((await workers[1].api('begin_record',{protocol:3,page:first.page,claimToken:first.claimToken,session:'geo-work-0',key:first.rows.at(-1).key})).status,409);
  const lease={protocol:3,page:first.page,claimToken:first.claimToken,session:'geo-work-0'};assert.equal((await w.api('heartbeat',lease)).ok,true);
  assert.equal((await w.api('geo_claim',{protocol:3,session:'other-session'})).status,409);
  assert.equal((await admin('reset',{campaignId:c.id,confirm:c.name})).status,409);
  await cli({action:'__expire',campaignId:c.id,page:first.page});const expired=(await admin('overview',{campaignId:c.id})).value;assert.equal(expired.territories.partitions.find(p=>p.id===first.partitionId).state,'REVIEW');assert.equal(expired.packages.find(p=>Number(p.page_no)===first.page).partition_id,first.partitionId);
  assert.equal((await admin('release_review',{campaignId:c.id,page:first.page,confirm:'REQUEUE'})).ok,true);assert.equal((await w.api('checkpoint',{...lease,record:first.rows[0]})).status,409);
  const retryPack=(await w.api('geo_claim',{protocol:3,session:'geo-work-0'})).value;assert.equal(retryPack.partitionId,first.partitionId);assert.notEqual(retryPack.claimToken,first.claimToken);
  const nextOwned={protocol:3,page:retryPack.page,claimToken:retryPack.claimToken,session:'geo-work-0'},pending=retryPack.rows.find(r=>r.result==='PENDING');assert.equal((await w.api('begin_record',{...nextOwned,key:pending.key})).ok,true);assert.equal((await w.api('checkpoint',{...nextOwned,record:{...pending,result:'ERROR',error:'Retry fixture'}})).ok,true);assert.equal((await w.api('close_page',{...nextOwned,complete:true})).ok,true);assert.equal((await admin('overview',{campaignId:c.id})).value.territories.partitions.find(p=>p.id===first.partitionId).state,'DONE');
  assert.equal((await w.api('retry_own',{protocol:3,session:'geo-work-0'})).ok,true);const again=(await w.api('geo_claim',{protocol:3,session:'geo-work-0'})).value;assert.notEqual(again.claimToken,retryPack.claimToken);assert.equal(again.rows.find(r=>r.key===pending.key).result,'PENDING');assert.equal((await w.api('checkpoint',{...nextOwned,record:pending})).status,409);
});

test('a disabled inventory owner is replaced atomically without losing catalog, pages, or DONE links; active owners and old requests remain fenced',
 {skip:!fs.existsSync(php)||!fs.existsSync(config),timeout:45000},async()=>{
  const admin=client();await admin('login',{username:'localadmin',password:'local-fixture-password-2026'});
  const source='https://fasih-sm.bps.go.id/app/surveys/territory-owner/period/data?page=1&perPage=100&view=list';
  const c=(await admin('create_campaign',{name:'Inventory owner recovery',url:source,prefix:'7271',expectedTotal:1})).value;
  const old=(await admin('create_worker',{campaignId:c.id,name:'Same coordinator name',role:'COORDINATOR'})).value,oldApi=client(old.token);
  const f=fields('7271000000000000 - EC - 1 - 99901','CAWI'),row={key:F.key(f['Kode Identitas']),fields:f};
  await oldApi('import_begin',{url:source,prefix:'7271',filterStamp:''});await oldApi('import_page',{page:1,rows:[row]});await oldApi('import_finish',{lastPage:1});
  const pack=(await oldApi('claim',{session:'owner-legacy'})).value,owned={session:'owner-legacy',page:pack.page,claimToken:pack.claimToken},link='https://esurvey.bps.go.id/h/s/owner-link-preserved';
  await oldApi('begin_record',{...owned,key:row.key});await oldApi('checkpoint',{...owned,record:{...pack.rows[0],result:'DONE',link,stage:'SELESAI'}});await oldApi('close_page',{...owned,complete:true});
  await admin('enable_territories',{campaignId:c.id});
  const geoOld=(action,data={})=>oldApi(action,{protocol:3,session:'owner-old',...data});assert.equal((await geoOld('geo_begin',{url:source})).ok,true);
  await geoOld('geo_filter_stamp',{filterStamp:'["fixed filters"]'});
  const root=[{level:'PROVINSI',code:'72',name:'SULAWESI TENGAH'},{level:'KABUPATEN/KOTA',code:'71',name:'PALU'},{level:'KECAMATAN',code:'010',name:'PALU BARAT'}];
  const recipes=['004','005'].map(code=>[...root,{level:'DESA',code,name:'VILLAGE '+code}]);
  const parts=(await geoOld('geo_catalog',{recipes,complete:true})).value.partitions,filled=parts.find(p=>p.recipe.at(-1).code==='004'),empty=parts.find(p=>p.id!==filled.id);
  await geoOld('geo_page',{partitionId:filled.id,localPage:1,rows:[row]});await geoOld('geo_finish_partition',{partitionId:filled.id,lastPage:1,boundary:'NEXT_DISABLED'});
  const replacements=[];for(let i=0;i<2;i++)replacements.push((await admin('create_worker',{campaignId:c.id,name:'Same coordinator name',role:'COORDINATOR'})).value);
  const replacementApi=client(replacements[0].token),blocked=await replacementApi('geo_begin',{protocol:3,session:'owner-new',url:source});assert.equal(blocked.status,409);assert.ok(blocked.error.includes(old.id.slice(0,8)));
  await admin('worker_toggle',{campaignId:c.id,workerId:old.id,enabled:false});assert.equal((await geoOld('geo_begin',{url:source})).status,401);
  const before=(await admin('overview',{campaignId:c.id})).value;assert.equal(before.campaign.inventoryOwner.id,old.id);assert.equal(before.campaign.inventoryOwner.enabled,false);
  assert.equal((await replacementApi('geo_begin',{protocol:3,session:'owner-new',url:source.replace('/territory-owner/','/wrong-survey/')})).status,409);
  assert.equal((await admin('overview',{campaignId:c.id})).value.campaign.inventoryOwner.id,old.id);
  const regular=(await admin('create_worker',{campaignId:c.id,name:'Regular worker',role:'WORKER'})).value;assert.equal((await client(regular.token)('geo_begin',{protocol:3,session:'not-coordinator',url:source})).status,403);
  const results=await Promise.all(replacements.map((w,i)=>cli({action:'geo_begin',token:w.token,protocol:3,session:'owner-new-'+i,url:source})));
  assert.equal(results.filter(r=>r.ok).length,1);const win=results.findIndex(r=>r.ok),winner=replacements[win],geo=(action,data={})=>client(winner.token)(action,{protocol:3,session:'owner-new-'+win,...data});
  assert.equal(results[win].value.recovered,true);assert.equal(results[win].value.catalogComplete,true);assert.equal(results[win].value.partitions.find(p=>p.id===filled.id).state,'VERIFIED');
  const after=(await admin('overview',{campaignId:c.id})).value;assert.equal(after.campaign.inventoryOwner.id,winner.id);assert.equal(after.campaign.filterStamp,before.campaign.filterStamp);assert.equal(after.campaign.generation,before.campaign.generation);assert.equal(after.counts.done,1);assert.equal(after.events.filter(e=>e.kind==='IMPORT_RECOVERY').length,1);
  const saved=(await admin('export',{campaignId:c.id,limit:500})).value.rows;assert.equal(saved[0].link,link);assert.equal(saved[0].result,'DONE');
  await admin('worker_toggle',{campaignId:c.id,workerId:old.id,enabled:true});assert.equal((await geoOld('geo_page',{partitionId:filled.id,localPage:1,rows:[row]})).status,409);assert.equal((await geoOld('geo_begin',{url:source})).status,409);
  assert.equal((await geo('geo_finish_partition',{partitionId:empty.id,lastPage:0,boundary:'NEXT_DISABLED'})).ok,true);assert.equal((await geo('geo_finish')).ok,true);assert.equal((await geoOld('geo_begin',{url:source})).value.finished,true);
 });

test('1000-row parent splits to SLS, reconciles parent identities, and never becomes ready with missing coverage or count',
 {skip:!fs.existsSync(php)||!fs.existsSync(config),timeout:45000},async()=>{
  const admin=client();await admin('login',{username:'localadmin',password:'local-fixture-password-2026'});
  const source='https://fasih-sm.bps.go.id/app/surveys/territory-cap/period/data?page=1&perPage=100&view=list';
  const c=(await admin('create_campaign',{territoryMode:true,name:'Split 1000',url:source,prefix:'7271',expectedTotal:1001})).value,w=(await admin('create_worker',{campaignId:c.id,name:'Split coordinator',role:'COORDINATOR'})).value;
  const api=client(w.token),geo=(action,data={})=>api(action,{protocol:3,session:'split-test',...data});await geo('geo_begin',{url:source});
  const recipe=[{level:'PROVINSI',code:'72',name:'SULAWESI TENGAH'},{level:'KABUPATEN/KOTA',code:'71',name:'PALU'},{level:'KECAMATAN',code:'010',name:'PALU BARAT'},{level:'DESA',code:'004',name:'UJUNA'}];
  const parent=(await geo('geo_catalog',{recipes:[recipe],complete:true})).value.partitions[0];
  const all=Array.from({length:1001},(_,i)=>{const f=fields('7271000000000000 - EC - 1 - '+i,'CAWI');return {key:F.key(f['Kode Identitas']),fields:f};});
  const children=[1,2].map(n=>[...parent.recipe,{level:'SLS',code:'00'+n,name:'SLS '+n}]);
  const split=await geo('geo_split',{partitionId:parent.id,sampleKeys:all.slice(0,1000).map(r=>r.key),recipes:children});assert.equal(split.ok,true,split.error);
  const parts=split.value.partitions.filter(p=>p.parent_id===parent.id);
  assert.equal((await geo('geo_finish_partition',{partitionId:parent.id,lastPage:0,boundary:'NEXT_DISABLED'})).status,400);
  for(let i=0;i<parts.length;i++){const rows=i===0?all.slice(0,501):all.slice(501);for(let page=1;page<=Math.ceil(rows.length/100);page++)assert.equal((await geo('geo_page',{partitionId:parts[i].id,localPage:page,rows:rows.slice((page-1)*100,page*100)})).ok,true);assert.equal((await geo('geo_finish_partition',{partitionId:parts[i].id,lastPage:Math.ceil(rows.length/100),boundary:'NEXT_DISABLED',sourceTotal:rows.length})).ok,true);if(i===0)assert.equal((await geo('geo_finish')).status,409);}
  assert.equal((await geo('geo_finish')).ok,true);const overview=(await admin('overview',{campaignId:c.id})).value;assert.equal(overview.counts.total,1001);assert.equal(overview.territories.partitions.find(p=>p.id===parent.id).state,'SPLIT');
});
