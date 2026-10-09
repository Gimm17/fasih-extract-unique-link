const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{fields,CODES,card}=require('./fixtures.cjs');
const url='https://fasih-sm.bps.go.id/app/surveys/simulation/period/data?page=1&perPage=100&view=list';
async function setup(html=card(fields(CODES[0],'CAWI'))+card(fields(CODES[1],'CAWI')),savedSettings=null) {
  const dom=new JSDOM(html+'<button aria-label="Go to next page" disabled>Next</button>',{url,pretendToBeVisual:true,runScripts:'outside-only'});
  const w=dom.window;
  w.Element.prototype.getClientRects=function(){return this.hidden?[]:[{width:100,height:20}];};
  const attach=w.Element.prototype.attachShadow;w.Element.prototype.attachShadow=function(opts){return attach.call(this,{...opts,mode:'open'});};
  const job={id:'saved-job',context:{url,view:'list',scope:'simulation/period'},options:{region:'Kota Palu',prefix:'7271',linkHost:'esurvey.bps.go.id',pilot:true,limit:5},
    status:'PAUSED',phase:'PROCESS',pages:{},notice:'Catatan proses tersimpan.',navigating:null};
  const calls=[];let settings=savedSettings,deleted=false;
  w.chrome={runtime:{sendMessage:async msg=>{
    calls.push(msg.type);
    if(msg.type==='GET_SETTINGS')return {ok:true,value:settings};
    if(msg.type==='SET_SETTINGS'){settings=msg.settings;return {ok:true,value:settings};}
    if(msg.type==='RESET_ALL'){deleted=true;settings=null;return {ok:true,value:true};}
    if(msg.type==='LATEST')return {ok:true,value:deleted?null:job.id};
    if(msg.type==='READ')return {ok:true,value:{job:structuredClone(job),rows:[],owned:true}};
    throw new Error('Unexpected storage command: '+msg.type);
  },onMessage:{addListener:()=>{}}}};
  for(const f of ['core.js','adapter.js','runner.js','content.js'])w.eval(fs.readFileSync(path.join(__dirname,'../extension',f),'utf8'));
  const panel=w.document.getElementById('fasih-cawi-bot').shadowRoot;
  for(let i=0;i<100&&!panel.getElementById('state').textContent.includes('Dijeda');i++)await new Promise(r=>setTimeout(r,1));
  assert.match(panel.getElementById('state').textContent,/Dijeda/);
  const click=async id=>{panel.getElementById(id).click();await new Promise(r=>setTimeout(r,0));};
  return {dom,panel,calls,job,click,settings:()=>settings,deleted:()=>deleted};
}
test('Cek data halaman stays visible after restoring a saved paused job and never starts extraction',async()=>{
  const s=await setup();try {
    const before=structuredClone(s.job);s.calls.length=0;await s.click('diagnose');
    // This text was overwritten by update() in the old action wrapper.
    const result=s.panel.getElementById('diagnostics');
    assert.match(result.textContent,/Kartu terbaca: 2/);assert.equal(result.classList.contains('hidden'),false);
    assert.match(result.textContent,/OPEN dan CAWI: 2/);
    assert.match(result.textContent,/Kartu list siap diproses/);
    assert.deepEqual(s.calls,[]);assert.deepEqual(s.job,before);
  }finally{s.dom.window.close();}
});
test('diagnostics do not depend on the export domain and can be refreshed repeatedly',async()=>{
  const s=await setup();try {
    s.panel.getElementById('linkHost').value='bad-domain';await s.click('diagnose');
    assert.match(s.panel.getElementById('diagnostics').textContent,/Kartu terbaca: 2/);
    s.dom.window.document.querySelector('div[class~="f:bg-card"]').remove();await s.click('diagnose');
    assert.match(s.panel.getElementById('diagnostics').textContent,/Kartu terbaca: 1/);
  }finally{s.dom.window.close();}
});
test('a launch validation error is no longer overwritten by the saved job notice',async()=>{
  const s=await setup();try {
    s.panel.getElementById('prefix').value='bad';await s.click('pilot');
    assert.match(s.panel.getElementById('notice').textContent,/Isi awalan kode wilayah/);
  }finally{s.dom.window.close();}
});
test('a prefix error in Cek data halaman stays visible with a saved job',async()=>{
  const s=await setup();try {
    s.panel.getElementById('prefix').value='bad';await s.click('diagnose');
    assert.match(s.panel.textContent,/Isi awalan kode wilayah/);
  }finally{s.dom.window.close();}
});
test('an empty list produces a visible diagnostic reason rather than appearing to do nothing',async()=>{
  const s=await setup('');try {
    await s.click('diagnose');assert.match(s.panel.textContent,/Kartu terbaca: 0/);assert.match(s.panel.textContent,/Tidak ada assignment yang terbaca/);
  }finally{s.dom.window.close();}
});

