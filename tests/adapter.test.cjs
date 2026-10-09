const test=require('node:test'), assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const F=require('../extension/core.js');
const Adapter=require('../extension/adapter.js');
const {CODES,fields,table,card,dialog}=require('./fixtures.cjs');
const URL='https://fasih-sm.bps.go.id/app/surveys/survey/period/data?page=1&perPage=100&view=table';
function setup(html,url=URL) {
  const dom=new JSDOM(html,{url,pretendToBeVisual:true});
  dom.window.Element.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:20}];};
  return {dom,doc:dom.window.document,a:new Adapter(dom.window.document,dom.window.location)};
}
test('full identities with the same 16-digit prefix select different menus',()=> {
  const {a}=setup(table([fields(CODES[0]),fields(CODES[1])]));
  const rows=a.readRows(); F.checkRows(rows,'7271');
  assert.equal(rows.length,2); assert.notEqual(a.findRow(F.key(CODES[0])).menu,a.findRow(F.key(CODES[1])).menu);
  assert.equal(rows[0].fields['NIB / No. KK'],'0012345678901234');
});
test('list labels are read without mistaking CSS truncation for missing values',()=> {
  const {a}=setup(card(fields())); const rows=a.readList();
  assert.equal(rows[0].fields['Kode Identitas'],CODES[0]);
  assert.equal(rows[0].fields['Nama Keluarga/Bangunan/Usaha'],'KELUARGA UJI & <CONTOH>');
  assert.equal(rows[0].fields.Mode,'CAPI');
  assert.throws(()=>F.checkRows(rows,'7271'),/Petugas Saat Ini, Keterangan/);
  assert.doesNotThrow(()=>F.checkRows(rows,'7271',false));
});

test('list processing accepts absent optional data and uses only cards even if a table also exists',async()=> {
  const {a,doc}=setup(card(fields())+table([fields(CODES[1])]),URL.replace('view=table','view=list'));
  doc.querySelector('div[class~="f:grid"]').innerHTML='';
  const rows=await a.ready('7271');
  assert.equal(rows.length,1);assert.equal(rows[0].fields['Kode Identitas'],CODES[0]);
  assert.deepEqual(Object.keys(rows[0].fields),['Kode Identitas','Status','Mode']);
  const diag=a.diagnose('7271');assert.equal(diag.ready,true);assert.ok(diag.missing.includes('Petugas Saat Ini'));
  delete rows[0].fields.Status;assert.throws(()=>F.checkRows(rows,'7271',false),/Status/);
});

test('list Next ends on an explicit empty page but loading and modal messages cannot terminate pagination',async()=> {
  const listUrl=URL.replace('view=table','view=list');
  const {a,doc,dom}=setup(card(fields())+'<button aria-label="Go to next page">Next</button>',listUrl);a.timeout=5;
  a.next().onclick=()=>{
    dom.window.history.replaceState({},'',listUrl.replace('page=1','page=2'));
    doc.querySelector('div[class~="f:bg-card"]').remove();doc.body.insertAdjacentHTML('beforeend','<p>No results.</p>');
  };
  assert.deepEqual(await a.nextPage(true),{empty:true});assert.deepEqual(await a.ready('7271',true,true),[]);
  doc.querySelector('p').setAttribute('aria-busy','true');assert.equal(a.emptyPage(),false);
  doc.querySelector('p').remove();doc.body.insertAdjacentHTML('beforeend','<section role="dialog"><p>No results.</p></section>');assert.equal(a.emptyPage(),false);
});
test('duplicate identity, wrong territory, missing source columns and truncated code block execution',()=> {
  assert.throws(()=>F.checkRows([{fields:fields()},{fields:fields()}],'7271'),/ganda/);
  assert.throws(()=>F.checkRows([{fields:fields('7201000000000000 - EC - 1 - 1')}],'7271'),/wilayah/);
  assert.throws(()=>F.identity('7271000000000000 - EC - 1 - ...'),/lengkap/);
  const missing=fields();delete missing.Keterangan;
  assert.throws(()=>F.checkRows([{fields:missing}],'7271'),/Keterangan/);
});
test('extraction adapter rejects the mode-change action and has no conversion controls',async()=> {
  const {a}=setup(table([fields(CODES[0],'CAWI')]));
  await assert.rejects(a.openMenu(F.key(CODES[0]),'Ganti Mode'),error=>error.code==='ACTION'&&error.fatal);
  for(const method of ['selectCawi','switchFor','checked','switchesOff','saveMode'])assert.equal(a[method],undefined);
});

