(function(root){
  'use strict';const F=root.Fasih;
  class TerritoryRunner extends F.ServerRunner {
    isTerritory(job=this.job){return job?.options.server?.territoryMode===true;}
    guard(){
      if(!this.isTerritory())return super.guard();
      if(this.control)throw new F.BotError('Proses wilayah dijeda.','CONTROL',true);
      if(this.adapter.doc.hidden)throw new F.BotError('Aktifkan tab FASIH untuk melanjutkan.','CONTROL',true);
      const ctx=F.context(this.adapter.location.href);
      if(ctx.scope!==this.job.context.scope||ctx.view!=='list')throw new F.BotError('Survei/tampilan berubah.','CONTEXT',true);
      if(this.pack&&Date.now()>=this.deadline)throw new F.BotError('Kunci wilayah kedaluwarsa.','REMOTE_LEASE',true);
      if(this.transition)return;
      if(this.job.activeContext&&ctx.signature!==this.job.activeContext.signature)throw new F.BotError('Pencarian atau parameter halaman wilayah berubah.','CONTEXT',true);
      if(this.adapter.filterPanel())throw new F.BotError('Sidebar filter dibuka saat ekstraksi/inventaris. Jeda untuk memeriksa filter.','FILTER',true);
      if(this.job.phase==='PROCESS'&&this.pack){
        if(ctx.page!==this.pack.localPage||this.adapter.pageSignature()!==[...this.pack.keys].sort().join('|'))throw new F.BotError('Kartu pada filter wilayah berbeda dari inventaris.','INVENTORY',true);
      }
    }
    async start(job,rows=[]){
      if(!this.isTerritory(job))return super.start(job,rows);
      if(this.running)throw new Error('Runner sudah berjalan.');
      this.running=true;this.control=null;this.job=job;this.records=new Map(rows.map(r=>[r.key,r]));this.pack=null;this.transition=true;this.emit();
      try {
        const timing=F.timings(job.options);this.adapter.actionDelayMs=timing.actionDelayMs;this.nextDelayMs=timing.nextDelayMs;
        const View=this.adapter.doc.defaultView;if(View?.MutationObserver){this.filterObserver=new View.MutationObserver(()=>{if(!this.transition&&this.adapter.filterPanel())this.pause();});this.filterObserver.observe(this.adapter.doc.body,{childList:true,subtree:true});}
        const info=await this.send({type:'REMOTE_INFO'}),s=job.options.server;
        if(info.campaign.id!==s.campaignId||info.campaign.generation!==s.generation||info.worker.id!==s.workerId||info.campaign.inventoryMode!=='TERRITORY')throw new F.BotError('Generasi/mode proyek berubah. Mulai sesi wilayah baru; data lama tetap di server.','REMOTE_PROJECT',true);
        const actual=new URL(this.adapter.location.href),expected=new URL(info.campaign.sourceUrl);for(const [key,value] of expected.searchParams){if(['page','view'].includes(key))continue;if((actual.searchParams.get(key)||'')!==value)throw new F.BotError('Pencarian/parameter '+key+' berbeda dari URL proyek. Klik Buka URL proyek dahulu.','CONTEXT',true);}
        this.adapter.expectedNonGeoStamp=info.campaign.filterStamp;
        await this.send({type:'REMOTE_FLUSH'});
        if(s.mode==='INVENTORY')await this.inventoryTerritories(info);else await this.extractTerritories(info);
      } catch(e) {
        try{await this.adapter.cleanup();const panel=this.adapter.filterPanel();if(panel){this.transition=true;await this.adapter.closeFilter(panel);}}catch{}
        await this.patch({status:this.control==='STOPPED'?'STOPPED':'PAUSED',navigating:null,notice:e.message+'\nCheckpoint wilayah dan hasil lokal dipertahankan. Tekan Lanjutkan setelah diperiksa.'});
      } finally {this.filterObserver?.disconnect();clearInterval(this.beatTimer);this.beatTimer=null;this.running=false;this.transition=false;this.emit();}
    }
    async discover(){
      const a=this.adapter,rootRecipe=[{level:'PROVINSI',code:'72',name:'SULAWESI TENGAH',value:'72 SULAWESI TENGAH'},{level:'KABUPATEN/KOTA',code:'71',name:'PALU',value:'71 PALU'}];
      let panel=await a.openFilter();for(const r of rootRecipe)await a.selectRegion(panel,r);
      const stamp=a.nonTerritoryStamp(panel);if(a.expectedNonGeoStamp!=null&&a.expectedNonGeoStamp!==stamp)throw new F.BotError('Filter non-wilayah berbeda dari checkpoint inventaris.','FILTER',true);a.expectedNonGeoStamp=stamp;await this.remote('geo_filter_stamp',{filterStamp:stamp});
      const districts=await a.enumerate(panel,'KECAMATAN');
      if(!districts.length)throw new F.BotError('Pilihan kecamatan Kota Palu kosong.','CATALOG',true);
      const recipes=[],saved=this.job.geoDiscovery;
      const signature=JSON.stringify(districts);
      if(saved&&saved.signature!==signature)throw new F.BotError('Daftar kecamatan berubah sejak checkpoint.','CATALOG',true);
      if(saved?.recipes)recipes.push(...saved.recipes);
      for(let i=saved?.next||0;i<districts.length;i++) {
        this.guard();this.adapter.onActivity('Menemukan desa: '+districts[i].name+' ('+(i+1)+'/'+districts.length+')');
        await a.selectRegion(panel,districts[i]);await a.clearRegion(panel,'DESA');
        const villages=await a.enumerate(panel,'DESA');
        const paths=villages.length?villages.map(v=>[...rootRecipe,districts[i],v]):[[...rootRecipe,districts[i]]];
        recipes.push(...paths);await this.remote('geo_catalog',{recipes:paths,complete:false});
        await this.patch({geoDiscovery:{signature,next:i+1,recipes},notice:'Master wilayah: '+recipes.length+' filter daun ditemukan.'});
      }
      await a.closeFilter(panel);
      return (await this.remote('geo_catalog',{recipes,complete:true})).partitions;
    }
    async goPage(page){
      let current=F.context(this.adapter.location.href).page;
      if(current>page){const first=this.adapter.all('button[aria-label="Go to first page"]');if(first.length===1&&!first[0].disabled){await this.adapter.pace();first[0].click();await this.adapter.waitUi(()=>F.context(this.adapter.location.href).page===1,'retour halaman pertama');current=1;}}
      if(current<page){while(current<page){const next=new URL(this.adapter.location.href);next.searchParams.set('page',String(current+1));await this.patch({navigating:{url:next.href,at:Date.now()}});await this.adapter.nextPage();current++;}await this.patch({navigating:null});return false;}
      const url=new URL(this.adapter.location.href);url.searchParams.set('page',String(page));url.searchParams.set('perPage','100');url.searchParams.set('view','list');
      if(this.adapter.location.href===url.href)return false;
      await this.patch({navigating:{url:url.href,at:Date.now()}});this.adapter.location.assign(url.href);return true;
    }
    async inventoryTerritories(info){
      await this.patch({phase:'INVENTORY',operation:'EXTRACT_LINK',processingView:'list'});
      const begin=await this.remote('geo_begin',{url:info.campaign.sourceUrl});
      if(begin.finished){await this.patch({phase:'FINISHED',status:'COMPLETE',inventoryComplete:true,navigating:null,notice:'Inventaris wilayah sudah lengkap di server.'});return;}
      let parts=begin.catalogComplete?begin.partitions:await this.discover();
      for(let index=0;index<parts.length;index++) {
        const part=parts[index];if(part.state!=='NEW')continue;
        this.transition=true;this.guard();
        await this.adapter.applyRecipe(part.recipe,this.job.options.prefix);
        let scan=this.job.geoScan?.id===part.id?this.job.geoScan:{id:part.id,pages:{},cursor:1};
        await this.patch({geoScan:scan,activeRecipe:part.recipe,notice:'Inventaris '+part.recipe.map(r=>r.name).join(' → ')});
        if(F.context(this.adapter.location.href).page!==scan.cursor&&await this.goPage(scan.cursor))return;
        await this.adapter.verifyActive(part.recipe);await this.patch({activeContext:F.context(this.adapter.location.href),navigating:null});this.transition=false;
        let boundary='';
        while(true) {
          this.guard();const local=F.context(this.adapter.location.href).page;
          const rows=this.adapter.readRows();if(!rows.length){if(!this.adapter.emptyPage())throw new F.BotError('Hasil filter belum siap.','UI',true);boundary='EMPTY_PAGE';break;}
          F.checkRows(rows,this.job.options.prefix,false);
          const snapshot=rows.map(r=>({key:F.key(r.fields['Kode Identitas']),fields:{...r.fields}}));
          const old=scan.pages[local];if(old&&JSON.stringify(old.map(r=>r.key))!==JSON.stringify(snapshot.map(r=>r.key)))throw new F.BotError('Halaman wilayah berubah saat resume.','INVENTORY',true);
          const other=new Set(Object.entries(scan.pages).filter(([p])=>Number(p)!==local).flatMap(([,rs])=>rs.map(r=>r.key)));
          if(snapshot.some(r=>other.has(r.key)))throw new F.BotError('Pagination wilayah mengulang identitas halaman lain.','PAGINATION',true);
          scan={...scan,pages:{...scan.pages,[local]:snapshot}};
          const count=Object.values(scan.pages).reduce((n,rs)=>n+rs.length,0);
          await this.patch({geoScan:scan,notice:'Inventaris '+part.recipe.at(-1).name+' · '+count+' kartu · halaman '+local});
          if(count>=1000){boundary='CAP_1000';break;}
          if(this.adapter.lastPage()){boundary='NEXT_DISABLED';break;}
          scan={...scan,cursor:local+1};const nextUrl=new URL(this.adapter.location.href);nextUrl.searchParams.set('page',String(local+1));
          await this.patch({geoScan:scan,navigating:{url:nextUrl.href,at:Date.now()}});
          const moved=await this.adapter.nextPage(true);await this.patch({navigating:null});
          if(moved?.empty){boundary='EMPTY_PAGE';break;}
          await this.adapter.ready(this.job.options.prefix);
        }
        this.transition=true;
        if(boundary==='CAP_1000') {
          const level=F.territoryLevels[part.recipe.length];
          if(!level)throw new F.BotError('SUBSLS '+part.recipe.at(-1).name+' masih mencapai 1.000. Perlu pemecahan tambahan/manual.','CAP',true);
          const panel=await this.adapter.openFilter(),children=await this.adapter.enumerate(panel,level);await this.adapter.closeFilter(panel);
          if(!children.length)throw new F.BotError('Wilayah mencapai 1.000 tetapi pilihan '+level+' kosong.','CAP',true);
          parts=(await this.remote('geo_split',{partitionId:part.id,sampleKeys:Object.values(scan.pages).flatMap(rs=>rs.map(r=>r.key)),recipes:children.map(r=>[...part.recipe,r])})).partitions;
          await this.patch({geoScan:null,notice:'Wilayah dipecah ke '+level+' karena batas 1.000.'});index=-1;continue;
        }
        const records=[];
        for(const [page,snapshot] of Object.entries(scan.pages)) {
          await this.remote('geo_page',{partitionId:part.id,localPage:Number(page),rows:snapshot});
          for(const r of snapshot) {
            const prior=this.records.get(r.key),fields={...r.fields};for(const territory of part.recipe)fields[territory.level]=territory.code+' '+territory.name;
            records.push(prior||{...r,fields,partitionId:part.id,localPage:Number(page),page:Number(page),initialMode:fields.Mode,result:F.isOpen(fields.Status)&&F.mode(fields.Mode)==='CAWI'?'PENDING':'SKIPPED',stage:'DATA_TERSIMPAN',attempts:0,capturedAt:new Date().toISOString()});
          }
        }
        if(records.length){await this.send({type:'ROWS',id:this.job.id,rows:records});for(const r of records)this.records.set(r.key,r);}
        await this.remote('geo_finish_partition',{partitionId:part.id,lastPage:Object.keys(scan.pages).length,boundary});
        await this.patch({geoScan:null,notice:'Wilayah '+part.recipe.at(-1).name+' terverifikasi.'});
      }
      await this.remote('geo_finish');await this.patch({phase:'FINISHED',status:'COMPLETE',inventoryComplete:true,navigating:null,notice:'Inventaris seluruh wilayah terverifikasi. Kelima komputer dapat menekan Mulai tugas server.'});
    }
    startHeartbeat(){
      clearInterval(this.beatTimer);let busy=false;
      this.beatTimer=setInterval(async()=>{if(busy||!this.pack)return;busy=true;try{const reply=await this.remote('heartbeat',{page:this.pack.page,claimToken:this.pack.claimToken,activity:this.pack.recipe.map(r=>r.name).join(' / ')});this.deadline=Date.now()+Math.max(0,reply.leaseSeconds-10)*1000;if(reply.paused)this.pause();}catch{this.pause();}finally{busy=false;}},15000);
    }
    async extractTerritories(info){
      if(this.job.options.server.retry){await this.remote('retry_own');await this.patch({options:{...this.job.options,server:{...this.job.options.server,retry:false}}});}
      await this.patch({phase:'PROCESS',processingView:'list'});
      while(true) {
        this.transition=true;this.guard();this.pack=await this.remote('geo_claim');
        if(this.pack.empty){const c=this.pack.counts;this.pack=null;await this.patch({phase:'FINISHED',status:c.pending||c.running||c.error||c.review?'NEEDS_ATTENTION':'COMPLETE',remoteClaim:null,navigating:null,notice:'Tidak ada wilayah siap untuk komputer ini. Periksa progres seluruh komputer di dashboard.'});return;}
        this.deadline=Date.now()+Math.max(0,this.pack.leaseSeconds-10)*1000;this.startHeartbeat();
        await this.patch({remoteClaim:{page:this.pack.page,claimToken:this.pack.claimToken,partitionId:this.pack.partitionId},activeRecipe:this.pack.recipe});
        await this.adapter.applyRecipe(this.pack.recipe,this.job.options.prefix);
        if(F.context(this.adapter.location.href).page!==this.pack.localPage&&await this.goPage(this.pack.localPage))return;
        await this.adapter.verifyActive(this.pack.recipe);await this.adapter.ready(this.job.options.prefix);await this.adapter.cleanup();
        await this.patch({activeContext:F.context(this.adapter.location.href),navigating:null});this.transition=false;this.guard();
        for(const serverRow of this.pack.rows) {
          this.guard();const local=this.records.get(serverRow.key);let record={...serverRow,page:this.pack.localPage};
          if(local&&F.validLink(local.link,this.job.options.linkHost)&&!record.link){record={...record,...local,fields:{...record.fields,...local.fields},partitionId:this.pack.partitionId,localPage:this.pack.localPage};await this.save(record);}
          this.records.set(record.key,record);if(record.result!=='PENDING')continue;
          const begun=await this.remote('begin_record',{page:this.pack.page,claimToken:this.pack.claimToken,key:record.key});
          if(begun.skip){this.records.set(record.key,begun.row);continue;}
          this.deadline=Date.now()+Math.max(0,begun.leaseSeconds-10)*1000;
          await this.processRecord(record);await this.sleep(this.nextDelayMs);
        }
        this.guard();await this.remote('close_page',{page:this.pack.page,claimToken:this.pack.claimToken,complete:true});
        clearInterval(this.beatTimer);this.beatTimer=null;this.pack=null;await this.patch({remoteClaim:null,notice:'Halaman wilayah selesai. Melanjutkan paket wilayah yang sama atau wilayah berikutnya.'});
      }
    }
    async resume(job,records,retry=false){
      if(!this.isTerritory(job))return super.resume(job,records,retry);
      if(job.options.server.mode==='INVENTORY'&&job.phase==='FINISHED')throw new Error('Inventaris lengkap. Gunakan Mulai tugas server.');
      job=await this.send({type:'PATCH',id:job.id,patch:{status:'RUNNING',notice:'',options:{...job.options,server:{...job.options.server,retry}}}});return this.start(job,records);
    }
  }
  F.TerritoryRunner=TerritoryRunner;
})(globalThis);