test('custom timing is restored, saved, validated and reset with all local panel data',async()=>{
  const s=await setup(undefined,{actionDelayMs:750,nextDelayMs:2000});try{
    const p=s.panel;
    assert.equal(p.getElementById('actionDelay').value,'0.75');assert.equal(p.getElementById('nextDelay').value,'2.00');
    p.getElementById('actionDelay').value='0.50';p.getElementById('nextDelay').value='1.00';await s.click('saveTiming');
    assert.equal(s.settings().actionDelayMs,500);assert.equal(s.settings().nextDelayMs,1000);
    p.getElementById('actionDelay').value='-1';await s.click('saveTiming');
    assert.match(p.getElementById('notice').textContent,/Jeda aksi/);assert.equal(s.settings().actionDelayMs,500);
    await s.click('diagnose');await s.click('reset');assert.equal(s.deleted(),false);
    assert.equal(p.getElementById('resetConfirm').classList.contains('hidden'),false);
    await s.click('resetCancel');assert.equal(s.deleted(),false);
    await s.click('reset');await s.click('resetApply');
    assert.equal(s.deleted(),true);assert.equal(s.settings(),null);
    assert.equal(p.getElementById('actionDelay').value,'0.50');assert.equal(p.getElementById('nextDelay').value,'1.00');
    assert.equal(p.getElementById('prefix').value,'7271');assert.equal(p.getElementById('total').textContent,'0');
    assert.equal(p.getElementById('diagnostics').textContent,'');assert.equal(p.getElementById('export').disabled,true);
    assert.match(p.getElementById('notice').textContent,/Reset full selesai/);
  }finally{s.dom.window.close();}
});

test('server inventory shows a pending message immediately and surfaces exact query mismatch before creating any job',async()=>{
  const s=await setup();try{
    const w=s.dom.window,p=s.panel,original=w.chrome.runtime.sendMessage;
    let resolveInfo;
    w.chrome.runtime.sendMessage=msg=>msg.type==='REMOTE_INFO'?new Promise(resolve=>{resolveInfo=resolve;}):original(msg);
    p.getElementById('serverInventory').click();
    assert.match(p.getElementById('notice').textContent,/Memeriksa koneksi dan URL proyek/);
    assert.equal(p.getElementById('serverInventory').disabled,true);
    resolveInfo({ok:true,value:{worker:{id:'worker',role:'COORDINATOR'},campaign:{id:'campaign',generation:1,name:'Sulteng',prefix:'72',linkHost:'esurvey.bps.go.id',sourceUrl:url+'&search=-+EC+-'}}});
    await new Promise(r=>setTimeout(r,0));
    const notice=p.getElementById('notice');
    assert.match(notice.textContent,/Inventaris\/tugas belum dimulai/);
    assert.match(notice.textContent,/Pencarian proyek: "- EC -"/);
    assert.match(notice.textContent,/Buka URL proyek/);
    assert.equal(p.querySelector('.body').firstElementChild,notice);
    assert.equal(notice.getAttribute('aria-live'),'polite');
    assert.equal(p.getElementById('serverInventory').disabled,false);
    assert.equal(s.calls.includes('CREATE'),false);
  }finally{s.dom.window.close();}
});

test('a worker token cannot import and its role error stays visible instead of the restored job notice',async()=>{
  const s=await setup();try{
    const original=s.dom.window.chrome.runtime.sendMessage;
    s.dom.window.chrome.runtime.sendMessage=msg=>msg.type==='REMOTE_INFO'?Promise.resolve({ok:true,value:{worker:{role:'WORKER'},campaign:{sourceUrl:url}}}):original(msg);
    await s.click('serverInventory');
    assert.match(s.panel.getElementById('notice').textContent,/token Koordinator/);
    assert.equal(s.calls.includes('CREATE'),false);
  }finally{s.dom.window.close();}
});
