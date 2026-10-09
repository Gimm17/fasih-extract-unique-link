'use strict';
importScripts('core.js', 'storage.js', 'remote.js');
let queue = Promise.resolve();
function isFasih(sender) {
  try { return sender.id === chrome.runtime.id && Boolean(sender.tab) && Boolean(Fasih.context(sender.url)); }
  catch { return false; }
}
async function handle(msg, sender) {
  const ownPage = sender.id === chrome.runtime.id && sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL('export.html');
  const configPage=sender.id===chrome.runtime.id&&sender.url?.split(/[?#]/)[0]===chrome.runtime.getURL('server.html');
  if (!isFasih(sender) && !ownPage&&!configPage) throw new Error('Pesan tidak berasal dari halaman FASIH/ekspor ekstensi.');
  if(msg.type==='GET_SERVER_SETTINGS') {
    const c=await FasihStore.metaGet('server');return c?{url:c.url,configured:true,workerName:c.workerName,campaignName:c.campaignName,outboxCount:(await FasihStore.outbox()).length}:null;
  }
  if(msg.type==='OPEN_SERVER_CONFIG'&&isFasih(sender)){await chrome.tabs.create({url:chrome.runtime.getURL('server.html')});return true;}
  if(msg.type==='SAVE_SERVER_SETTINGS'&&configPage){
    if((await FasihStore.outbox()).length)throw new Error('Sinkronkan hasil tertunda sebelum mengganti koneksi server.');
    if((await FasihStore.allJobs()).some(j=>j.status==='RUNNING'))throw new Error('Jeda/hentikan proses dahulu sebelum mengganti koneksi.');
    const url=FasihRemote.endpoint(msg.url),token=String(msg.token||'').trim();if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Token harus 64 karakter dari dashboard.');
    const info=await FasihRemote.request({url,token},'worker_info');
    await FasihStore.metaPut('server',{url,token,workerName:info.worker.name,campaignName:info.campaign.name});return info;
  }
  if(msg.type==='DISCONNECT_SERVER'&&configPage){
    if((await FasihStore.outbox()).length||(await FasihStore.allJobs()).some(j=>j.status==='RUNNING'))throw new Error('Hentikan proses dan sinkronkan hasil sebelum memutus koneksi.');
    await FasihStore.metaDelete('server');return true;
  }
  if(msg.type==='REMOTE_INFO'&&isFasih(sender))return FasihRemote.request(await FasihStore.metaGet('server'),'worker_info');
  if(msg.type==='REMOTE_FLUSH'&&isFasih(sender)){
    const config=await FasihStore.metaGet('server');let synced=0;
    for(const pending of await FasihStore.outbox()){
      if(!config||pending.url!==config.url||pending.workerTokenHash!==await tokenHash(config.token))throw new Error('Hasil tertunda terikat koneksi komputer sebelumnya. Pulihkan koneksi yang sama.');
      await FasihRemote.request(config,'checkpoint',pending.data);await FasihStore.metaDelete(pending.id);synced++;
    }return {synced};
  }
  if(configPage)throw new Error('Perintah pengaturan server tidak dikenal.');
  if (msg.type === 'LATEST') return FasihStore.latest(Fasih.context(sender.url).scope);
  if (msg.type === 'READ') {
    const job = await FasihStore.getJob(msg.id);
    if (!ownPage && job?.context.scope !== Fasih.context(sender.url).scope) throw new Error('Hasil berada pada survei lain.');
    return { job, rows: await FasihStore.getRows(msg.id), owned: job?.owner === sender.tab?.id };
  }
  if (ownPage) throw new Error('Halaman ekspor hanya dapat membaca hasil.');
  const ctx = Fasih.context(sender.url);
  if(msg.type==='GET_SETTINGS')return FasihStore.settings();
  if(msg.type==='SET_SETTINGS')return FasihStore.setSettings(Fasih.timings(msg.settings));
  if(msg.type==='RESET_ALL') {
    if((await FasihStore.outbox()).length)throw new Error('Ada hasil server belum tersinkron. Klik Sinkronkan hasil sebelum Reset lokal.');
    for(const active of (await FasihStore.allJobs()).filter(j=>j.status==='RUNNING')) {
      let tab;try{tab=await chrome.tabs.get(active.owner);}catch{/* Closed owner has no active runner. */}
      if(tab)throw new Error('Jeda/hentikan proses yang berjalan di tab lain sebelum Reset full.');
    }
    await FasihStore.reset();
    for(const tab of await chrome.tabs.query({url:'https://fasih-sm.bps.go.id/*'})) {
      try{await chrome.tabs.sendMessage(tab.id,{type:'RESET_LOCAL'});}catch{/* No panel in this tab. */}
    }
    return true;
  }
  if (msg.type === 'CREATE') {
    if(await FasihStore.metaGet('server')&&!msg.options?.server)throw new Error('Server terhubung. Gunakan Mulai tugas server agar pembagian pekerjaan tetap terkontrol.');
    const timing=Fasih.timings(msg.options);
    const priorId = await FasihStore.latest(ctx.scope);
    const prior = priorId && await FasihStore.getJob(priorId);
    if (prior?.status === 'RUNNING') throw new Error('Proses sebelumnya masih berjalan. Jeda/hentikan dahulu.');
    // FASIH can update its URL through history.pushState without reloading the
    // content-script document. Sender metadata can still carry the older query.
    const tab=await chrome.tabs.get(sender.tab.id),current=Fasih.context(tab.url);
    if(current.scope!==ctx.scope)throw new Error('Survei tab berubah. Muat ulang FASIH sebelum memulai proses.');
    const startUrl = new URL(current.url); startUrl.searchParams.set('perPage', '100'); startUrl.searchParams.set('view','list');
    const job = { id: crypto.randomUUID(), context: Fasih.context(startUrl.href), options: {...msg.options,...timing},
      status: 'RUNNING', phase: 'INVENTORY', owner: sender.tab.id, createdAt: new Date().toISOString(),
      pages: {}, visitPages: [], processPages: [], attempted: [], notice: '', navigating: null };
    return FasihStore.create(job);
  }
  if (msg.type === 'EXPORT') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('export.html') + '?job=' + encodeURIComponent(msg.id) });
    return true;
  }
  const job = await FasihStore.getJob(msg.id);
  if (!job || job.context.scope !== ctx.scope) throw new Error('Proses tidak cocok dengan survei aktif.');
  if (msg.type === 'CLAIM') {
    if(await FasihStore.metaGet('server')&&!job.options.server)throw new Error('Progres ini memakai mode lokal. Putuskan koneksi server sebelum melanjutkan mode lokal.');
    if (job.owner !== sender.tab.id) {
      let tab;
      try { tab = await chrome.tabs.get(job.owner); } catch { /* Previous tab is closed. */ }
      let sameScope=false;
      try {sameScope=Boolean(tab && Fasih.context(tab.url).scope===ctx.scope);}catch{/* Old tab id may have been reused by Chrome. */}
      if (sameScope && job.status === 'RUNNING') throw new Error('Proses dimiliki tab FASIH lain yang masih berjalan.');
      if (sameScope) throw new Error('Tutup tab pemilik proses sebelumnya dahulu agar dua tab tidak memproses data yang sama.');
    }
    return FasihStore.patchJob(job.id, { owner: sender.tab.id, status: 'RUNNING', navigating: null, notice: '' });
  }
  if (job.owner !== sender.tab.id) throw new Error('Hanya tab pemilik yang dapat mengubah progres.');
  if(msg.type==='REMOTE'){
    const actions=['import_begin','import_page','import_finish','claim','heartbeat','begin_record','checkpoint','close_page','retry_own'];
    if(!actions.includes(msg.action)||!job.options.server)throw new Error('Aksi server tidak diizinkan untuk proses ini.');
    const config=await FasihStore.metaGet('server');
    const data={...msg.data,session:job.id};
    if(msg.action==='checkpoint'){
      const outboxId='outbox:'+job.id+':'+data.record.key;
      await FasihStore.metaPut(outboxId,{url:config?.url,workerTokenHash:config?await tokenHash(config.token):'',data,jobId:job.id});
      const value=await FasihRemote.request(config,msg.action,data);await FasihStore.metaDelete(outboxId);return value;
    }
    return FasihRemote.request(config,msg.action,data);
  }
  if (msg.type === 'PATCH') return FasihStore.patchJob(job.id, msg.patch);
  if (msg.type === 'ROWS' || msg.type === 'CHECKPOINT') {
    if (!Array.isArray(msg.rows) || msg.rows.some(r => !r.key || Fasih.key(r.fields?.['Kode Identitas']) !== r.key)) {
      throw new Error('Identitas penyimpanan tidak valid.');
    }
    return msg.type === 'CHECKPOINT' ? FasihStore.checkpoint(job.id,msg.patch,msg.rows) : FasihStore.putRows(job.id, msg.rows);
  }
  throw new Error('Perintah tidak dikenal.');
}
async function tokenHash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg || typeof msg.type !== 'string') return false;
  queue = queue.catch(() => {}).then(() => handle(msg, sender));
  queue.then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_PANEL' }); }
  catch { await chrome.tabs.create({ url: chrome.runtime.getURL('help.html') }); }
});
