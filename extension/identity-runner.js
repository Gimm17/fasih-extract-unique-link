(function(root){
  'use strict';const F=root.Fasih;
  class IdentityRunner extends F.Runner {
    targetUrl(code,page=1){const url=new URL(this.job.context.url);url.searchParams.set('search',code);url.searchParams.set('page',String(page));url.searchParams.set('view','list');url.searchParams.set('perPage','100');return url.href;}
    guard(){
      if(this.control)throw new F.BotError(this.control==='STOPPED'?'Proses dihentikan.':'Proses dijeda.','CONTROL',true);
      if(this.adapter.doc.hidden)throw new F.BotError('Aktifkan tab FASIH lalu Lanjutkan.','CONTROL',true);
      const current=F.context(this.adapter.location.href),expected=F.context(this.targetUrl(this.activeCode,this.job.searchPage||1));
      if(current.signature!==expected.signature||current.page!==expected.page||current.view!=='list')throw new F.BotError('Pencarian atau survei berubah. Tekan Lanjutkan untuk mencari ulang kode target.','CONTEXT',true);
      if(this.job.filterStamp!==undefined&&this.adapter.filterStamp()!==this.job.filterStamp)throw new F.BotError('Filter FASIH berubah. Pulihkan filter awal sebelum Lanjutkan.','FILTER',true);
    }
    async start(job,rows=[]){
      if(this.running)throw new Error('Runner sudah berjalan.');
      this.running=true;this.control=null;this.job=job;this.records=new Map(rows.map(r=>[r.key,r]));this.emit();
      try{
        const timing=F.timings(job.options);this.adapter.actionDelayMs=timing.actionDelayMs;this.nextDelayMs=timing.nextDelayMs;
        const codes=job.options.identityList;
        if(!Array.isArray(codes)||!codes.length)throw new F.BotError('Daftar target tidak tersedia.','INPUT',true);
        if(F.context(this.adapter.location.href).scope!==job.context.scope)throw new F.BotError('Buka survei yang sama dengan daftar target.','CONTEXT',true);
        if(this.job.filterStamp===undefined)await this.patch({filterStamp:this.adapter.filterStamp()});
        else if(this.adapter.filterStamp()!==this.job.filterStamp)throw new F.BotError('Filter FASIH berubah. Pulihkan filter awal sebelum Lanjutkan.','FILTER',true);
        for(let i=this.job.targetCursor||0;i<codes.length;i++){
          this.activeCode=codes[i];let record=this.records.get(F.key(this.activeCode));
          if(!record)throw new F.BotError('Progres target tidak lengkap. Jangan mulai ulang sebelum mengekspor hasil.','STORAGE',true);
          if(record.result!=='PENDING')continue;
          if(this.control||this.adapter.doc.hidden)throw new F.BotError('Aktifkan tab lalu Lanjutkan.','CONTROL',true);
          const searchPage=this.job.targetCursor===i?(this.job.searchPage||1):1,target=this.targetUrl(this.activeCode,searchPage);
          await this.patch({phase:'PROCESS',targetCursor:i,searchPage,processingView:'list',operation:'EXTRACT_LINK',notice:'Mencari kode '+(i+1)+'/'+codes.length+' · halaman '+searchPage+'\n'+this.activeCode});
          if(this.adapter.location.href!==target){
            await this.patch({navigating:{url:target,at:Date.now()}});this.adapter.location.assign(target);return;
          }
          const found=await this.adapter.ready('',true,true);this.guard();await this.patch({navigating:null});
          const matches=found.filter(r=>F.key(r.fields['Kode Identitas'])===record.key);
          if(matches.length>1)throw new F.BotError('Identitas target muncul lebih dari sekali. Periksa hasil pencarian.','DUPLICATE',true);
          if(!matches.length){
            const last=!found.length||this.adapter.lastPage();
            if(searchPage>=10&&(!last||found.length>=100))throw new F.BotError('Pencarian mencapai batas 1.000 kartu dan target belum ditemukan. Periksa filter; daftar dijeda tanpa menyatakan kode tidak ada.','SEARCH_LIMIT',true);
            if(!last){
              const next=this.targetUrl(this.activeCode,searchPage+1);
              await this.patch({searchPage:searchPage+1,navigating:{url:next,at:Date.now()}});this.adapter.location.assign(next);return;
            }
            record={...record,result:'ERROR',stage:'PENCARIAN_TIDAK_DITEMUKAN',error:'Kode Identitas tidak ditemukan pada hasil pencarian. Periksa akses/filter FASIH, lalu Coba ulang gagal.',attempts:record.attempts+1,page:searchPage};
            await this.save(record);
          }else{
            F.checkRows(matches,job.options.prefix,false);await this.adapter.cleanup();
            record={...record,fields:{...record.fields,...matches[0].fields},initialMode:record.initialMode||matches[0].fields.Mode,page:searchPage,capturedAt:record.capturedAt||new Date().toISOString()};
            await this.processRecord(record);
          }
          await this.patch({targetCursor:i+1,searchPage:1});await this.sleep(this.nextDelayMs);
        }
        const c=F.totals([...this.records.values()]);
        await this.patch({status:c.error||c.pending?'NEEDS_ATTENTION':'COMPLETE',phase:'FINISHED',finishedAt:new Date().toISOString(),navigating:null,notice:'Daftar selesai diperiksa. '+c.done+' link tersimpan; '+c.error+' gagal/tidak ditemukan; '+c.skipped+' dilewati. Ekspor hasil atau Coba ulang gagal.'});
      }catch(e){
        try{await this.adapter.cleanup();}catch(cleanup){e=new Error(e.message+' '+cleanup.message);}
        await this.patch({status:this.control==='STOPPED'?'STOPPED':'PAUSED',notice:e.message,navigating:null});
      }finally{this.running=false;this.emit();}
    }
    async resume(job,rows,retry=false){
      if(this.running)throw new Error('Jeda runner dahulu.');
      const records=rows.map(r=>retry&&r.result==='ERROR'?{...r,result:'PENDING',error:''}:r);
      if(retry)await this.send({type:'ROWS',id:job.id,rows:records.filter(r=>r.result==='PENDING')});
      job=await this.send({type:'PATCH',id:job.id,patch:{status:'RUNNING',phase:'PROCESS',targetCursor:0,searchPage:1,notice:'',lastFailure:'',navigating:null}});
      return this.start(job,records);
    }
  }
  F.IdentityRunner=IdentityRunner;
})(globalThis);
