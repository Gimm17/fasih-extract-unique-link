(function(root){
  'use strict';const F=root.Fasih,levels=['PROVINSI','KABUPATEN/KOTA','KECAMATAN','DESA','SLS','SUBSLS'];
  class TerritoryAdapter extends F.Adapter {
    filterPanel(){
      const panels=this.all('[role="dialog"]').filter(p=>[...p.querySelectorAll('h1,h2,h3,[role="heading"]')].some(h=>F.text(h.textContent)==='Filter Data'));
      return panels.length?this.unique(panels,'Sidebar Filter Data'):null;
    }
    async openFilter(){
      let panel=this.filterPanel();if(panel)return panel;
      const b=this.unique(this.all('button[aria-haspopup="dialog"]').filter(b=>b.querySelector('.tabler-icon-filter')),'Tombol Filter Data');
      return this.openControl(b,()=>this.filterPanel(),'Sidebar Filter Data');
    }
    geoControl(panel,level){
      const labels=this.all('label,span,div,p',panel).filter(e=>!e.children.length&&F.text(e.textContent).toUpperCase()===level);
      const candidates=new Set();
      for(const label of labels){
        const linked=label.getAttribute('for');if(linked){const b=this.doc.getElementById(linked);if(b?.getAttribute('role')==='combobox'&&panel.contains(b))candidates.add(b);}
        for(let group=label.parentElement;group&&group!==panel;group=group.parentElement){
          const buttons=this.all('button[role="combobox"]',group);
          if(buttons.length===1){candidates.add(buttons[0]);break;}
          if(buttons.length>1)break;
        }
      }
      return this.unique([...candidates], 'Dropdown '+level);
    }
    selected(control){return F.text(control.querySelector('span')?.textContent||control.textContent);}
    matches(control,option){return this.selected(control)===`[${option.code}] ${option.name}`;}
    nonTerritoryStamp(panel){
      const geo=new Set(levels.map(level=>this.geoControl(panel,level)));
      const values=this.all('button[role="combobox"]',panel).filter(b=>!geo.has(b)).map(b=>this.selected(b));
      return JSON.stringify(values);
    }
    option(el,level){
      const text=F.text(el.querySelector('span')?.textContent||el.textContent),m=text.match(/^\[([^\]]+)\]\s*(.+)$/);
      if(!m||el.getAttribute('aria-disabled')==='true'||el.dataset.disabled==='true')return null;
      return {level,code:m[1],name:m[2],value:el.getAttribute('data-value')||`${m[1]} ${m[2]}`};
    }
    geoPopup(control,panel){
      const id=control.getAttribute('aria-controls'),linked=id&&this.doc.getElementById(id);
      if(linked&&this.visible(linked)&&(linked.querySelector('[role="option"]')||linked.querySelector('[cmdk-root]')))return linked;
      const candidates=this.all('[cmdk-root],[cmdk-list],[role="listbox"],[role="dialog"]').filter(e=>e!==panel&&(e.querySelector('[role="option"]')||e.matches('[cmdk-root]'))&&!e.querySelector('button[role="combobox"]'));
      const roots=candidates.filter(e=>!candidates.some(other=>other!==e&&other.contains(e)));
      return roots.length?this.unique(roots,'Pilihan wilayah terbuka'):null;
    }
    async dropdown(panel,level){
      const control=this.geoControl(panel,level);const popup=await this.openControl(control,()=>this.geoPopup(control,panel),'Pilihan '+level);return {control,popup};
    }
    inputValue(input,value){
      const setter=Object.getOwnPropertyDescriptor(this.doc.defaultView.HTMLInputElement.prototype,'value').set;setter.call(input,value);
      input.dispatchEvent(new this.doc.defaultView.Event('input',{bubbles:true}));input.dispatchEvent(new this.doc.defaultView.Event('change',{bubbles:true}));
    }
    async closeOptions(control,popup){
      this.key(control,'Escape');if(this.visible(popup)){this.key(popup,'Escape');}
      await this.waitUi(()=>!this.visible(popup),'menutup pilihan wilayah');
    }
    async enumerate(panel,level){
      const {control,popup}=await this.dropdown(panel,level),search=popup.querySelector('input');
      if(search&&search.value){this.inputValue(search,'');await this.sleep(this.actionDelayMs);}
      const found=new Map(),scrolls=[popup,...popup.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+2&&['auto','scroll'].includes(this.doc.defaultView.getComputedStyle(e).overflowY));
      if(scrolls.length>1&&scrolls.some(e=>!scrolls[0].contains(e)))throw new F.BotError('Kontainer gulir wilayah ambigu.','CATALOG',true);
      const scroller=scrolls.at(-1);if(scroller)scroller.scrollTop=0;
      let stable=0,last='';
      for(let pass=0;pass<200;pass++){
        await this.pace();
        for(const el of popup.querySelectorAll('[role="option"]')){const r=this.option(el,level);if(r){const old=found.get(r.code);if(old&&old.name!==r.name)throw new F.BotError('Kode pilihan wilayah berulang dengan nama berbeda.','CATALOG',true);found.set(r.code,r);}}
        const stamp=[found.size,scroller?.scrollTop||0,scroller?.scrollHeight||0].join('|');stable=stamp===last?stable+1:0;last=stamp;
        const bottom=!scroller||scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-2;
        if(bottom&&stable>=2){await this.closeOptions(control,popup);if(!found.size&&!/no results|tidak.*(hasil|data)|tidak ditemukan/i.test(popup.textContent))throw new F.BotError('Daftar '+level+' kosong atau belum dimuat.','CATALOG',true);return [...found.values()].sort((a,b)=>a.code.localeCompare(b.code));}
        if(scroller&&!bottom){scroller.scrollTop+=Math.max(1,scroller.clientHeight-30);scroller.dispatchEvent(new this.doc.defaultView.Event('scroll',{bubbles:true}));}
      }
      throw new F.BotError('Daftar wilayah belum mencapai akhir.','CATALOG',true);
    }
    async selectRegion(panel,option){
      const control=this.geoControl(panel,option.level);if(this.matches(control,option))return;
      const {popup}=await this.dropdown(panel,option.level);
      let get=()=>[...popup.querySelectorAll('[role="option"]')].filter(el=>{const r=this.option(el,option.level);return r&&r.code===option.code&&r.name===option.name;});
      if(!get().length){const input=popup.querySelector('input');if(!input)throw new F.BotError('Pilihan wilayah target tidak ditemukan.','FILTER',true);this.inputValue(input,option.code);await this.sleep(this.actionDelayMs);}
      const target=this.unique(await this.waitUi(()=>get().length?get():null,'wilayah '+option.name), 'Pilihan '+option.name);
      await this.pace();target.click();
      await this.waitUi(()=>this.matches(this.geoControl(panel,option.level),option)&&!this.visible(popup),'filter '+option.name+' terpasang');
    }
    async clearRegion(panel,level){
      const control=this.geoControl(panel,level);if(/^(pilih wilayah|semua)$/i.test(this.selected(control)))return;
      const x=this.unique([...control.querySelectorAll('.tabler-icon-x')],'Hapus filter '+level);await this.pace();
      x.dispatchEvent(new this.doc.defaultView.MouseEvent('click',{bubbles:true,cancelable:true}));
      await this.waitUi(()=>/^(pilih wilayah|semua)$/i.test(this.selected(this.geoControl(panel,level))),'mengosongkan '+level);
    }
    verifyRecipe(panel,recipe){
      for(const r of recipe)if(!this.matches(this.geoControl(panel,r.level),r))throw new F.BotError('Filter '+r.level+' tidak cocok dengan tugas server.','FILTER',true);
      for(const level of levels.slice(recipe.length))if(!/^(pilih wilayah|semua)$/i.test(this.selected(this.geoControl(panel,level))))throw new F.BotError('Filter turunan '+level+' belum kosong.','FILTER',true);
    }
    async closeFilter(panel){
      const buttons=this.all('button',panel).filter(b=>b.querySelector('.tabler-icon-x')&&F.text(b.textContent)==='Close');
      const button=this.unique(buttons,'Tutup sidebar Filter Data');await this.pace();button.click();await this.waitUi(()=>!this.visible(panel),'sidebar filter ditutup');
    }
    async applyRecipe(recipe,prefix){
      this.onActivity('Memasang filter: '+recipe.map(r=>r.name).join(' → '));
      const panel=await this.openFilter();
      for(const option of recipe)await this.selectRegion(panel,option);
      for(const level of levels.slice(recipe.length).reverse())await this.clearRegion(panel,level);
      this.verifyRecipe(panel,recipe);
      const stamp=this.nonTerritoryStamp(panel);if(this.expectedNonGeoStamp!=null&&stamp!==this.expectedNonGeoStamp)throw new F.BotError('Filter non-wilayah berbeda dari inventaris Koordinator. Samakan Pengawas/Pencacah/mode/filter lainnya.','FILTER',true);
      this.currentNonGeoStamp=stamp;await this.closeFilter(panel);
      // Filter selections apply immediately. Wait for the final selection, not
      // transient parent results. Recheck after the UI has settled.
      await this.sleep(Math.max(1500,this.actionDelayMs*3));
      let previous=null,stable=0;
      const rows=await this.waitUi(()=>{
        if(this.all('[aria-busy="true"],[data-loading="true"],[class~="f:animate-spin"]').length)return false;
        const rows=this.readRows(),stamp=rows.length?rows.map(r=>F.key(r.fields['Kode Identitas'])).join('|'):this.emptyPage()?'EMPTY':null;
        if(stamp===null)return false;stable=stamp===previous?stable+1:0;previous=stamp;return stable>=3?{rows}:false;
      },'hasil filter wilayah stabil');
      if(rows.rows.length)F.checkRows(rows.rows,prefix,false);return rows.rows;
    }
    async verifyActive(recipe){const panel=await this.openFilter();this.verifyRecipe(panel,recipe);await this.closeFilter(panel);}
  }
  F.TerritoryAdapter=TerritoryAdapter;F.territoryLevels=levels;
})(globalThis);
