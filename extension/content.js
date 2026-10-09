(function () {
  'use strict';
  if(globalThis.__fasihBotPanel) return;
  const F=globalThis.Fasih;
  try { F.context(location.href); } catch { return; }
  globalThis.__fasihBotPanel=true;
  const host=document.createElement('div'); host.id='fasih-cawi-bot';
  host.style.cssText='position:fixed;right:16px;top:126px;z-index:2147483646;font:14px system-ui;color:#183042;pointer-events:auto;';
  const shadow=host.attachShadow({mode:'closed'});
  shadow.innerHTML=`<style>
    *{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;border:1px solid #cbd5e1;border-radius:7px;padding:9px;background:white;color:#183042}button:disabled{opacity:.45;cursor:default}.primary{background:#ee7918;border-color:#ee7918;color:white;font-weight:650}.panel{width:360px;max-height:calc(100vh - 150px);overflow:auto;background:#fff;border:1px solid #ccd7e0;border-radius:12px;box-shadow:0 8px 35px #16314630}.head{padding:14px 16px;display:flex;justify-content:space-between;align-items:center;background:#fff3e8;border-bottom:1px solid #e2e8f0}.head strong{font-size:16px}.body{padding:16px;display:grid;gap:12px}label{display:grid;gap:5px;font-size:12px;font-weight:650}input,select{padding:8px;border:1px solid #ccd7e0;border-radius:6px;width:100%;background:white;color:#183042}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.muted{font-size:12px;line-height:1.5;color:#526b7c}.notice{font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;border:1px solid #e2e8f0;background:#f7fafc;padding:10px;border-radius:7px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}.stat{padding:8px;background:#f1f6fa;border-radius:6px;font-size:11px}.stat b{display:block;font-size:19px;color:#244a64}.hidden{display:none}.mini{box-shadow:0 4px 15px #16314620;background:#fff3e8}.meter{height:6px;background:#edf2f6;border-radius:6px;overflow:hidden}.meter div{height:100%;background:#ee7918;width:0}a{color:#244a64}
    .working{width:280px}.working .body{padding:10px;gap:8px}.working .body>*{display:none}.working .body>#state,.working .body>#notice,.working .body>#reset,.working .body>#resetConfirm:not(.hidden){display:block}.working .body>#controls,.working .body>.stats{display:grid}.working .head{padding:10px}.working .head strong{font-size:13px}
  </style><button class="mini hidden" id="mini">FULX · v0.2.1</button><section class="panel" id="panel">
    <div class="head"><strong>FULX · v0.2.1</strong><button id="hide" aria-label="Sembunyikan panel">−</button></div>
    <div class="body"><div class="muted">LIST · ekstrak unique link · hanya OPEN dan CAWI<br>Kolom opsional yang tidak tampil boleh kosong.</div>
    <label>Wilayah<select id="region"><option value="Palu">Kota Palu</option><option value="Sulteng">Seluruh Sulawesi Tengah</option></select></label>
    <div class="row"><label>Awalan kode wilayah<input id="prefix" value="7271" inputmode="numeric" maxlength="16"></label><label>Domain link survei<input id="linkHost" value="esurvey.bps.go.id"></label></div>
    <div class="muted">Terapkan filter wilayah di FASIH. Awalan kode memeriksa bahwa setiap baris masih berada dalam cakupan.</div>
    <div class="row"><label>Jeda aksi (detik)<input id="actionDelay" type="number" min="0.05" max="60" step="0.05" value="0.50"></label><label>Jeda antar data (detik)<input id="nextDelay" type="number" min="0" max="300" step="0.05" value="1.00"></label></div>
    <button id="saveTiming">Simpan jeda</button><div class="muted">Jeda sebelum aksi/pembacaan URL. Jika FASIH belum siap, waktu tunggu bisa lebih lama. Atur saat proses berhenti; berlaku saat mulai/lanjut/ulang gagal.</div>
    <div class="notice" id="serverState">Mode lokal · server belum dihubungkan.</div>
    <button id="serverConfig">Pengaturan server</button><div class="row"><button id="serverInventory">Inventaris ke server</button><button id="serverStart" class="primary">Mulai tugas server</button></div><button id="serverSync">Sinkronkan hasil tertunda</button>
    <div class="muted">Server membagi paket antar komputer. Mode lokal di bawah hanya tersedia saat server tidak terhubung.</div>
    <div class="row"><button id="diagnose">Cek data halaman</button><button id="pilot" class="primary">Pilot 5 data</button></div>
    <div class="notice hidden" id="diagnostics" role="status" aria-live="polite"></div>
    <button id="all" class="primary">Mulai seluruh data pada filter</button>
    <div class="stats"><div class="stat">Inventaris<b id="total">0</b></div><div class="stat">Selesai<b id="done">0</b></div><div class="stat">Gagal<b id="error">0</b></div></div>
    <div class="meter"><div id="bar"></div></div><div class="muted" id="state">Belum ada proses.</div>
    <div class="row" id="controls"><button id="pause">Jeda</button><button id="resume">Lanjutkan</button><button id="stop">Hentikan</button><button id="retry">Coba ulang gagal</button></div>
    <button id="export">Ekspor Excel / backup</button><div class="notice" id="notice">Mulai dengan Cek data halaman. Pilot mengambil link maksimal 5 assignment OPEN yang sudah CAWI pada halaman pertama.</div>
    <button id="reset">Reset full</button><div class="notice hidden" id="resetConfirm">Reset full menghapus semua progres, link, hasil, koneksi server dan pengaturan lokal ekstensi. Hasil tertunda harus disinkronkan dahulu. Unduh Excel/backup jika diperlukan. Data pusat dan FASIH tetap tersedia.<div class="row"><button id="resetCancel">Batal</button><button id="resetApply">Hapus semua data lokal</button></div></div>
    <div class="muted">Biarkan tab ini aktif saat berjalan. Progres disimpan lokal pada ekstensi. Setelah reload yang tidak direncanakan, tekan Lanjutkan.</div>
    </div></section>`;
  document.documentElement.appendChild(host);
  const $=id=>shadow.getElementById(id);
  const send=async message=> {
    const response=await chrome.runtime.sendMessage(message);
    if(!response?.ok) throw new Error(response?.error||'Koneksi penyimpanan ekstensi terputus.');
    return response.value;
  };
  const adapter=new F.Adapter();
  let loaded=null, busy=false, resetting=false, activity='';
  function show(value) { $('notice').textContent=value; }
  function showDiagnostic(value) { $('diagnostics').textContent=value; $('diagnostics').classList.remove('hidden'); }
  adapter.onActivity=value=>{activity=value;if(value)show(value);};
  function update({job,counts}) {
    loaded={job,rows:[...runner.records?.values()||[]],owned:true};
    for(const name of ['total','done','error']) $(name).textContent=counts[name].toLocaleString('id');
    $('bar').style.width=(job.phase==='INVENTORY'?counts.total?25:0:counts.total?100*(counts.done+counts.skipped)/counts.total:0)+'%';
    $('state').textContent=`${F.phaseLabel(job.phase)} · ${F.statusLabel(job.status)} · ${counts.skipped} dilewati · ${counts.pending} tertunda`;
    const working=job.status==='RUNNING'&&job.phase==='PROCESS';
    $('panel').classList.toggle('working',working);
    host.style.right=working?'auto':'16px';host.style.left=working?'16px':'auto';host.style.top=working?'16px':'126px';
    const lastFailure=job.lastFailure||loaded.rows.filter(r=>r.result==='ERROR').at(-1)?.error;
    if(job.notice) show(job.notice+(lastFailure&&!job.notice.includes(lastFailure)?'\nKegagalan terakhir: '+lastFailure:''));
    else show(activity||(job.phase==='INVENTORY'?`Mengambil kartu list. Halaman ${F.context(location.href).page}.`:`Mengambil unique link halaman ${F.context(location.href).page}.`));
    const active=runner.running||busy||resetting;
    for(const id of ['pilot','all','resume','retry','region','prefix','linkHost','diagnose','actionDelay','nextDelay','saveTiming','serverConfig','serverInventory','serverStart','serverSync']) $(id).disabled=active;
    $('export').disabled=!job;
  }
  const runner=new (F.ServerRunner||F.Runner)(adapter,send,update);
  function prefixValue() {
    const prefix=$('prefix').value.trim();
    if(!/^\d{2,16}$/.test(prefix)) throw new Error('Isi awalan kode wilayah, minimal 2 digit.');
    return prefix;
  }
  function options(pilot) {
    const prefix=prefixValue(), linkHost=$('linkHost').value.trim().toLowerCase();
    if(!/^[a-z0-9.-]+\.bps\.go\.id$/.test(linkHost)) throw new Error('Domain link harus merupakan subdomain bps.go.id.');
    return {region:$('region').value==='Palu'?'Kota Palu':'Sulawesi Tengah',prefix,linkHost,pilot,limit:pilot?5:0,...timingValues()};
  }
  function timingValues() {
    if(!$('actionDelay').value.trim()||!$('nextDelay').value.trim())throw new Error('Isi kedua jeda dalam detik.');
    return F.timings({actionDelayMs:Number($('actionDelay').value)*1000,nextDelayMs:Number($('nextDelay').value)*1000});
  }
  function restoreTiming(value={}) { const t=F.timings(value);$('actionDelay').value=(t.actionDelayMs/1000).toFixed(2);$('nextDelay').value=(t.nextDelayMs/1000).toFixed(2); }
  function restoreOptions(job) {
    $('region').value=job.options.region==='Kota Palu'?'Palu':'Sulteng';
    $('prefix').value=job.options.prefix; $('linkHost').value=job.options.linkHost;
  }
  async function readLatest() {
    const id=await send({type:'LATEST'});
    if(!id) return null;
    return send({type:'READ',id});
  }
  async function launch(pilot) {
    if(runner.running) return;
    const opts=options(pilot);
    // A launch from table routes to list before reading or processing assignments.
    if(F.context(location.href).view==='list') {
      await adapter.ready(opts.prefix);
      if(adapter.dialogs().length) throw new Error('Tutup popup FASIH dahulu.');
    }
    await send({type:'SET_SETTINGS',settings:F.timings(opts)});
    const job=await send({type:'CREATE',options:opts});
    await runner.start(job);
  }
  async function resume(retry=false) {
    const timing=timingValues();
    const data=await readLatest();
    if(!data) throw new Error('Belum ada progres tersimpan.');
    restoreOptions(data.job);
    await send({type:'SET_SETTINGS',settings:timing});
    let job=await send({type:'CLAIM',id:data.job.id});
    job=await send({type:'PATCH',id:job.id,patch:{options:{...job.options,...timing}}});
    await runner.resume(job,data.rows,retry);
  }
  function run(action, feedback=show) { return async()=> {
    if(busy||resetting) return; busy=true;
    let error='';
    try { await action(); } catch(e) { error=e.message; }
    finally {
      busy=false;
      if(loaded) update({job:loaded.job,counts:F.totals(loaded.rows)});
      if(error)feedback(error);
    }
  }; }
  $('region').onchange=()=>{$('prefix').value=$('region').value==='Palu'?'7271':'72';};
  $('diagnose').onclick=run(async()=> {
    showDiagnostic('Memeriksa data halaman…');
    const result=adapter.diagnose(prefixValue());
    showDiagnostic(`Hasil cek halaman ${F.context(location.href).page}\nTampilan: ${result.view}\nKartu terbaca: ${result.rows}\nOPEN: ${result.open}\nOPEN dan CAWI: ${result.cawiOpen}\nStatus sumber: ${Object.entries(result.statuses).map(([s,n])=>s+': '+n).join(', ')}\nKolom: ${result.columns.length}\nNext dikenali: ${result.next?'ya':'tidak'}\n${result.ready?'Kartu list siap diproses. Popup akan diuji pada pilot.':result.issue}\nKolom opsional tidak tampil: ${result.missing.join(', ')||'tidak ada'}. Boleh kosong.\nCek selesai. Untuk mengambil link, klik Pilot 5 data atau Mulai seluruh data.`);
  },showDiagnostic);
  $('pilot').onclick=run(()=>launch(true)); $('all').onclick=run(()=>launch(false));
  $('saveTiming').onclick=run(async()=>{await send({type:'SET_SETTINGS',settings:timingValues()});showDiagnostic('Jeda tersimpan. Berlaku saat mulai, lanjutkan, atau coba ulang gagal.');});
  $('serverConfig').onclick=run(()=>send({type:'OPEN_SERVER_CONFIG'}));
  $('serverSync').onclick=run(async()=>{const r=await send({type:'REMOTE_FLUSH'});showDiagnostic(r.synced+' hasil tersinkron ke server.');});
  async function launchServer(mode){
    const info=await send({type:'REMOTE_INFO'});
    if(mode==='INVENTORY'&&info.worker.role!=='COORDINATOR')throw new Error('Inventaris awal memakai token Koordinator.');
    const opts={region:info.campaign.name,prefix:info.campaign.prefix,linkHost:info.campaign.linkHost,pilot:false,limit:0,...timingValues(),server:{mode,campaignId:info.campaign.id,workerId:info.worker.id,generation:info.campaign.generation}};
    if(F.context(location.href).signature!==F.context(info.campaign.sourceUrl).signature)throw new Error('URL/pencarian berbeda dari proyek dashboard. Buka URL proyek, gunakan 100 kartu, dan filter yang sesuai.');
    const prior=await readLatest();
    if(prior?.job.options.server&&prior.job.phase!=='FINISHED'&&prior.job.status!=='COMPLETE')throw new Error('Proses server sebelumnya belum selesai. Gunakan Lanjutkan/Coba ulang gagal untuk mempertahankan kepemilikan tugas.');
    await send({type:'SET_SETTINGS',settings:F.timings(opts)});
    const job=await send({type:'CREATE',options:opts});await runner.start(job);
  }
  $('serverInventory').onclick=run(()=>launchServer('INVENTORY'));$('serverStart').onclick=run(()=>launchServer('WORK'));
  async function refreshServer(){
    try{const c=await send({type:'GET_SERVER_SETTINGS'});if(!c){$('serverState').textContent='Mode lokal · server belum dihubungkan.';return;}
      if(runner.running){$('serverState').textContent=c.workerName+' · '+c.campaignName+' · '+c.outboxCount+' hasil belum tersinkron.';return;}
      const info=await send({type:'REMOTE_INFO'}),n=info.counts;
      $('serverState').textContent=info.worker.name+' · '+info.campaign.name+'\nPusat: '+n.done+'/'+n.total+' selesai · '+n.error+' gagal · '+n.review+' perlu pemeriksaan · '+c.outboxCount+' belum tersinkron.';
    }catch(e){$('serverState').textContent='Server: '+e.message;}
  }
  // Read-only status polling; no assignment actions occur here.
  if(F.ServerRunner){refreshServer();setInterval(()=>{if(!document.hidden&&!resetting)refreshServer();},15000);}
  function clearLocal() {
    loaded=null;runner.job=null;runner.records=new Map();runner.control=null;activity='';
    $('region').value='Palu';$('prefix').value='7271';$('linkHost').value='esurvey.bps.go.id';restoreTiming();
    for(const id of ['total','done','error'])$(id).textContent='0';
    $('bar').style.width='0%';$('state').textContent='Belum ada proses.';
    $('diagnostics').textContent='';$('diagnostics').classList.add('hidden');$('resetConfirm').classList.add('hidden');
    $('panel').classList.remove('working');host.style.right='16px';host.style.left='auto';host.style.top='126px';
    for(const id of ['pilot','all','resume','retry','region','prefix','linkHost','diagnose','actionDelay','nextDelay','saveTiming','serverConfig','serverInventory','serverStart','serverSync'])$(id).disabled=false;
    $('serverState').textContent='Mode lokal · server belum dihubungkan.';
    $('export').disabled=true;show('Reset full selesai. Semua data lokal dihapus; jeda kembali ke 0,50 dan 1,00 detik.');
  }
  $('reset').onclick=()=>{$('resetConfirm').classList.remove('hidden');$('resetConfirm').scrollIntoView?.({block:'nearest'});};
  $('resetCancel').onclick=()=>$('resetConfirm').classList.add('hidden');
  $('resetApply').onclick=async()=>{
    if(resetting)return;
    if(busy&&!runner.running){show('Tunggu pemeriksaan/aksi panel selesai, lalu klik reset kembali.');return;}
    resetting=true;$('resetApply').disabled=true;
    try{
      if(runner.running){runner.pause(true);show('Menunggu proses berhenti sebelum reset…');while(runner.running)await new Promise(r=>setTimeout(r,100));}
      await send({type:'RESET_ALL'});clearLocal();
    }catch(e){show(e.message);}
    finally{resetting=false;$('resetApply').disabled=false;}
  };
  async function control(stop) {
    if(runner.running) {runner.pause(stop);show(stop?'Hentikan diminta. Hasil yang tersimpan tetap tersedia.':'Jeda diminta. Menunggu tindakan aktif selesai/diverifikasi.');return;}
    if(!loaded?.job)return;
    try {const job=await send({type:'PATCH',id:loaded.job.id,patch:{status:stop?'STOPPED':'PAUSED',navigating:null}});update({job,counts:F.totals(loaded.rows)});}catch(e){show(e.message);}
  }
  $('pause').onclick=()=>control(false);
  $('stop').onclick=()=>control(true);
  $('resume').onclick=run(()=>resume(false)); $('retry').onclick=run(()=>resume(true));
  $('export').onclick=async()=>{try {const data=await readLatest();if(!data)throw new Error('Belum ada hasil.');await send({type:'EXPORT',id:data.job.id});}catch(e){show(e.message);}};
  function toggle() { $('panel').classList.toggle('hidden'); $('mini').classList.toggle('hidden'); }
  $('hide').onclick=toggle; $('mini').onclick=toggle;
  chrome.runtime.onMessage.addListener(msg=>{if(msg.type==='TOGGLE_PANEL')toggle();if(msg.type==='RESET_LOCAL'&&!runner.running)clearLocal();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&runner.running){runner.pause();show('Tab tidak aktif. Proses akan dijeda setelah tindakan aktif selesai.');}});
  (async()=> {
    try {
      const settings=await send({type:'GET_SETTINGS'});
      const data=await readLatest(); if(!data){restoreTiming(settings||{});$('export').disabled=true;return;}
      loaded=data; restoreOptions(data.job);
      restoreTiming(settings||data.job.options);
      runner.job=data.job; runner.records=new Map(data.rows.map(r=>[r.key,r]));
      update({job:data.job,counts:F.totals(data.rows)});
      const nav=data.job.navigating;
      if(data.owned && data.job.status==='RUNNING' && nav?.url===location.href && Date.now()-nav.at<120000) {
        await runner.start(data.job,data.rows);
      } else if(data.owned && data.job.status==='RUNNING') {
        const job=await send({type:'PATCH',id:data.job.id,patch:{status:'PAUSED',navigating:null,notice:'Halaman dimuat ulang. Aktifkan tab dan tekan Lanjutkan untuk memeriksa hasil aktual.'}});
        update({job,counts:F.totals(data.rows)});
      }
    } catch(e) { show(e.message); }
  })();
})();