test('menu portal outside the card is used, unrelated buttons are not clicked',async()=> {
  const {a,doc}=setup(table([fields()])); let unrelated=0;
  const wrong=doc.createElement('button');wrong.textContent='Broadcast Email';wrong.onclick=()=>unrelated++;doc.body.append(wrong);
  a.findRow(F.key(CODES[0])).menu.onclick=()=> {
    const portal=doc.createElement('div');portal.role='menu';portal.innerHTML='<div role="menuitem">Pengaturan Email</div>';
    portal.firstChild.onclick=()=>{portal.remove();doc.body.insertAdjacentHTML('beforeend',dialog());};doc.body.append(portal);
  };
  const d=await a.openMenu(F.key(CODES[0]),'Pengaturan Email');assert.equal(d.getAttribute('role'),'dialog');assert.equal(unrelated,0);
});

test('a non-responsive three-dot trigger raises fatal UI error, never clicks an unrelated page button',async()=> {
  const {a,doc}=setup(table([fields()]));a.timeout=5;let clicks=0;
  const unrelated=doc.createElement('button');unrelated.textContent='Ganti Mode';unrelated.onclick=()=>clicks++;doc.body.append(unrelated);
  await assert.rejects(a.openMenu(F.key(CODES[0]),'Pengaturan Email'),error=>error.code==='UI'&&error.fatal&&/Menu titik tiga/.test(error.message));
  assert.equal(clicks,0);
});

test('menu lookup uses the initiating trigger aria-controls, not another visible portal',()=> {
  const {a,doc}=setup(table([fields()]));const trigger=a.readRows()[0].menu;
  trigger.setAttribute('aria-controls','owned-menu');
  doc.body.insertAdjacentHTML('beforeend','<div id="wrong-menu" role="menu">Ganti Mode</div><div id="owned-menu" role="menu">Pengaturan Email</div>');
  assert.equal(a.popup(trigger,'menu').id,'owned-menu');
  doc.getElementById('owned-menu').remove();assert.equal(a.popup(trigger,'menu'),null);
});
test('URL input is read in full only within Unique Link; wrong-host and truncated links are rejected',()=> {
  const {a,doc}=setup('<section role="dialog"><h2>Pengaturan Email</h2><a href="https://esurvey.bps.go.id/unrelated">History</a><div><div>Unique Link untuk assignment CAWI</div><input value="https://esurvey.bps.go.id/h/s/very-long-token?x=1&amp;y=2"></div></section>');
  const d=a.dialog('Pengaturan Email');
  assert.equal(a.extractLink(d,'esurvey.bps.go.id'),'https://esurvey.bps.go.id/h/s/very-long-token?x=1&y=2');
  doc.querySelector('input').value='https://esurvey.bps.go.id/h/s/truncated…';assert.equal(a.extractLink(d,'esurvey.bps.go.id'),null);
  doc.querySelector('input').value='https://example.com/h/s/token';assert.equal(a.extractLink(d,'esurvey.bps.go.id'),null);
});
test('Next selector is semantic and respects disabled state',()=> {
  const {a}=setup(table([fields()]));assert.equal(a.lastPage(),true);
  a.next().disabled=false;assert.equal(a.lastPage(),false);
});
test('context detects query/survey changes but allows pagination and alternate view',()=> {
  const a=F.context(URL),b=F.context(URL.replace('page=1','page=2').replace('view=table','view=list'));
  assert.equal(a.signature,b.signature);
  assert.notEqual(a.signature,F.context(URL+'&search=other').signature);
  assert.throws(()=>F.context('https://example.com/app/surveys/a/b/data'),/FASIH/);
});
test('lowercase open in the actual source is eligible; draft remains ineligible and raw data is preserved',()=> {
  const {a}=setup(table([fields(CODES[0],'CAPI','open'),fields(CODES[1],'CAPI','draft')]));
  const data=a.diagnose('7271');assert.equal(data.open,1);assert.deepEqual(data.statuses,{open:1,draft:1});
  assert.equal(a.readRows()[0].fields.Status,'open');
  for(const value of ['open','OPEN',' Open ','oPeN'])assert.equal(F.isOpen(value),true);
  for(const value of ['draft','closed','reopened','not open'])assert.equal(F.isOpen(value),false);
});
test('an explicitly empty page after Next ends inventory even when Next is incorrectly enabled',async()=> {
  const {a,doc,dom}=setup(table([fields()]));a.timeout=5;const button=a.next();button.disabled=false;
  button.onclick=()=> {
    dom.window.history.replaceState({},'',URL.replace('page=1','page=2'));
    doc.querySelector('tbody').innerHTML='<tr><td colspan="17">No results.</td></tr>';
  };
  assert.deepEqual(await a.nextPage(true),{empty:true});
  assert.equal(a.emptyPage(),true);
  assert.deepEqual(await a.ready('7271',true,true),[]);
  doc.querySelector('table').setAttribute('aria-busy','true');assert.equal(a.emptyPage(),false);
  doc.querySelector('table').removeAttribute('aria-busy');
  doc.querySelector('tbody td').textContent='Network error';assert.equal(a.emptyPage(),false);
});
test('a transient No results placeholder cannot terminate pagination while real rows are still loading',async()=> {
  const {a,doc,dom}=setup(table([fields()]));a.timeout=1000;a.next().disabled=false;
  a.next().onclick=()=> {
    dom.window.history.replaceState({},'',URL.replace('page=1','page=2'));
    doc.querySelector('tbody').innerHTML='<tr><td colspan="17">No results.</td></tr>';
    doc.querySelector('table').setAttribute('aria-busy','true');
    setTimeout(()=>{doc.querySelector('table').remove();doc.body.insertAdjacentHTML('afterbegin',table([fields(CODES[1])]));},50);
  };
  assert.equal(await a.nextPage(true),true);assert.equal(a.readRows()[0].fields['Kode Identitas'],CODES[1]);
});

