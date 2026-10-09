(function (root) {
  'use strict';
  const F=root.Fasih;
  class Runner {
    constructor(adapter, send, report=()=>{}) {
      this.adapter=adapter; this.send=send; this.report=report; this.running=false; this.control=null;
      this.adapter.beforeAction=()=>this.guard();
    }
    sleep(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }
    pause(stop=false) { this.control=stop?'STOPPED':'PAUSED'; }
    emit() { this.report({job:this.job,counts:F.totals([...this.records.values()])}); }
    async patch(patch) { this.job=await this.send({type:'PATCH',id:this.job.id,patch}); this.emit(); }
    async save(record) { await this.send({type:'ROWS',id:this.job.id,rows:[record]}); this.records.set(record.key,record); this.emit(); }
    guard() {
      if(this.control) throw new F.BotError(this.control==='STOPPED'?'Proses dihentikan.':'Proses dijeda.', 'CONTROL',true);
      if(this.adapter.doc.hidden) throw new F.BotError('Tab FASIH berada di latar. Aktifkan tab lalu lanjutkan.', 'CONTROL',true);
      const current=F.context(this.adapter.location.href);
      if(current.view!=='list')throw new F.BotError('Tampilan berubah. Gunakan view=list untuk melanjutkan.','VIEW',true);
      if(current.signature!==this.job.context.signature) throw new F.BotError('Survei, pencarian, atau ukuran halaman berubah.\nURL proses: '+this.job.context.url+'\nURL tab: '+current.url+'\nBuka URL proyek yang sesuai. Inventaris yang masih kosong dapat dipulihkan lewat Inventaris ke server.', 'CONTEXT',true);
      if(this.job.filterStamp!==undefined && this.adapter.filterStamp()!==this.job.filterStamp) throw new F.BotError('Filter halaman berubah.', 'FILTER',true);
      if(this.job.phase==='PROCESS' && this.job.pages[current.page]) {
        const expected=this.job.pages[current.page].split('|').sort().join('|');
        const actual=this.adapter.readRows().map(r=>F.key(r.fields['Kode Identitas'])).sort().join('|');
        if(expected!==actual) throw new F.BotError('Daftar assignment berubah dari inventaris. Periksa filter mode/status dan urutan tabel sebelum melanjutkan.','INVENTORY',true);
      }
    }
    async navigate(page) {
      const url=new URL(this.job.context.url); url.searchParams.set('page',String(page)); url.searchParams.set('view','list');
      url.searchParams.set('perPage','100');
      if(this.adapter.location.href===url.href) return false;
      await this.patch({navigating:{url:url.href,at:Date.now()}});
      this.adapter.location.assign(url.href); return true;
    }
    async next(allowEmpty=false) {
      this.guard();
      const page=F.context(this.adapter.location.href).page;
      const nextUrl=new URL(this.adapter.location.href); nextUrl.searchParams.set('page',String(page+1));
      await this.patch({navigating:{url:nextUrl.href,at:Date.now()}});
      const result=await this.adapter.nextPage(allowEmpty);
      await this.patch({navigating:null});
      return result;
    }
    canEndOnEmpty() {
      const page=F.context(this.adapter.location.href).page;
      const last=Math.max(0,...Object.keys(this.job.pages).map(Number));
      return this.job.phase==='INVENTORY' && !this.job.options.pilot && this.records.size>0 && last>0 && page===last+1;
    }
    async start(job, rows=[]) {
      if(this.running) throw new Error('Runner sudah berjalan.');
      this.running=true; this.control=null; this.job=job; this.records=new Map(rows.map(r=>[r.key,r])); this.emit();
      try {
        const timing=F.timings(this.job.options);
        this.adapter.actionDelayMs=timing.actionDelayMs;
        this.nextDelayMs=timing.nextDelayMs;
        // Inventory and link extraction use the list cards supplied by the user.
        if(F.context(this.adapter.location.href).view!=='list' || new URL(this.adapter.location.href).searchParams.get('perPage')!=='100' ||
          (this.job.phase==='INVENTORY'&&!this.job.visitPages.length&&F.context(this.adapter.location.href).page!==1)) {
          await this.navigate(1); return;
        }
        if(this.job.processingView!=='list'||this.job.operation!=='EXTRACT_LINK')await this.patch({processingView:'list',operation:'EXTRACT_LINK'});
        const initialRows=await this.adapter.ready(this.job.options.prefix,true,this.canEndOnEmpty());
        if(this.job.filterStamp===undefined) await this.patch({filterStamp:this.adapter.filterStamp()});
        if(this.job.navigating) await this.patch({navigating:null});
        await this.adapter.cleanup(); this.guard();
        if(this.job.phase==='INVENTORY') {
          if(this.inventoryStart)await this.inventoryStart();
          let endOnEmpty=initialRows.length===0;
          while(true) {
            if(endOnEmpty) {
              if(!this.canEndOnEmpty())throw new F.BotError('Halaman kosong tidak cocok dengan batas inventaris.','PAGINATION',true);
              this.guard();await this.patch({inventoryBoundary:'EMPTY_PAGE',emptyPage:F.context(this.adapter.location.href).page});break;
            }
            this.guard(); await this.inventoryPage();
            if(this.job.options.pilot || this.adapter.lastPage()) break;
            const moved=await this.next(true);
            endOnEmpty=Boolean(moved?.empty);
            if(!endOnEmpty)await this.adapter.ready(this.job.options.prefix);
          }
          if(this.inventoryFinish&&await this.inventoryFinish())return;
          await this.patch({phase:'PROCESS',inventoryComplete:!this.job.options.pilot,processPages:[],lastDataPage:Math.max(...Object.keys(this.job.pages).map(Number))});
          if(F.context(this.adapter.location.href).page!==1) { await this.navigate(1); return; }
        }
        while(true) {
          this.guard(); await this.processPage();
          if(this.job.options.pilot && this.job.attempted.length>=this.job.options.limit) break;
          const lastInventoryPage=this.job.lastDataPage||Math.max(0,...Object.keys(this.job.pages).map(Number));
          if(this.adapter.lastPage() || this.job.options.pilot || F.context(this.adapter.location.href).page>=lastInventoryPage) break;
          await this.next(); await this.adapter.ready(this.job.options.prefix);
        }
        if(!this.job.options.pilot) {
          for(const r of this.records.values()) if(r.result==='PENDING') {
            r.result='ERROR'; r.error='Assignment inventaris belum berhasil ditemukan/diproses pada traversal akhir.'; await this.save(r);
          }
        }
        const c=F.totals([...this.records.values()]);
        await this.patch({status:this.job.options.pilot?'PILOT_DONE':c.error||c.pending?'NEEDS_ATTENTION':'COMPLETE',
          phase:'FINISHED',finishedAt:new Date().toISOString(),navigating:null,
          notice:this.job.options.pilot?'Pilot selesai. Periksa hasil dan Excel sebelum memulai seluruh cakupan.':
            c.error||c.pending?'Ada data gagal/tertunda. Ekspor dan gunakan Coba ulang gagal.':
              c.done===0?'Tidak ada assignment OPEN yang diproses. Periksa status sumber dan filter.':'Semua target inventaris telah ditangani.'});
      } catch(error) {
        try {
          // A saved link remains available even if modal cleanup failed.
          await this.adapter.cleanup();
        } catch(cleanupError) { error=new F.BotError(error.message+' '+cleanupError.message,'DIALOG',true); }
        const notice=error.message+(error.code==='CONTROL'&&this.job.lastFailure?'\nKegagalan terakhir: '+this.job.lastFailure:'');
        await this.patch({status:this.control==='STOPPED'?'STOPPED':'PAUSED',notice,navigating:null});
      } finally { this.running=false; this.emit(); }
    }
    async inventoryPage() {
      const page=F.context(this.adapter.location.href).page, rows=await this.adapter.ready(this.job.options.prefix);
      const keys=rows.map(r=>F.key(r.fields['Kode Identitas'])), signature=keys.join('|');
      const old=this.job.pages[page];
      if(old && old!==signature) throw new F.BotError('Isi halaman inventaris berubah. Mulai inventaris baru setelah memeriksa filter.', 'INVENTORY',true);
      let records=[];
      if(!old) {
        const priorKeys=new Set([...this.records.keys()]);
        if(keys.some(k=>priorKeys.has(k))) throw new F.BotError('Assignment berulang di halaman berbeda. Pagination perlu diperiksa.', 'DUPLICATE',true);
        const capturedAt=new Date().toISOString();
        records=rows.map((row,i)=>({key:keys[i],fields:{...row.fields},initialMode:row.fields.Mode,
          capturedAt,page,stage:'DATA_TERSIMPAN',result:F.isOpen(row.fields.Status)?'PENDING':'SKIPPED',
          error:F.isOpen(row.fields.Status)?'':'Status bukan OPEN: '+row.fields.Status,attempts:0}));
      }
      this.job=await this.send({type:'CHECKPOINT',id:this.job.id,rows:records,
        patch:{pages:{...this.job.pages,[page]:signature},visitPages:[...new Set([...this.job.visitPages,page])]}});
      records.forEach(r=>this.records.set(r.key,r)); this.emit();
      if(this.inventoryUploaded)await this.inventoryUploaded(page,rows);
    }
    async processPage() {
      const page=F.context(this.adapter.location.href).page;
      if(this.job.processPages.includes(page)) throw new F.BotError('Halaman pemrosesan terulang. Proses dijeda untuk menghindari siklus.', 'PAGINATION',true);
      const rows=await this.adapter.ready(this.job.options.prefix);
      const keys=rows.map(r=>F.key(r.fields['Kode Identitas']));
      for(const key of keys) {
        this.guard();
        const record=this.records.get(key);
        if(!record) throw new F.BotError('Ada assignment baru di luar inventaris. Buat inventaris baru.', 'INVENTORY',true);
        if(record.result!=='PENDING' || this.job.attempted.includes(key)) continue;
        if(this.job.options.pilot && this.job.attempted.length>=this.job.options.limit) break;
        await this.processRecord(record);
        await this.patch({attempted:[...this.job.attempted,key]});
        await this.sleep(this.nextDelayMs);
      }
      await this.patch({processPages:[...this.job.processPages,page]});
    }
    async processRecord(record) {
      record.attempts++; record.error='';
      try {
        this.guard();
        let current=this.adapter.findRow(record.key);
        F.checkRows([current],this.job.options.prefix,false);
        if(!F.isOpen(current.fields.Status)) {
          record.result='SKIPPED'; record.error='Status berubah menjadi '+current.fields.Status; await this.save(record); return;
        }
        record.fields={...record.fields,...current.fields}; record.checkedAt=new Date().toISOString();
        await this.save(record);
        if(F.mode(current.fields.Mode)!=='CAWI')throw new F.BotError('Mode masih '+current.fields.Mode+'. Unique Link belum dapat diambil; periksa pembaruan dari pusat.','MODE');
        record.finalMode='CAWI';
        this.guard();
        if(F.validLink(record.link,this.job.options.linkHost)) {
          if([...this.records.values()].some(r=>r.key!==record.key&&r.link===record.link))throw new F.BotError('URL tersimpan identik dengan assignment lain.','LINK',true);
          record.stage='SELESAI';record.result='DONE';await this.save(record);return;
        }
        record.stage='LINK_DICOBA'; await this.save(record);
        const {link,dialog}=await this.adapter.getLink(record.key,this.job.options.linkHost);
        if([...this.records.values()].some(r=>r.key!==record.key&&r.link===link)) throw new F.BotError('URL identik dengan assignment berbeda. Periksa hasil.', 'LINK',true);
        record.link=link; record.linkAt=new Date().toISOString(); record.stage='LINK_TERSIMPAN'; await this.save(record);
        await this.adapter.closeDialog(dialog);
        record.stage='SELESAI'; record.result='DONE'; await this.save(record);
      } catch(error) {
        // An upload may have committed although its acknowledgement was lost.
        // Keep the locally persisted checkpoint intact for an idempotent resend.
        if(error.code?.startsWith('REMOTE'))throw error;
        record.error=error.message;
        record.result=error.code==='CONTROL'?'PENDING':'ERROR'; await this.save(record);
        if(error.code!=='CONTROL')await this.patch({lastFailure:error.message});
        // Do not blindly repeat link creation after an unknown outcome.
        await this.adapter.cleanup();
        if(error.fatal || error.code==='CONTROL') throw error;
      }
    }
    async resume(job, records, retry=false) {
      if(this.running) throw new Error('Jeda runner dahulu.');
      // Repair only the demonstrably false skips created by v0.1.0; never reset completed work or genuine non-OPEN skips.
      const repaired=records.filter(r=>r.result==='SKIPPED'&&r.stage==='DATA_TERSIMPAN'&&!(r.attempts>0)&&
        r.error==='Status bukan OPEN.'&&F.isOpen(r.fields.Status)).map(r=>({...r,result:'PENDING',error:'',recoveryNote:'Status open salah dilewati pada v0.1.0.',recoveredAt:new Date().toISOString()}));
      if(repaired.length) {
        await this.send({type:'ROWS',id:job.id,rows:repaired});
        const fixed=new Map(repaired.map(r=>[r.key,r]));records=records.map(r=>fixed.get(r.key)||r);
      }
      if(retry) {
        const failed=records.filter(r=>r.result==='ERROR').map(r=>({...r,result:'PENDING',error:''}));
        if(failed.length) await this.send({type:'ROWS',id:job.id,rows:failed});
        const reset=new Map(failed.map(r=>[r.key,r])); records=records.map(r=>reset.get(r.key)||r);
      }
      const patch={status:'RUNNING',notice:'',lastFailure:'',navigating:null,attempted:[],processPages:[],eligibilityVersion:2,
        recoveredFalseSkips:(job.recoveredFalseSkips||0)+repaired.length};
      if(job.phase==='FINISHED') patch.phase='PROCESS';
      job=await this.send({type:'PATCH',id:job.id,patch});
      // Start traversal at page 1 after a manual resume; completed rows are skipped by key.
      this.job=job; this.records=new Map(records.map(r=>[r.key,r]));
      if(job.phase==='PROCESS' && F.context(this.adapter.location.href).page!==1) {
        await this.navigate(1); return;
      }
      await this.start(job,records);
    }
  }
  F.Runner=Runner;
  if(typeof module!=='undefined') module.exports=Runner;
})(globalThis);
