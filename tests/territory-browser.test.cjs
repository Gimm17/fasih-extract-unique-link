const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const F=require('../extension/core.js'),{fields,card,dialog}=require('./fixtures.cjs');
const exe='C:/Program Files/Google/Chrome/Application/chrome.exe',playwright='C:/Users/BPSAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
test('real browser: full panel discovers nested territory dropdowns, inventories empty branches, then filters again to extract links',{skip:!fs.existsSync(exe),timeout:45000},async()=>{
 const browser=await require(playwright).chromium.launch({executablePath:exe,headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='https://fasih-sm.bps.go.id/app/surveys/browser-territory/period/data?page=1&perPage=100&view=list',campaign={id:'campaign',sourceUrl:url,generation:1,inventoryMode:'TERRITORY',prefix:'7271',name:'Kota Palu',linkHost:'esurvey.bps.go.id',state:'CREATED',filterStamp:null},worker={id:'worker',name:'PC Uji',role:'COORDINATOR'};
 let job=null,partitions=[],records=new Map(),claimed=new Set();const local=new Map();
 try {
  await page.route('https://fasih-sm.bps.go.id/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><h1>FASIH: fixture filter</h1><button id="filter" aria-haspopup="dialog"><svg class="tabler-icon-filter"></svg>Filter</button><main id="cards"></main><button aria-label="Go to next page" disabled>Next</button>'}));
  await page.exposeFunction('bridge',async m=>{
   let value;
   if(m.type==='GET_SETTINGS')value={actionDelayMs:50,nextDelayMs:0};
   else if(m.type==='SET_SETTINGS'||m.type==='REMOTE_FLUSH')value={synced:0};
   else if(m.type==='GET_SERVER_SETTINGS')value={configured:true,workerName:worker.name,campaignName:campaign.name,outboxCount:0};
   else if(m.type==='REMOTE_INFO')value={campaign,worker,counts:{total:records.size,done:0,error:0,review:0}};
   else if(m.type==='LATEST')value=job?.id;
   else if(m.type==='READ')value={job,rows:[...local.values()],owned:true};
   else if(m.type==='CREATE'){local.clear();job={id:'job-'+m.options.server.mode,context:F.context(url),options:m.options,status:'RUNNING',phase:'INVENTORY',pages:{},visitPages:[],attempted:[]};value=job;}
   else if(m.type==='PATCH'){job={...job,...m.patch};value=job;}
   else if(m.type==='ROWS'){m.rows.forEach(r=>local.set(r.key,structuredClone(r)));value=true;}
   else if(m.type==='REMOTE'){
    const d=m.data||{};
    if(m.action==='geo_begin'){campaign.state='IMPORTING';value={partitions:[],catalogComplete:false};}
    else if(m.action==='geo_filter_stamp'){campaign.filterStamp=d.filterStamp;value={};}
    else if(m.action==='geo_catalog'){for(const recipe of d.recipes){if(!partitions.some(p=>JSON.stringify(p.recipe)===JSON.stringify(recipe)))partitions.push({id:'part-'+partitions.length,recipe,state:'NEW',pages:[]});}value={partitions};}
    else if(m.action==='geo_page'){const p=partitions.find(p=>p.id===d.partitionId);p.pages.push(d.rows.map(r=>r.key));for(const r of d.rows)records.set(r.key,{...r,partitionId:p.id,result:'PENDING',page:partitions.indexOf(p)+1,attempts:0});value={};}
    else if(m.action==='geo_finish_partition'){partitions.find(p=>p.id===d.partitionId).state='VERIFIED';value={};}
    else if(m.action==='geo_finish'){campaign.state='READY';value={};}
    else if(m.action==='geo_claim'){const p=partitions.find(p=>p.pages.length&&!claimed.has(p.id));if(!p)value={empty:true,counts:{pending:0,running:0,error:0,review:0}};else{claimed.add(p.id);value={page:partitions.indexOf(p)+1,localPage:1,partitionId:p.id,recipe:p.recipe,keys:p.pages[0],rows:p.pages[0].map(k=>records.get(k)),claimToken:'claim',leaseSeconds:300};}}
    else if(m.action==='begin_record')value={skip:false,leaseSeconds:300};
    else if(m.action==='checkpoint'){records.set(d.record.key,d.record);value={};}
    else if(m.action==='close_page'||m.action==='heartbeat')value={leaseSeconds:300};else throw Error(m.action);
   }else throw Error(m.type);
   return {ok:true,value};
  });
  await page.goto(url);await page.evaluate(({cards,emailDialog})=>{
   const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return attach.call(this,{...o,mode:'open'});};window.chrome.runtime={sendMessage:m=>window.bridge(m),onMessage:{addListener:()=>{}}};
   const levels=['PROVINSI','KABUPATEN/KOTA','KECAMATAN','DESA','SLS','SUBSLS'],chosen={PROVINSI:['72','SULAWESI TENGAH'],'KABUPATEN/KOTA':['71','PALU']};window.filterSelections=[];window.menus=0;window.links=0;
   function renderCards(){const village=chosen.DESA?.[0],main=document.querySelector('#cards');main.innerHTML=village?cards[village]:'<p>No results.</p>';const menuButton=main.querySelector('[aria-haspopup="menu"]');if(menuButton)menuButton.onclick=()=>{window.menus++;const menu=document.createElement('div');menu.role='menu';menu.innerHTML='<div role="menuitem">Pengaturan Email</div>';document.body.append(menu);menu.firstChild.onclick=()=>{menu.remove();document.body.insertAdjacentHTML('beforeend',emailDialog);const d=document.querySelector('[role="dialog"]');d.querySelector('button').onclick=()=>{window.links++;d.querySelector('div').insertAdjacentHTML('beforeend',`<input value="https://esurvey.bps.go.id/h/s/browser-village-${village}">`);d.querySelector('button').remove();};d.querySelector('[aria-label="Close"]').onclick=()=>d.remove();};};}
   document.querySelector('#filter').onclick=()=>{
    const panel=document.createElement('section');panel.role='dialog';panel.innerHTML='<h2>Filter Data</h2>';document.body.append(panel);
    const controls={};
    for(const level of levels){const group=document.createElement('div'),caption=level==='KECAMATAN'?'<h4>KECAMATAN<svg aria-hidden="true"></svg></h4>':level==='DESA'?'DESA':`<div>${level}</div>`;group.innerHTML=`${caption}<div><button role="combobox" aria-haspopup="dialog" aria-expanded="false"><span>${chosen[level]?`[${chosen[level][0]}] ${chosen[level][1]}`:'Pilih wilayah'}</span><div><svg class="tabler-icon-x"></svg><svg class="tabler-icon-selector"><path d="M8 9l4 -4l4 4"></path><path d="M16 15l-4 4l-4 -4"></path></svg></div></button></div>`;panel.append(group);const b=group.querySelector('button');controls[level]=b;b.querySelector('svg').onclick=e=>{e.stopPropagation();delete chosen[level];b.querySelector('span').textContent='Pilih wilayah';renderCards();};b.onclick=()=>{
      const popup=document.createElement('div');popup.role='dialog';popup.setAttribute('cmdk-root','');popup.innerHTML='<input placeholder="Cari...">';document.body.append(popup);b.setAttribute('aria-expanded','true');
      const options=level==='KECAMATAN'?[['000','-'],['010','PALU BARAT']]:level==='DESA'?(chosen.KECAMATAN?.[0]==='010'?[['004','UJUNA'],['005','BARU']]:[]):level==='PROVINSI'?[['72','SULAWESI TENGAH']]:level==='KABUPATEN/KOTA'?[['71','PALU']]:[];
      if(!options.length)popup.insertAdjacentHTML('beforeend','<div>No results.</div>');
      for(const o of options){const el=document.createElement('div');el.role='option';el.setAttribute('cmdk-item','');el.dataset.value=o.join(' ');el.innerHTML=`<span>[${o[0]}] ${o[1]}</span>`;popup.append(el);el.onclick=()=>{chosen[level]=o;window.filterSelections.push([level,...o]);for(const child of levels.slice(levels.indexOf(level)+1)){delete chosen[child];controls[child].querySelector('span').textContent='Pilih wilayah';}b.querySelector('span').textContent=`[${o[0]}] ${o[1]}`;popup.remove();b.setAttribute('aria-expanded','false');renderCards();};}
      b.onkeydown=e=>{if(e.key==='Escape'){popup.remove();b.setAttribute('aria-expanded','false');}};
     };}
    const close=document.createElement('button');close.innerHTML='<svg class="tabler-icon-x"></svg><span>Close</span>';close.onclick=()=>panel.remove();panel.append(close);
   };renderCards();
  },{cards:{'004':card(fields('7271000000000000 - EC - 1 - 4','CAWI')),'005':card(fields('7271000000000000 - EC - 1 - 5','CAWI'))},emailDialog:dialog()});
  for(const script of ['core.js','adapter.js','runner.js','server-runner.js','territory-adapter.js','territory-runner.js','content.js'])await page.addScriptTag({path:path.join(__dirname,'../extension',script)});
  await page.getByRole('button',{name:'Inventaris ke server',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#fasih-cawi-bot').shadowRoot.querySelector('#state').textContent.includes('Selesai'),null,{timeout:25000});
  assert.equal(job.status,'COMPLETE',job.notice);assert.equal(partitions.length,3);assert.equal(records.size,2);assert.equal(await page.evaluate(()=>window.menus),0);
  await page.getByRole('button',{name:'Mulai tugas server',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#fasih-cawi-bot').shadowRoot.querySelector('#notice').textContent.includes('Tidak ada wilayah siap'),null,{timeout:15000});
  assert.equal(job.status,'COMPLETE',job.notice);assert.equal([...records.values()].filter(r=>r.result==='DONE').length,2);assert.deepEqual(await page.evaluate(()=>[window.menus,window.links,document.querySelectorAll('[role="dialog"]').length]),[2,2,0]);
  assert.equal((await page.evaluate(()=>window.filterSelections.filter(r=>r[0]==='DESA').length))>=4,true);assert.deepEqual(errors,[]);
  fs.mkdirSync(path.join(__dirname,'../test-output'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../test-output/territory-panel.png'),fullPage:true});
 }finally{await browser.close();}
});
