'use strict';
const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('id-ID');
let csrf='',project='',snapshot=null,activeTab='monitor',offset=0,polling=false,lastSuccess=0;
const stateNames={CREATED:'Menunggu inventaris',IMPORTING:'Inventaris berjalan',READY:'Siap',RUNNING:'Berjalan',PAUSED:'Dijeda',DONE:'Selesai',REVIEW:'Perlu pemeriksaan',NEW:'Menunggu inventaris',VERIFIED:'Terverifikasi',SPLIT:'Dipecah',DISCOVERY:'Menemukan wilayah',PENDING:'Belum dikerjakan',ERROR:'Gagal',SKIPPED:'Dilewati'};
function message(value){$('notice').textContent=value;$('notice').classList.toggle('hidden',!value);}
function node(tag,text,cls){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;}
function pill(state){const el=node('span',stateNames[state]||state,'pill');if(['DONE','READY','ONLINE'].includes(state))el.classList.add('good');if(['ERROR','OFFLINE'].includes(state))el.classList.add('bad');if(['REVIEW','PAUSED'].includes(state))el.classList.add('warn');return el;}
function time(v){if(!v)return 'Belum terhubung';const date=new Date(v.endsWith('Z')||v.includes('+')?v:v.replace(' ','T')+'Z');return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Singapore',dateStyle:'short',timeStyle:'medium'}).format(date);}
async function api(action,data={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch('api.php',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({...data,action})});
    let r;try{r=await response.json();}catch{throw new Error('Respons server bukan JSON. Periksa PHP dan konfigurasi hosting.');}
    if(!response.ok||!r.ok){if(response.status===401&&action!=='login')showLogin();throw new Error(r.error||'Permintaan gagal.');}return r.value;
  }finally{clearTimeout(timer);}
}
function passwordVisibility(visible){const button=$('togglePassword');$('password').type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'Sembunyikan password':'Tampilkan password');button.title=button.getAttribute('aria-label');button.querySelector('.eye-show').classList.toggle('hidden',visible);button.querySelector('.eye-hide').classList.toggle('hidden',!visible);}
$('togglePassword').onclick=()=>passwordVisibility($('password').type==='password');
function showLogin(){passwordVisibility(false);$('app').classList.add('hidden');$('login').classList.remove('hidden');csrf='';}
async function enter(session){csrf=session.csrf;$('password').value='';passwordVisibility(false);$('login').classList.add('hidden');$('app').classList.remove('hidden');await projects();await refresh();}
async function projects(selectId){const items=await api('campaigns');$('campaign').replaceChildren();for(const c of items){const o=node('option',c.name);o.value=c.id;$('campaign').append(o);}project=selectId||project||items[0]?.id||'';if(!items.some(c=>c.id===project))project=items[0]?.id||'';$('campaign').value=project;if(!project){tab('setup');message('Buat proyek dan token komputer untuk memulai.');}}
function tab(name){activeTab=name;for(const id of ['monitor','territories','results','setup'])$(id).classList.toggle('hidden',id!==name);document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));$('pageTitle').textContent={monitor:'Monitor pekerjaan',territories:'Progres wilayah',results:'Data & hasil',setup:'Kelola proyek'}[name];if(name==='results')loadRows().catch(e=>message(e.message));}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
function renderInventoryOwner(c){const owner=c.inventoryOwner;let text=owner?'Pemilik inventaris: '+owner.name+' · ID '+owner.id.slice(0,8)+' · akses '+(owner.enabled?'aktif':'nonaktif')+'.':'Belum ada pemilik inventaris.';if(owner&&c.inventoryMode==='TERRITORY'&&c.state==='IMPORTING')text+=owner.enabled?' Lanjutkan dengan token pemilik ini. Untuk mengganti Koordinator, hentikan proses lama lalu nonaktifkan pemilik di Monitor pekerjaan.':' Koordinator aktif dapat melanjutkan inventaris tanpa reset; data dan link tersimpan dipertahankan.';$('inventoryOwner').textContent=text;}
function render(data){snapshot=data;renderTerritories(data);renderInventoryOwner(data.campaign);$('territoryMode').textContent='Metode aktif: '+(data.campaign.inventoryMode==='TERRITORY'?'Wilayah otomatis · protokol v3':'Filter manual lama');$('enableTerritories').disabled=data.campaign.inventoryMode==='TERRITORY';const c=data.counts;for(const id of ['total','done','pending','running','error','review'])$(id).textContent=fmt(c[id]);$('target').textContent='Target '+fmt(data.campaign.expectedTotal||c.total);
  $('projectState').replaceWith(Object.assign(pill(data.campaign.state),{id:'projectState'}));const handled=c.done+c.skipped,percent=c.total?100*handled/c.total:0;
  $('percent').textContent=percent.toFixed(1).replace('.',',');$('progressBar').style.width=percent+'%';$('progressText').textContent=fmt(handled)+' dari '+fmt(c.total)+' ditangani · '+fmt(c.skipped)+' dilewati';
  $('speed').textContent=data.perMinute.toFixed(1).replace('.',',')+' data/menit · 10 menit terakhir';const remaining=c.total-handled;
  $('eta').textContent=data.perMinute>0?'Perkiraan '+Math.ceil(remaining/data.perMinute)+' menit untuk sisa data pada laju saat ini.':'Estimasi muncul setelah ada hasil.';
  $('updated').textContent='Diperbarui '+time(data.serverTime);if(document.activeElement!==$('newExpected'))$('newExpected').value=data.campaign.expectedTotal;
  $('workers').replaceChildren();for(const w of data.workers){const tr=node('tr'),identity=node('td');identity.append(node('b',w.name),node('small',(w.role==='COORDINATOR'?'Koordinator':'Pelaksana')+' · ID '+w.id.slice(0,8)));if(w.id===data.campaign.inventoryOwner?.id)identity.append(node('small','Pemilik inventaris'));tr.append(identity);
    const online=w.seconds_ago!==null&&Number(w.seconds_ago)<90&&Number(w.enabled)===1,connection=node('td');connection.append(pill(online?'ONLINE':'OFFLINE'));tr.append(connection);
    const activity=node('td');activity.append(node('b',stateNames[w.state]||w.state),node('small',w.activity||'Belum ada aktivitas'));tr.append(activity,node('td',fmt(w.done)),node('td',fmt(w.errors)),node('td',time(w.last_seen)));
    const action=node('td'),b=node('button',Number(w.enabled)?'Nonaktifkan':'Aktifkan');b.onclick=()=>perform('worker_toggle',{workerId:w.id,enabled:!Number(w.enabled)});action.append(b);tr.append(action);$('workers').append(tr);
  }if(!data.workers.length)empty($('workers'),7,'Belum ada komputer. Tambahkan token di Kelola proyek.');
  $('packageCount').textContent=fmt(data.packages.length);$('packages').replaceChildren();for(const p of data.packages){const card=node('div',null,'package'),top=node('div',null,'top');top.append(node('b',(data.territories?.partitions.find(t=>t.id===p.partition_id)?.recipe.at(-1)?.name||'Paket')+' · halaman '+(p.local_page||p.page_no)),pill(p.state));card.append(top,node('small',p.worker_name||'—'),node('small',p.working_key||'Paket dicadangkan'));if(p.state==='REVIEW'){const b=node('button','Periksa & antrikan ulang');b.onclick=()=>{if(confirm('Pastikan komputer lama berhenti dan hasil lokal sudah disinkronkan. Link yang tersimpan akan dipakai kembali. Antrikan paket halaman '+p.page_no+'?'))perform('release_review',{page:Number(p.page_no),confirm:'REQUEUE'});};card.append(b);}$('packages').append(card);}if(!data.packages.length)$('packages').append(node('div','Tidak ada paket aktif/perlu pemeriksaan.','empty'));
  $('events').replaceChildren();for(const e of data.events){const el=node('div',null,'event');el.append(node('small',e.kind+' · '+(e.worker_name||'Dashboard')),node('p',e.message),node('small',time(e.created_at)));$('events').append(el);}if(!data.events.length)$('events').append(node('div','Aktivitas akan muncul di sini.','empty'));
}
function empty(tbody,colspan,text){const tr=node('tr'),td=node('td',text,'empty');td.colSpan=colspan;tr.append(td);tbody.append(tr);}
function regionStats(data,region){
  const t=data.territories||{},parts=(t.partitions||[]).filter(p=>p.recipe.some((r,i)=>region.recipe[i]?.code===r.code)&&region.recipe.every((r,i)=>p.recipe[i]?.code===r.code)&&p.state!=='SPLIT');
  const stats={total:0,done:0,errors:0,pending:0,running:0,skipped:0};
  for(const p of parts){const c=t.counts.find(c=>c.partition_id===p.id);if(c)for(const k of Object.keys(stats))stats[k]+=Number(c[k]||0);}
  return {parts,stats:t.regionCounts?.find(c=>c.regionId===region.id)||stats};
}
function renderTerritories(data){
  const t=data.territories||{regions:[],partitions:[],counts:[],duplicates:[],unmapped:0};
  $('territorySummary').textContent=`${t.regions.filter(r=>r.level==='KECAMATAN').length} kecamatan · ${t.regions.filter(r=>r.level==='DESA').length} desa/kelurahan · ${t.partitions.filter(p=>p.state!=='SPLIT').length} filter daun · ${t.duplicates.length} identitas lintas filter · ${t.unmapped} data lama belum terpetakan. Katalog ${data.campaign.catalogComplete?'lengkap':'belum lengkap'}. Jumlah baris wilayah dapat mengandung duplikasi; total unik proyek: ${fmt(data.counts.total)} / ${fmt(data.campaign.expectedTotal)}.`;
  $('territoryRows').replaceChildren();
  for(const r of t.regions){if(r.level==='PROVINSI')continue;const {parts,stats}=regionStats(data,r),tr=node('tr'),label=node('td',' '.repeat(Math.max(0,r.recipe.length-2)*3)+`[${r.code}] ${r.name}`);label.style.whiteSpace='pre-wrap';
    const own=t.partitions.find(p=>p.id===r.id),state=node('td');state.append(pill(own?.state||(parts.length?(parts.every(p=>p.state==='DONE')?'DONE':parts.some(p=>p.state==='REVIEW')?'REVIEW':parts.some(p=>p.state==='RUNNING')?'RUNNING':parts.some(p=>p.state==='NEW')?'NEW':parts.every(p=>p.state==='VERIFIED')?'VERIFIED':'PENDING'):'DISCOVERY')));
    const source=own?.source_total??null,workers=[...new Set(parts.map(p=>data.workers.find(w=>w.id===p.worker_id)?.name).filter(Boolean))];
    tr.append(label,state,node('td',source===null?'Belum diketahui':fmt(source)),node('td',fmt(stats.total)),node('td',fmt(stats.done)),node('td',fmt(stats.errors)),node('td',fmt(stats.pending)+' / '+fmt(stats.running)),node('td',workers.join(', ')||'—'));$('territoryRows').append(tr);
  }
  if(!t.regions.length)empty($('territoryRows'),8,'Master wilayah akan muncul setelah Koordinator menjalankan inventaris melalui filter.');
}
function territorySheets(t,rows){
  if(!t?.regions?.length)return [];
  return [
    {name:'REKAP_WILAYAH',rows:[['Level','Kode','Nama','Induk','Status','Sumber','Terbaca','Selesai','Gagal'],...t.regions.map(r=>{const p=t.partitions.find(p=>p.id===r.id),c=t.regionCounts?.find(c=>c.regionId===r.id)||t.counts.find(c=>c.partition_id===r.id);return [r.level,r.code,r.name,r.parent_id||'',p?.state||'',p?.source_total??'',c?.total||0,c?.done||0,c?.errors||0];})]},
    {name:'INVENTARIS',rows:[['Identitas','Wilayah','Halaman wilayah','Hasil'],...rows.map(r=>[r.fields['Kode Identitas'],['KECAMATAN','DESA','SLS','SUBSLS'].map(k=>r.fields[k]||'').filter(Boolean).join(' / '),r.localPage||'',r.serverResult||r.result])]},
    {name:'DUPLIKAT',rows:[['Identitas','Jumlah filter'],...t.duplicates.map(r=>[r.identity_key,r.locations])]},
    {name:'BELUM_TERPETAKAN',rows:[['Identitas','Hasil','Link'],...rows.filter(r=>!r.partitionId).map(r=>[r.fields['Kode Identitas'],r.result,r.link||''])]}
  ];
}
async function refresh(){if(polling||!csrf||!project)return;polling=true;try{render(await api('overview',{campaignId:project}));lastSuccess=Date.now();$('live').textContent='● Live · setiap 3 detik';$('live').classList.remove('stale');if(activeTab==='results')await loadRows();}catch(e){$('live').textContent='● Terputus · data terakhir';$('live').classList.add('stale');message(e.message);}finally{polling=false;}}
async function loadRows(){if(!project)return;const data=await api('rows',{campaignId:project,result:$('resultFilter').value||null,search:$('search').value,offset,limit:100});$('rows').replaceChildren();for(const r of data.rows){const tr=node('tr'),identity=node('td');identity.append(node('b',r.fields['Kode Identitas'],'identity'),node('small',r.fields['Nama Keluarga/Bangunan/Usaha']||''));tr.append(identity,node('td',r.localPage||r.page));const state=node('td');state.append(pill(r.serverResult||r.result));tr.append(state,node('td',r.workerName||'—'));const detail=node('td');if(r.link){const a=node('a','Buka unique link');a.href=r.link;a.target='_blank';a.rel='noreferrer';detail.append(a);}if(r.error)detail.append(node('small',r.error));if(!r.link&&!r.error)detail.append(node('small',r.stage));tr.append(detail);$('rows').append(tr);}if(!data.rows.length)empty($('rows'),5,'Tidak ada data pada filter ini.');$('previous').disabled=offset===0;$('next').disabled=data.rows.length<100;$('rowPage').textContent='Halaman '+(offset/100+1);}
async function perform(action,data={}){try{message('Memproses…');await api(action,{campaignId:project,...data});message('Perubahan tersimpan.');await refresh();}catch(e){message(e.message);}}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{$('loginNotice').textContent='Masuk…';await enter(await api('login',{username:$('username').value,password:$('password').value}));}catch(e){$('loginNotice').textContent=e.message;}};
$('logout').onclick=async()=>{try{await api('logout');}finally{showLogin();}};
$('campaign').onchange=()=>{project=$('campaign').value;offset=0;refresh();};$('refresh').onclick=()=>refresh();
$('pause').onclick=()=>perform('pause');$('resume').onclick=()=>perform('resume');$('retry').onclick=()=>perform('retry');
$('searchApply').onclick=()=>{offset=0;loadRows().catch(e=>message(e.message));};$('resultFilter').onchange=$('searchApply').onclick;
$('previous').onclick=()=>{offset=Math.max(0,offset-100);loadRows().catch(e=>message(e.message));};$('next').onclick=()=>{offset+=100;loadRows().catch(e=>message(e.message));};
$('campaignForm').onsubmit=async e=>{e.preventDefault();try{const c=await api('create_campaign',{territoryMode:$('inventoryMode').value==='TERRITORY',name:$('projectName').value,url:$('sourceUrl').value,prefix:$('prefix').value,expectedTotal:Number($('expectedTotal').value),linkHost:$('linkHost').value});await projects(c.id);message('Proyek dibuat. Tambahkan 5 komputer dan satu token Koordinator.');await refresh();}catch(e){message(e.message);}};
$('workerForm').onsubmit=async e=>{e.preventDefault();try{if(!project)throw new Error('Buat/pilih proyek dahulu.');const w=await api('create_worker',{campaignId:project,name:$('workerName').value,role:$('workerRole').value});$('newToken').value=w.token;$('tokenName').textContent=w.name+' · '+w.role;$('tokenBox').classList.remove('hidden');await refresh();}catch(e){message(e.message);}};
$('copyToken').onclick=async()=>{try{await navigator.clipboard.writeText($('newToken').value);message('Token disalin.');}catch{$('newToken').focus();$('newToken').select();message('Salin token yang dipilih dengan Ctrl+C.');}};
$('expectedForm').onsubmit=e=>{e.preventDefault();perform('expected',{expectedTotal:Number($('newExpected').value)});};
$('passwordForm').onsubmit=async e=>{e.preventDefault();await perform('password',{oldPassword:$('oldPassword').value,newPassword:$('newPassword').value});$('oldPassword').value='';$('newPassword').value='';};
$('enableTerritories').onclick=()=>{if(confirm('Aktifkan wilayah Kota Palu setelah semua komputer berhenti dan hasil tertunda disinkronkan? Data serta link lama dipertahankan untuk pemetaan ulang.'))perform('enable_territories');};
$('resetCentral').onclick=()=>perform('reset',{confirm:$('resetName').value});
function download(bytes,type,name){const url=URL.createObjectURL(new Blob([bytes],{type})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
async function exportAll(json){if(!project||!snapshot)return;const buttons=[$('excel'),$('backup')];buttons.forEach(b=>b.disabled=true);try{const rows=[];for(let start=0;;start+=500){const part=await api('export',{campaignId:project,offset:start,limit:500});rows.push(...part.rows);message('Menyiapkan '+fmt(rows.length)+' hasil…');if(part.rows.length<500)break;}
  const c=snapshot.campaign,job={id:c.id,options:{region:c.name,prefix:c.prefix,linkHost:c.linkHost,pilot:false},context:{scope:c.scope,url:c.sourceUrl,view:'list'},processingView:'list',status:c.state==='PAUSED'?'PAUSED':'RUNNING',phase:'PROCESS',inventoryComplete:!['CREATED','IMPORTING'].includes(c.state),notice:'Ekspor gabungan server; snapshot progres selama pengunduhan.'};
  for(const r of rows)r.fields['Komputer']=r.workerName||'';
  const base='FULX-'+c.id.slice(0,8)+'-'+Fasih.localDate();
  const territories=(await api('overview',{campaignId:project})).territories;
  if(json)download(JSON.stringify({version:'0.3.6',exportedAt:new Date().toISOString(),campaign:c,territories,job,rows},null,2),'application/json',base+'.json');
  else download(FasihXlsx.makeWorkbook([...FasihXlsx.exportSheets(job,rows),...territorySheets(territories,rows)]),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',base+'.xlsx');
  message('Unduhan siap: '+fmt(rows.length)+' baris.');
}catch(e){message(e.message);}finally{buttons.forEach(b=>b.disabled=false);}}
$('excel').onclick=()=>exportAll(false);$('backup').onclick=()=>exportAll(true);
$('sourceUrl').value='https://fasih-sm.bps.go.id/app/surveys/a0429e96-51a5-477b-a415-485f9c153004/fd68e454-ba45-4b85-8205-f3bf777ded24/data?page=1&perPage=100&search=-+EC+-&view=list';
setInterval(()=>{if(!document.hidden)refresh();if(lastSuccess&&Date.now()-lastSuccess>15000){$('live').textContent='● Data belum diperbarui';$('live').classList.add('stale');}},3000);
(async()=>{try{await enter(await api('session'));}catch{showLogin();}})();

$('fillProject').onclick=()=>{if(!snapshot)return;const c=snapshot.campaign;$('projectName').value=c.name;$('sourceUrl').value=c.sourceUrl;$('prefix').value=c.prefix;$('linkHost').value=c.linkHost;$('expectedTotal').value=c.expectedTotal;};
$('editProject').onclick=async()=>{try{if(!project)throw new Error('Pilih proyek dahulu.');await api('edit_campaign',{campaignId:project,name:$('projectName').value,url:$('sourceUrl').value,prefix:$('prefix').value,linkHost:$('linkHost').value,expectedTotal:Number($('expectedTotal').value)});await projects(project);await refresh();message('Proyek diperbarui. Reset progres lokal lama sebelum memulai inventaris baru.');}catch(e){message(e.message);}};