test('all extraction actions and URL reads are paced, with no copy click; custom pacing and stop guards apply',async()=>{
  const {a,doc,dom}=setup(table([fields(CODES[0],'CAWI')]));
  const events=[];a.sleep=async ms=>{events.push('wait:'+ms);};
  const trigger=a.findRow(F.key(CODES[0])).menu;
  trigger.onkeydown=e=>{if(e.key!=='ArrowDown')return;e.preventDefault();events.push('dots');
    const menu=doc.createElement('div');menu.setAttribute('role','menu');menu.innerHTML='<div role="menuitem">Pengaturan Email</div>';
    menu.firstChild.onclick=()=>{events.push('email');menu.remove();doc.body.insertAdjacentHTML('beforeend','<section role="dialog"><h2>Pengaturan Email</h2><div><div>Unique Link untuk assignment CAWI</div><button id="get">Dapatkan Unique Link</button><button id="copy">Copy</button></div><button aria-label="Close">Close</button></section>');
      doc.getElementById('get').onclick=()=>{events.push('get');doc.getElementById('get').insertAdjacentHTML('afterend','<input value="https://esurvey.bps.go.id/h/s/paced">');};
      doc.getElementById('copy').onclick=()=>{throw new Error('Copy must not be clicked');};
      doc.querySelector('[aria-label="Close"]').onclick=()=>{events.push('close');doc.querySelector('section').remove();};
    };doc.body.append(menu);
  };
  try{
    const result=await a.getLink(F.key(CODES[0]),'esurvey.bps.go.id');await a.closeDialog(result.dialog);
    assert.deepEqual(events,['wait:500','dots','wait:500','email','wait:500','wait:500','get','wait:500','wait:500','close']);
    assert.equal(result.link,'https://esurvey.bps.go.id/h/s/paced');
    a.actionDelayMs=750;await a.pace();assert.equal(events.at(-1),'wait:750');
    a.beforeAction=()=>{throw new F.BotError('Stop','CONTROL',true);};
    await assert.rejects(a.pace(),e=>e.code==='CONTROL');await a.pace(true);
    assert.throws(()=>F.timings({actionDelayMs:NaN}),/Jeda aksi/);
    assert.deepEqual(F.timings(),{actionDelayMs:500,nextDelayMs:1000});
  }finally{dom.window.close();}
});
