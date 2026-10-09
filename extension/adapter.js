(function (root) {
  'use strict';
  const F = root.Fasih;
  class Adapter {
    constructor(doc = document, location = root.location) { this.doc = doc; this.location = location; this.timeout = 20000; this.actionDelayMs=500; this.onActivity=()=>{}; this.beforeAction=()=>{}; }
    sleep(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }
    async pace(cleanup=false) { await this.sleep(this.actionDelayMs); if(!cleanup)this.beforeAction(); }
    visible(el) {
      if (!el || el.hidden || el.closest('[hidden]')) return false;
      const style = this.doc.defaultView.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    }
    all(selector, scope = this.doc) { return [...scope.querySelectorAll(selector)].filter(e => this.visible(e)); }
    unique(items, label) {
      if (items.length !== 1) throw new F.BotError(`${label}: ditemukan ${items.length} kandidat, harus tepat satu.`, 'AMBIGUOUS', true);
      return items[0];
    }
    async wait(read, description, timeout = this.timeout) {
      const start = Date.now();
      while (true) {
        const value = read(); if (value) return value;
        const remaining=timeout-(Date.now()-start);if(remaining<=0)break;
        await this.sleep(Math.min(this.actionDelayMs,remaining));
      }
      throw new F.BotError('Timeout: ' + description, 'TIMEOUT');
    }
    async waitUi(read, description) {
      try {return await this.wait(read,description);}catch(e){
        if(e.code==='TIMEOUT')throw new F.BotError(e.message+'. Proses dijeda pada data ini.','UI',true);
        throw e;
      }
    }
    button(scope, label) {
      return this.unique(this.all('button,[role="button"]', scope).filter(e => F.text(e.textContent) === label || e.getAttribute('aria-label') === label), label);
    }
    key(control, key) {
      const View=this.doc.defaultView;
      const handled=!control.dispatchEvent(new View.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,composed:true}));
      control.dispatchEvent(new View.KeyboardEvent('keyup',{key,bubbles:true,cancelable:true,composed:true}));
      return handled;
    }
    popup(control, role) {
      const id=control.getAttribute('aria-controls');
      if(id) {
        const content=this.doc.getElementById(id);
        return content?.getAttribute('role')===role&&this.visible(content)?content:null;
      }
      const contents=this.all(`[role="${role}"]`);
      return contents.length?this.unique(contents,'Popup '+role):null;
    }
    async openControl(control, read, description) {
      if(control.disabled || control.getAttribute('aria-disabled')==='true')throw new F.BotError(description+': kontrol nonaktif.','UI',true);
      control.scrollIntoView?.({block:'center',inline:'nearest'});
      control.focus({preventScroll:true});
      await this.pace();
      // Radix DropdownMenu handles pointerdown/keydown, not HTMLElement.click().
      // ArrowDown opens it without toggling an already open menu closed.
      const keyboard=this.key(control,'ArrowDown');
      if(!keyboard) {
        try {return await this.wait(read,description,this.actionDelayMs);}catch(e){if(e.code!=='TIMEOUT')throw e;}
        await this.pace();
        const View=this.doc.defaultView, Event=View.PointerEvent||View.MouseEvent;
        const options={bubbles:true,cancelable:true,composed:true,button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true,ctrlKey:false};
        const handled=!control.dispatchEvent(new Event('pointerdown',options));
        control.dispatchEvent(new Event('pointerup',{...options,buttons:0}));
        if(!handled) {
          try {return await this.wait(read,description,this.actionDelayMs);}catch(e){if(e.code!=='TIMEOUT')throw e;}
          // Compatibility for controls implemented with an ordinary click handler.
          if(control.getAttribute('aria-expanded')!=='true'){await this.pace();control.click();}
        }
      }
      try {return await this.wait(read,description);}catch(e){
        if(e.code==='TIMEOUT')throw new F.BotError(description+' tidak terbuka setelah pemicu keyboard/pointer. Proses dijeda pada data ini.','UI',true);
        throw e;
      }
    }
    tables() {
      return this.all('table,[role="table"],[role="grid"]').filter(t => {
        const headings = [...t.querySelectorAll('thead th,[role="columnheader"]')].map(e => F.column(e.textContent));
        return headings.includes('Kode Identitas') && headings.includes('Mode') && headings.includes('Status');
      });
    }
    readTable() {
      const candidates = this.tables();
      if (!candidates.length) return [];
      const table = this.unique(candidates, 'Tabel assignment');
      const headers = [...table.querySelectorAll('thead th,[role="columnheader"]')].map(e => F.column(e.textContent));
      const trs = [...table.querySelectorAll('tbody tr,[role="row"]')].filter(tr=>!tr.querySelector('th,[role="columnheader"]'));
      const result = [];
      for (const tr of trs) {
        const cells = [...tr.children].filter(e=>e.matches('td,[role="cell"],[role="gridcell"]'));
        if (!cells.length) continue;
        const fields = {};
        headers.forEach((h,i) => { if(h && cells[i]) fields[h] = F.text(cells[i].textContent); });
        if (!fields['Kode Identitas'] || /tidak.*(data|ditemukan)/i.test(fields['Kode Identitas'])) continue;
        const menu = [...tr.querySelectorAll('button[aria-haspopup="menu"]')].filter(b=>b.querySelector('.tabler-icon-dots-vertical'));
        result.push({ fields, element: tr, menu: menu.length===1 ? menu[0] : null });
      }
      return result;
    }
    readList() {
      return this.all('div[class~="f:overflow-hidden"][class~="f:bg-card"][class~="f:border"]').map(card => {
        const codes = [...card.querySelectorAll('button[class~="f:underline"]')];
        const grids = [...card.querySelectorAll('div[class~="f:grid"][class~="f:grid-cols-2"]')];
        if (codes.length!==1 || grids.length!==1) return null;
        const fields = { 'Kode Identitas': F.text(codes[0].textContent) };
        for (const group of grids[0].children) {
          if (group.children.length===2) fields[F.column(group.children[0].textContent)] = F.text(group.children[1].textContent);
        }
        const status = [...card.querySelectorAll('div[class~="f:capitalize"]')].filter(e=>!e.children.length);
        const modes = [...card.querySelectorAll('div[class~="f:border"]')].filter(e=>!e.children.length && /^(CAWI|CAPI|PAPI)$/i.test(F.text(e.textContent)));
        if(status.length===1) fields.Status = F.text(status[0].textContent);
        if(modes.length===1) fields.Mode = F.text(modes[0].textContent);
        const menu = [...card.querySelectorAll('button[aria-haspopup="menu"]')].filter(b=>b.querySelector('.tabler-icon-dots-vertical'));
        return { fields, element: card, menu: menu.length===1?menu[0]:null };
      }).filter(Boolean);
    }
    readRows() { return F.context(this.location.href).view==='list'?this.readList():this.readTable(); }
    async ready(prefix, complete = true, allowEmpty = false) {
      let rows;
      try {
        rows = await this.wait(() => {const found=this.readRows();return found.length?found:false;}, 'data assignment muncul');
      } catch(error) {
        if(error.code==='TIMEOUT' && allowEmpty && this.emptyPage())return [];
        throw error;
      }
      if (complete) F.checkRows(rows, prefix, false);
      return rows;
    }
    optionalRow(key) {
      const items=this.readRows().filter(r=>F.key(r.fields['Kode Identitas'])===key);
      if(items.length>1) throw new F.BotError('Assignment target tidak unik.', 'AMBIGUOUS',true);
      return items[0]||null;
    }
    findRow(key) { const row=this.optionalRow(key); if(!row)throw new F.BotError('Assignment target tidak ditemukan.','ROW'); return row; }
    next() { return this.unique(this.all('button[aria-label="Go to next page"]'), 'Tombol Next'); }
    lastPage() { const b=this.next(); return b.disabled || b.getAttribute('aria-disabled')==='true'; }
    emptyPage() {
      if(this.readRows().length)return false;
      const busy=this.all('[aria-busy="true"],[data-loading="true"],[data-state="loading"],[class~="animate-spin"],[class~="f:animate-spin"]');
      if(busy.length)return false;
      const empty=/^(no results\.?|tidak ada (hasil|data)\.?|data tidak ditemukan\.?)$/i;
      if(F.context(this.location.href).view==='list')return this.all('div,p,span,[role="status"]').filter(e=>
        !e.children.length&&!e.closest('[role="dialog"],[role="menu"]')&&empty.test(F.text(e.textContent))).length===1;
      const tables=this.tables();
      if(tables.length!==1)return false;
      return [...tables[0].querySelectorAll('tbody tr,[role="row"]')].some(tr=>
        empty.test(F.text(tr.textContent)));
    }
    pageSignature() { return this.readRows().map(r=>F.key(r.fields['Kode Identitas'])).sort().join('|'); }
    async nextPage(allowEmpty = false) {
      const before=this.pageSignature(), page=F.context(this.location.href).page;
      await this.pace();
      this.next().click();
      try { return await this.wait(()=> {
        const rows=this.readRows();
        if (!rows.length || F.context(this.location.href).page<=page) return false;
        return rows.map(r=>F.key(r.fields['Kode Identitas'])).sort().join('|')!==before;
      }, 'halaman dan isi tabel berubah'); }
      catch(error) {
        if(error.code==='TIMEOUT' && allowEmpty && F.context(this.location.href).page===page+1 && this.emptyPage())return {empty:true};
        throw error;
      }
    }
    filterStamp() {
      // Only capture actual filter chips. Do not infer territory from a generic badge count.
      return this.all('[data-filter-value],[data-filter-id],[data-filter-chip]').map(e=>[
        e.getAttribute('data-filter-value'),e.getAttribute('data-filter-id'),F.text(e.textContent)]).sort().map(v=>JSON.stringify(v)).join('|');
    }
    dialogs() {
      return this.all('[role="dialog"],[role="alertdialog"],[data-state="open"][data-slot="dialog-content"]')
        .filter((e,i,a)=>!a.some((other,j)=>i!==j&&other.contains(e)));
    }
    dialog(title) {
      const dialogs = this.dialogs().filter(d=> [...d.querySelectorAll('h1,h2,h3,[role="heading"],div,p')]
        .some(h=>F.text(h.textContent)===title));
      if(!dialogs.length) return null;
      return this.unique(dialogs, 'Popup '+title);
    }
    async openMenu(key, item) {
      if(item!=='Pengaturan Email')throw new F.BotError('Versi ekstraksi hanya membuka Pengaturan Email.','ACTION',true);
      if(this.dialogs().length) throw new F.BotError('Tutup popup lain sebelum melanjutkan.', 'DIALOG', true);
      const row=this.findRow(key);
      if(!F.isOpen(row.fields.Status)) throw new F.BotError('Status assignment bukan OPEN.', 'STATUS');
      if(!row.menu) throw new F.BotError('Tombol tiga titik belum dikenali.', 'DOM', true);
      this.onActivity('Membuka titik tiga → '+item);
      const menu=await this.openControl(row.menu,()=>this.popup(row.menu,'menu'),'Menu titik tiga');
      const target=await this.waitUi(()=> {
        const items=this.all('[role="menuitem"],[data-radix-collection-item],button',menu).filter(e=>F.text(e.textContent)===item);
        return items.length ? this.unique(items,item) : false;
      },'menu '+item);
      await this.pace(); target.click();
      this.onActivity('Menunggu popup '+item);
      return this.waitUi(()=>this.dialog(item),'popup '+item);
    }
    extractLink(dialog, host) {
      // Read only the visible Unique Link section, not unrelated email/history links.
      const labels=this.all('div,p,span,h2,h3,h4,label',dialog).filter(e=>!e.children.length && F.text(e.textContent)==='Unique Link');
      const descriptions=this.all('div,p,span',dialog).filter(e=>!e.children.length && F.text(e.textContent)==='Unique Link untuk assignment CAWI');
      let sections=descriptions.map(e=>e.parentElement);
      if(!sections.length) sections=labels.map(e=>e.parentElement);
      sections=sections.filter((e,i,a)=>!a.some((other,j)=>i!==j&&other.contains(e)));
      const links=new Set();
      for(const section of sections) {
        for(const el of section.querySelectorAll('input,textarea,a,[title],code,span,div')) {
          if(!this.visible(el)) continue;
          const values=[el.value,el.getAttribute('href'),el.getAttribute('title'),!el.children.length?el.textContent:''];
          for(const value of values) { const link=F.validLink(value,host); if(link) links.add(link); }
        }
      }
      if(links.size>1) throw new F.BotError('Lebih dari satu URL Unique Link ditemukan.', 'LINK',true);
      return [...links][0]||null;
    }
    async getLink(key, host) {
      if(F.mode(this.findRow(key).fields.Mode)!=='CAWI') throw new F.BotError('Mode belum CAWI. Periksa pembaruan dari pusat.','MODE');
      const dialog=await this.openMenu(key,'Pengaturan Email');
      await this.pace();
      let link=this.extractLink(dialog,host);
      if(!link) {
        const get=this.button(dialog,'Dapatkan Unique Link');
        if(get.disabled) throw new F.BotError('Dapatkan Unique Link nonaktif.', 'LINK');
        await this.pace(); get.click();
        this.onActivity('Mengambil URL Unique Link lengkap');
        await this.pace();
        link=await this.wait(()=>this.extractLink(dialog,host),'URL lengkap di bagian Unique Link');
      }
      return { link, dialog };
    }
    async closeDialog(dialog, cleanup=false) {
      if(!dialog?.isConnected) return;
      const closers=this.all('button',dialog).filter(b=> /^(close|tutup|dismiss)$/i.test(b.getAttribute('aria-label')||F.text(b.textContent)) ||
        b.getAttribute('data-slot')==='dialog-close' || b.querySelector('.tabler-icon-x,.lucide-x'));
      if(closers.length!==1) throw new F.BotError('Tombol tutup popup belum dikenali secara unik.', 'CLOSE',true);
      await this.pace(cleanup); closers[0].click();
      await this.wait(()=>!this.dialogs().includes(dialog),'popup ditutup');
      this.onActivity('');
    }
    async cleanup() {
      const dialogs=this.dialogs();
      if(dialogs.length>1) throw new F.BotError('Lebih dari satu popup aktif.', 'DIALOG',true);
      if(dialogs.length===1) await this.closeDialog(dialogs[0],true);
      const menu=this.all('[role="menu"]');
      if(menu.length) {
        await this.pace(true); this.key(this.unique(menu,'Menu aktif'),'Escape');
        await this.wait(()=>!this.all('[role="menu"]').length,'menu ditutup');
      }
      this.onActivity('');
    }
    diagnose(prefix) {
      const rows=this.readRows(); let issue='';
      try {
        if(F.context(this.location.href).view!=='list')throw new F.BotError('Beralih ke tampilan list. Proses versi ini menggunakan kartu list.','VIEW');
        F.checkRows(rows,prefix,false); this.next();
        if(rows.some(r=>!r.menu))throw new F.BotError('Ada kartu yang tombol tiga titiknya belum dikenali.','DOM');
      } catch(e) { issue=e.message; }
      const columns=[...new Set(rows.flatMap(r=>Object.keys(r.fields)))];
      return { view:F.context(this.location.href).view, rows:rows.length, columns,
        missing:F.sourceColumns.filter(c=>!columns.includes(c)), open:rows.filter(r=>F.isOpen(r.fields.Status)).length,
        cawiOpen:rows.filter(r=>F.isOpen(r.fields.Status)&&F.mode(r.fields.Mode)==='CAWI').length,
        statuses:rows.reduce((a,r)=>{const s=F.text(r.fields.Status);a[s]=(a[s]||0)+1;return a;},{}),
        modes:rows.reduce((a,r)=>{a[r.fields.Mode]=(a[r.fields.Mode]||0)+1;return a;},{}),
        next:this.all('button[aria-label="Go to next page"]').length===1,
        ready:!issue, issue, filterStamp:this.filterStamp() };
    }
  }
  F.Adapter=Adapter;
  if(typeof module!=='undefined') module.exports=Adapter;
})(globalThis);
