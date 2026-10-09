const test=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
require('../extension/core.js');const F=globalThis.Fasih;require('../extension/adapter.js');require('../extension/runner.js');require('../extension/server-runner.js');require('../extension/territory-adapter.js');require('../extension/territory-runner.js');
const {card,fields}=require('./fixtures.cjs');
const url='https://fasih-sm.bps.go.id/app/surveys/geo/period/data?page=1&perPage=100&view=list';
const rootRecipe=[{level:'PROVINSI',code:'72',name:'SULAWESI TENGAH',value:'72 SULAWESI TENGAH'},{level:'KABUPATEN/KOTA',code:'71',name:'PALU',value:'71 PALU'}];
function recipe(code='004',name='UJUNA'){return [...rootRecipe,{level:'KECAMATAN',code:'010',name:'PALU BARAT',value:'010 PALU BARAT'},{level:'DESA',code,name,value:code+' '+name}];}
function fixture(){
 const dom=new JSDOM('<button aria-haspopup="dialog"><svg class="tabler-icon-filter"></svg></button>',{url,pretendToBeVisual:true}),doc=dom.window.document;
 dom.window.Element.prototype.getClientRects=function(){return this.hidden||!this.isConnected?[]:[{width:100,height:20}];};
 const a=new F.TerritoryAdapter(doc,dom.window.location);a.actionDelayMs=1;a.timeout=100;a.sleep=async()=>{};
 const panel=doc.createElement('section');panel.role='dialog';panel.innerHTML='<h2>Filter Data</h2>'+F.territoryLevels.map(level=>`<div><div>${level}</div><button role="combobox" aria-haspopup="dialog" aria-expanded="false"><span>Pilih wilayah</span><svg class="tabler-icon-x"></svg></button></div>`).join('')+'<button><svg class="tabler-icon-x"></svg><span>Close</span></button>';
 const selected={};doc.querySelector('button').onclick=()=>doc.body.append(panel);panel.lastChild.onclick=()=>panel.remove();
 for(const level of F.territoryLevels){doc.body.append(panel);const b=a.geoControl(panel,level);b.querySelector('svg').onclick=e=>{e.stopPropagation();b.querySelector('span').textContent='Pilih wilayah';};b.onclick=()=>{
   const popup=doc.createElement('div');popup.role='dialog';popup.setAttribute('cmdk-root','');popup.innerHTML='<input placeholder="Cari...">';b.setAttribute('aria-expanded','true');
   const values=level==='PROVINSI'?rootRecipe.slice(0,1):level==='KABUPATEN/KOTA'?rootRecipe.slice(1,2):level==='KECAMATAN'?[{code:'000',name:'-'},{code:'010',name:'PALU BARAT'}]:level==='DESA'?[{code:'004',name:'UJUNA'},{code:'005',name:'BARU'}]:[{code:'001',name:'SLS SATU'}];
   for(const o of values){const option=doc.createElement('div');option.role='option';option.setAttribute('cmdk-item','');option.dataset.value=o.code+' '+o.name;option.innerHTML=`<span>[${o.code}] ${o.name}</span>`;option.onclick=()=>{b.querySelector('span').textContent=`[${o.code}] ${o.name}`;selected[level]=o;popup.remove();b.setAttribute('aria-expanded','false');};popup.append(option);}doc.body.append(popup);b.onkeydown=e=>{if(e.key==='Escape'){popup.remove();b.setAttribute('aria-expanded','false');}};
 };}
 panel.remove();return {a,doc,panel,dom,selected};
}
test('filter controls are bound to exact labels; popup options include the unallocated 000 branch; Close is scoped',async()=>{
 const {a,doc,panel}=fixture();await a.openFilter();assert.notEqual(a.geoControl(panel,'KECAMATAN'),a.geoControl(panel,'DESA'));
 assert.deepEqual((await a.enumerate(panel,'KECAMATAN')).map(r=>r.code),['000','010']);
 const p=recipe();for(const r of p)await a.selectRegion(panel,r);a.verifyRecipe(panel,p);
 const unrelated=doc.createElement('button');unrelated.textContent='Close';unrelated.onclick=()=>{throw Error('Wrong close');};doc.body.append(unrelated);
 await a.closeFilter(panel);assert.equal(a.filterPanel(),null);assert.ok(doc.contains(unrelated));
});
test('duplicate labels stop automation; changing a lower filter prevents verification',async()=>{
 const {a,panel}=fixture();await a.openFilter();const r=recipe();for(const o of r)await a.selectRegion(panel,o);
 a.geoControl(panel,'SLS').querySelector('span').textContent='[001] EXTRA';assert.throws(()=>a.verifyRecipe(panel,r),/SLS/);
 panel.insertAdjacentHTML('beforeend','<div><span>DESA</span><button role="combobox">Pilih wilayah</button></div>');assert.throws(()=>a.geoControl(panel,'DESA'),/2 kandidat/);
});
test('district captions with nested markup, headings, and text beside the trigger open the correct dropdown',async()=>{
 for(const caption of ['<h4>KECAMATAN</h4>','<label>KECAMATAN<svg aria-hidden="true"></svg></label>','KECAMATAN']){
  const {a,panel}=fixture();await a.openFilter();const district=a.geoControl(panel,'KECAMATAN'),group=district.parentElement;
  group.firstChild.remove();group.insertAdjacentHTML('afterbegin',caption);
  assert.equal(a.geoControl(panel,'KECAMATAN'),district);
  assert.deepEqual((await a.enumerate(panel,'KECAMATAN')).map(r=>r.code),['000','010']);
  await a.selectRegion(panel,{level:'KECAMATAN',code:'010',name:'PALU BARAT'});
  assert.equal(a.selected(district),'[010] PALU BARAT');assert.equal(a.selected(a.geoControl(panel,'DESA')),'Pilih wilayah');
 }
});
test('explicit label associations identify controls in a shared group without guessing their position',async()=>{
 const {a,panel,doc}=fixture();await a.openFilter();const district=a.geoControl(panel,'KECAMATAN'),village=a.geoControl(panel,'DESA');
 district.parentElement.remove();village.parentElement.remove();
 const group=doc.createElement('div');group.innerHTML='<label for="district">KECAMATAN</label><h4 id="village-label">DESA</h4>';panel.append(group);
 district.id='district';village.setAttribute('aria-labelledby','village-label');group.append(village,district);
 assert.equal(a.geoControl(panel,'KECAMATAN'),district);assert.equal(a.geoControl(panel,'DESA'),village);
 assert.deepEqual((await a.enumerate(panel,'KECAMATAN')).map(r=>r.code),['000','010']);
});
test('opening the filter waits for district controls to finish rendering',async()=>{
 const {a,panel,doc}=fixture();doc.body.append(panel);const district=a.geoControl(panel,'KECAMATAN'),group=district.parentElement;group.remove();
 let ticks=0;a.sleep=async()=>{if(++ticks===1)panel.append(group);};
 assert.equal(await a.openFilter(),panel);assert.equal(a.geoControl(panel,'KECAMATAN'),district);assert.ok(ticks>0);
});
function simulation(parts,packets={}){
 const job={id:'geo-job',context:F.context(url),options:{prefix:'7271',linkHost:'esurvey.bps.go.id',actionDelayMs:50,nextDelayMs:0,server:{mode:'INVENTORY',territoryMode:true,campaignId:'c',workerId:'w',generation:1}},phase:'INVENTORY',status:'RUNNING',pages:{},visitPages:[],attempted:[]};
 const store={job},events=[],saved=new Map();let currentPart,local=1;
 const a={doc:{hidden:false},location:{href:url,assign:u=>{a.location.href=u;local=F.context(u).page;}},beforeAction:()=>{},onActivity:()=>{},filterPanel:()=>null,applyRecipe:async r=>{events.push(['filter',r]);currentPart=parts.find(p=>JSON.stringify(p.recipe)===JSON.stringify(r));},verifyActive:async()=>{},cleanup:async()=>{},readRows:()=>packets[currentPart?.id]?.[local]||[],emptyPage:()=>!a.readRows().length,lastPage:()=>!packets[currentPart?.id]?.[local+1],ready:async()=>a.readRows(),pageSignature:()=>a.readRows().map(r=>F.key(r.fields['Kode Identitas'])).sort().join('|'),nextPage:async()=>{local++;a.location.href=url.replace('page=1','page='+local);return a.readRows().length?{}:{empty:true};}};
 const send=async m=>{
  if(m.type==='PATCH'){store.job={...store.job,...structuredClone(m.patch)};return store.job;}
  if(m.type==='ROWS'){m.rows.forEach(r=>saved.set(r.key,structuredClone(r)));return true;}
  if(m.type==='REMOTE_INFO')return {worker:{id:'w'},campaign:{id:'c',generation:1,inventoryMode:'TERRITORY',sourceUrl:url}};
  if(m.type==='REMOTE_FLUSH')return {synced:0};
  if(m.type==='REMOTE'){events.push([m.action,m.data]);if(m.action==='geo_begin')return {catalogComplete:true,partitions:parts};return {};}
  throw Error(m.type);
 };
 return {job,store,a,events,saved,runner:new F.TerritoryRunner(a,send)};
}
test('inventory uses each village filter and independent local page 1 including zero-data branches',async()=>{
 const parts=[{id:'a',state:'NEW',recipe:recipe()},{id:'b',state:'NEW',recipe:recipe('005','BARU')},{id:'z',state:'NEW',recipe:[...rootRecipe,{level:'KECAMATAN',code:'000',name:'-',value:'000 -'}]}];
 const s=simulation(parts,{a:{1:[{fields:fields('7271000000000000 - EC - 1 - 1','CAWI')}]},b:{1:[{fields:fields('7271000000000000 - EC - 1 - 2','CAWI')}]}});await s.runner.start(s.job);
 assert.equal(s.store.job.status,'COMPLETE',s.store.job.notice);assert.equal(s.saved.size,2);
 assert.deepEqual(s.events.filter(e=>e[0]==='geo_page').map(e=>[e[1].partitionId,e[1].localPage]),[['a',1],['b',1]]);
 assert.equal(s.events.filter(e=>e[0]==='geo_finish_partition').length,3);assert.equal(s.events.filter(e=>e[0]==='filter').length,3);
});
test('a leaf that reaches 1000 cannot be finalized or upload a truncated parent',async()=>{
 const p={id:'cap',state:'NEW',recipe:[...recipe(),{level:'SLS',code:'001',name:'SLS SATU',value:'001 SLS SATU'},{level:'SUBSLS',code:'001',name:'SUBSLS SATU',value:'001 SUBSLS SATU'}]},pages={};
 for(let page=1;page<=10;page++)pages[page]=Array.from({length:100},(_,i)=>({fields:fields('7271000000000000 - EC - 1 - '+((page-1)*100+i),'CAWI')}));
 const s=simulation([p],{cap:pages});await s.runner.start(s.job);assert.equal(s.store.job.status,'PAUSED');assert.match(s.store.job.notice,/1.000/);
 assert.equal(s.events.some(e=>e[0]==='geo_page'||e[0]==='geo_finish'),false);assert.equal(s.store.job.geoScan.pages[10].length,100);
});
test('restored per-village page signatures detect changed membership before upload',async()=>{
 const p={id:'a',state:'NEW',recipe:recipe()},s=simulation([p],{a:{1:[{fields:fields('7271000000000000 - EC - 1 - 9','CAWI')}]}});
 s.job.geoScan={id:'a',cursor:1,pages:{1:[{key:'7271000000000000-EC-1-8',fields:{}}]}};await s.runner.start(s.job);assert.equal(s.store.job.status,'PAUSED');assert.match(s.store.job.notice,/berubah saat resume/);assert.equal(s.events.some(e=>e[0]==='geo_page'),false);
});
test('extraction applies the claimed village and local page while checkpoints use the server package ID',async()=>{
 const p={id:'a',state:'PENDING',recipe:recipe()},first=fields('7271000000000000 - EC - 1 - 1','CAWI'),second=fields('7271000000000000 - EC - 1 - 2','CAWI');
 const s=simulation([p],{a:{1:[{fields:first}],2:[{fields:second}]}});s.job.options.server.mode='WORK';let claimed=false;
 const original=s.runner.send;s.runner.send=async m=>{
  if(m.type==='REMOTE'&&m.action==='geo_claim'){if(claimed)return {empty:true,counts:{pending:0,running:0,error:0,review:0}};claimed=true;return {page:87,localPage:2,partitionId:p.id,recipe:p.recipe,claimToken:'token',leaseSeconds:300,keys:[F.key(second['Kode Identitas'])],rows:[{key:F.key(second['Kode Identitas']),fields:second,result:'PENDING',page:87,attempts:0}]};}
  if(m.type==='REMOTE'&&m.action==='begin_record')return {skip:false,leaseSeconds:300};return original(m);
 };
 s.a.findRow=k=>s.a.readRows().find(r=>F.key(r.fields['Kode Identitas'])===k);let links=0;s.a.getLink=async()=>{links++;return {link:'https://esurvey.bps.go.id/h/s/geo-page-2',dialog:{}};};s.a.closeDialog=async()=>{};
 await s.runner.start(s.job);assert.equal(s.store.job.status,'COMPLETE',s.store.job.notice);assert.equal(F.context(s.a.location.href).page,2);assert.equal(links,1);
 const checkpoints=s.events.filter(e=>e[0]==='checkpoint');assert.ok(checkpoints.length);assert.equal(checkpoints.every(e=>e[1].page===87),true);assert.equal([...s.saved.values()][0].result,'DONE');
});
