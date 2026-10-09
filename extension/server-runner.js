(function(root){
  'use strict';const F=root.Fasih;
  class ServerRunner extends F.Runner {
    remote(action,data={}){return this.send({type:'REMOTE',id:this.job.id,action,data});}
    async inventoryStart(){
      if(this.job.options.server?.mode!=='INVENTORY')return;
      const info=await this.send({type:'REMOTE_INFO'}),s=this.job.options.server;
      if(info.worker.id!==s.workerId||info.campaign.id!==s.campaignId||info.campaign.generation!==s.generation)throw new F.BotError('Inventaris lama tidak cocok dengan generasi proyek server. Mulai inventaris baru setelah Reset lokal.','REMOTE_PROJECT',true);
      await this.remote('import_begin',{url:this.job.context.url,prefix:this.job.options.prefix,filterStamp:this.adapter.filterStamp()});
    }
    async inventoryUploaded(page,rows){
      if(this.job.options.server?.mode!=='INVENTORY')return;
      await this.remote('import_page',{page,rows:rows.map(r=>({key:F.key(r.fields['Kode Identitas']),fields:r.fields}))});
    }
    async inventoryFinish(){
      if(this.job.options.server?.mode!=='INVENTORY')return false;
      await this.remote('import_finish',{lastPage:Math.max(...Object.keys(this.job.pages).map(Number))});
      await this.patch({phase:'FINISHED',status:'COMPLETE',inventoryComplete:true,navigating:null,notice:'Inventaris server lengkap. Kelima komputer dapat mulai mengambil paket tugas.'});return true;
    }
    guard(){
      super.guard();
      if(this.job?.options.server?.mode==='WORK'&&this.pack&&Date.now()>=this.deadline)throw new F.BotError('Kunci server kedaluwarsa; tindakan dihentikan. Lanjutkan untuk pemulihan.','REMOTE_LEASE',true);
    }
    async save(record){
      await super.save(record);
      if(this.job.options.server?.mode==='WORK'&&this.pack)await this.remote('checkpoint',{page:this.pack.page,claimToken:this.pack.claimToken,record});
    }
    async start(job,rows=[]){
      if(job.options.server?.mode==='INVENTORY'&&job.phase!=='INVENTORY')throw new Error('Inventaris server sudah ditutup. Gunakan Mulai tugas server untuk ekstraksi.');
      if(job.options.server?.mode!=='WORK')return super.start(job,rows);
      if(this.running)throw new Error('Runner sudah berjalan.');
      this.running=true;this.control=null;this.job=job;this.records=new Map(rows.map(r=>[r.key,r]));this.pack=null;this.emit();
      let timer;
      try{
        const timing=F.timings(job.options);this.adapter.actionDelayMs=timing.actionDelayMs;this.nextDelayMs=timing.nextDelayMs;
        await this.send({type:'REMOTE_FLUSH'});
        const info=await this.send({type:'REMOTE_INFO'});
        if(info.worker.id!==job.options.server.workerId||info.campaign.id!==job.options.server.campaignId||info.campaign.generation!==job.options.server.generation)throw new F.BotError('Komputer/proyek/generasi server berubah. Buat proses server baru.','REMOTE_PROJECT',true);
        if(job.options.server.retry){await this.remote('retry_own');await this.patch({options:{...job.options,server:{...job.options.server,retry:false}}});}
        await this.patch({context:F.context(info.campaign.sourceUrl),phase:'PROCESS',filterStamp:info.campaign.filterStamp??'',processingView:'list'});
        while(true){
          if(this.control)throw new F.BotError('Proses server dijeda.','CONTROL',true);
          if(this.adapter.doc.hidden)throw new F.BotError('Aktifkan tab FASIH untuk mengambil tugas server.','CONTROL',true);
          this.pack=await this.remote('claim');
          if(this.pack.empty){
            const c=this.pack.counts;this.pack=null;
            await this.patch({phase:'FINISHED',status:c.error||c.review||c.running||c.pending?'NEEDS_ATTENTION':'COMPLETE',navigating:null,
              notice:'Tidak ada paket siap untuk komputer ini. Progres total lihat di dashboard.'+(c.error||c.review?' Ada data gagal/perlu pemeriksaan.':'')});return;
          }
          this.deadline=Date.now()+Math.max(0,this.pack.leaseSeconds-10)*1000;
          const target=new URL(info.campaign.sourceUrl);target.searchParams.set('page',String(this.pack.page));target.searchParams.set('view','list');target.searchParams.set('perPage','100');
          await this.patch({remoteClaim:{page:this.pack.page,claimToken:this.pack.claimToken},pages:{...this.job.pages,[this.pack.page]:this.pack.keys.join('|')}});
          if(this.adapter.location.href!==target.href){await this.patch({navigating:{url:target.href,at:Date.now()}});this.adapter.location.assign(target.href);return;}
          await this.adapter.ready(job.options.prefix);await this.adapter.cleanup();this.guard();
          if(this.job.navigating)await this.patch({navigating:null});
          let beatBusy=false;
          timer=setInterval(async()=>{
            if(beatBusy||!this.pack)return;beatBusy=true;
            try{const reply=await this.remote('heartbeat',{page:this.pack.page,claimToken:this.pack.claimToken,activity:'Halaman '+this.pack.page});
              this.deadline=Date.now()+Math.max(0,reply.leaseSeconds-10)*1000;if(reply.paused)this.pause();
            }catch{this.pause();}finally{beatBusy=false;}
          },15000);
          for(const serverRow of this.pack.rows){
            this.guard();
            const local=this.records.get(serverRow.key);
            let record={...serverRow,result:serverRow.result};
            // Recover a link persisted locally before a lost network acknowledgement.
            if(local&&F.validLink(local.link,job.options.linkHost)&&!record.link){record={...record,...local,fields:{...record.fields,...local.fields}};await this.save(record);}
            this.records.set(record.key,record);
            if(record.result!=='PENDING')continue;
            const begun=await this.remote('begin_record',{page:this.pack.page,claimToken:this.pack.claimToken,key:record.key});
            if(begun.skip){this.records.set(record.key,begun.row);continue;}
            this.deadline=Date.now()+Math.max(0,begun.leaseSeconds-10)*1000;
            await this.processRecord(record);await this.sleep(this.nextDelayMs);
          }
          clearInterval(timer);timer=null;
          this.guard();await this.remote('close_page',{page:this.pack.page,claimToken:this.pack.claimToken,complete:true});
          this.pack=null;await this.patch({remoteClaim:null,notice:'Paket selesai; meminta paket berikutnya.'});
        }
      }catch(e){
        try{await this.adapter.cleanup();}catch(cleanup){e=new Error(e.message+' '+cleanup.message);}
        await this.patch({status:this.control==='STOPPED'?'STOPPED':'PAUSED',navigating:null,notice:e.message+' Hasil lokal dan tugas server dipertahankan.'});
      }finally{if(timer)clearInterval(timer);this.running=false;this.emit();}
    }
    async resume(job,records,retry=false){
      if(job.options.server?.mode==='INVENTORY'&&job.phase==='FINISHED')throw new Error('Inventaris server sudah lengkap. Gunakan Mulai tugas server.');
      if(job.options.server?.mode!=='WORK')return super.resume(job,records,retry);
      job=await this.send({type:'PATCH',id:job.id,patch:{status:'RUNNING',phase:'PROCESS',notice:'',options:{...job.options,server:{...job.options.server,retry}}}});
      return this.start(job,records);
    }
  }
  F.ServerRunner=ServerRunner;if(typeof module!=='undefined')module.exports=ServerRunner;
})(globalThis);
