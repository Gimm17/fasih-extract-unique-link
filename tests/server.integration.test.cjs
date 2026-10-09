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
  await dashboard.getByRole('button',{name:/Kelola proyek/}).click();await dashboard.locator('#newExpected').fill('123');await dashboard.waitForTimeout(3200);assert.equal(await dashboard.locator('#newExpected').inputValue(),'123');
  await dashboard.getByRole('button',{name:/Data & hasil/}).click();await dashboard.locator('#search').fill('CONTOH');await dashboard.locator('#searchApply').click();await dashboard.waitForFunction(()=>document.querySelectorAll('#rows tr').length===20);
  assert.equal(await dashboard.locator('#rows').locator('script').count(),0);assert.ok((await dashboard.locator('#rows').textContent()).includes('<CONTOH>'));
  const download=dashboard.waitForEvent('download');await dashboard.locator('#excel').click();const file=await download;assert.match(file.suggestedFilename(),/\.xlsx$/);await file.saveAs(path.join(root,'test-output/server-browser-export.xlsx'));
  assert.equal(fs.readFileSync(path.join(root,'test-output/server-browser-export.xlsx')).subarray(0,2).toString(),'PK');
  await dashboard.getByRole('button',{name:/Monitor pekerjaan/}).click();await dashboard.setViewportSize({width:390,height:844});await dashboard.screenshot({path:path.join(root,'test-output/dashboard-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  const csrf=await dashboard.evaluate(async()=>{const r=await fetch('api.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pause',campaignId:document.querySelector('#campaign').value})});return r.status;});assert.equal(csrf,403);
 }finally{await browser.close();}
});
