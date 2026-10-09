const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fields,CODES}=require('./fixtures.cjs'),{build}=require('esbuild');
const playwrightPath=process.env.FASIH_PLAYWRIGHT||'C:/Users/BPSAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const chromeExe=process.env.FASIH_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const skip=!fs.existsSync(chromeExe)||!fs.existsSync(playwrightPath);
async function setup(view) {
  const bundle=await build({entryPoints:[path.join(__dirname,'radix-fixture.cjs')],bundle:true,write:false,platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
  const browser=await require(playwrightPath).chromium.launch({executablePath:chromeExe,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><title>Offline Radix fixture</title><h1>Simulasi lokal · Radix asli</h1>'}));
  await page.goto('https://fasih-sm.bps.go.id/app/surveys/simulation/period/data?page=1&perPage=100&view='+view);
  for(const script of ['core.js','adapter.js'])await page.addScriptTag({path:path.join(__dirname,'../extension',script)});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(({rows,view})=>mountRadixFixture(rows,view),{rows:[fields(CODES[0],'CAWI','open'),fields(CODES[1],'CAWI','open')],view});
  await page.getByRole('button',{name:'Assignment menu',exact:true}).first().waitFor();
  return {browser,page,errors};
}
for(const view of ['table','list'])test(`real Radix ${view}: plain click fails; adapter opens only email settings and extracts links`,{skip,timeout:30000},async()=>{
  const {browser,page,errors}=await setup(view);
  try {
    // Reproduce the production bug with the exact old interaction before verifying the fix.
    await page.evaluate(()=>document.querySelector('button[aria-haspopup="menu"]').click());
    assert.equal(await page.getByRole('menu').count(),0);
    const result=await page.evaluate(async()=>{
      const a=new Fasih.Adapter(),key=Fasih.key(a.readRows()[0].fields['Kode Identitas']);
      const {link,dialog}=await a.getLink(key,'esurvey.bps.go.id');await a.closeDialog(dialog);
      return {...radixSim,link,mode:a.findRow(key).fields.Mode,dialogs:a.dialogs().length};
    });
    assert.equal(result.menus,1);assert.equal(result.dropdowns,0);assert.equal(result.saves,0);assert.equal(result.links,1);
    assert.equal(result.emailSends,0);assert.equal(result.messageSends,0);assert.equal(result.mode,'CAWI');assert.equal(result.dialogs,0);
    assert.equal(result.link,'https://esurvey.bps.go.id/h/s/test-354');assert.deepEqual(errors,[]);
    // Escape must close a real Radix portal; clicking its trigger used to fail too.
    await page.evaluate(async()=>{
      const a=new Fasih.Adapter(),trigger=a.readRows()[0].menu;
      await a.openControl(trigger,()=>a.popup(trigger,'menu'),'Menu titik tiga');await a.cleanup();
    });
    assert.equal(await page.getByRole('menu').count(),0);
  }finally{await browser.close();}
});
test('isolated content-script world can operate real Radix handlers in the page world',{skip,timeout:30000},async()=>{
  const {browser,page,errors}=await setup('table');
  try {
    const cdp=await page.context().newCDPSession(page);
    const {frameTree}=await cdp.send('Page.getFrameTree');
    const {executionContextId}=await cdp.send('Page.createIsolatedWorld',{frameId:frameTree.frame.id,worldName:'FASIH content script fixture'});
    for(const script of ['core.js','adapter.js']) {
      const output=await cdp.send('Runtime.evaluate',{contextId:executionContextId,expression:fs.readFileSync(path.join(__dirname,'../extension',script),'utf8')});
      assert.equal(output.exceptionDetails,undefined);
    }
    const output=await cdp.send('Runtime.evaluate',{contextId:executionContextId,awaitPromise:true,returnByValue:true,expression:`(async()=>{
      const a=new Fasih.Adapter(),key=Fasih.key(a.readRows()[0].fields['Kode Identitas']);
      const {link,dialog}=await a.getLink(key,'esurvey.bps.go.id');await a.closeDialog(dialog);
      return {link,mode:a.findRow(key).fields.Mode};
    })()`});
    assert.equal(output.exceptionDetails,undefined,JSON.stringify(output.exceptionDetails));
    assert.deepEqual(output.result.value,{link:'https://esurvey.bps.go.id/h/s/test-354',mode:'CAWI'});
    const metrics=await page.evaluate(()=>radixSim);
    assert.equal(metrics.menus,1);assert.equal(metrics.saves,0);assert.equal(metrics.emailSends,0);assert.equal(metrics.messageSends,0);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
});

test('real Radix LIST panel extracts links without opening mode actions or optional table columns',{skip,timeout:30000},async()=>{
  const {browser,page,errors}=await setup('list');
  try {
    await page.evaluate(()=>{
      const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'});};
      window.store={rows:new Map(),job:null};
      chrome.runtime={sendMessage:async msg=>{
        let value;
        if(msg.type==='GET_SETTINGS')value=store.settings;
        else if(msg.type==='SET_SETTINGS'){store.settings=msg.settings;value=store.settings;}
        else if(msg.type==='LATEST')value=store.job?.id;
        else if(msg.type==='CREATE'){store.job={id:'radix-job',context:Fasih.context(location.href),options:msg.options,status:'RUNNING',phase:'INVENTORY',pages:{},visitPages:[],processPages:[],attempted:[],navigating:null};value=store.job;}
        else if(msg.type==='PATCH'){store.job={...store.job,...msg.patch};value=store.job;}
        else if(msg.type==='ROWS'){msg.rows.forEach(r=>store.rows.set(r.key,structuredClone(r)));value=true;}
        else if(msg.type==='CHECKPOINT'){msg.rows.forEach(r=>store.rows.set(r.key,structuredClone(r)));store.job={...store.job,...msg.patch};value=store.job;}
        else if(msg.type==='READ')value={job:store.job,rows:[...store.rows.values()],owned:true};
        else throw new Error(msg.type);
        return {ok:true,value:structuredClone(value)};
      },onMessage:{addListener:()=>{}}};
      window.panelChecks=[];
      const original=Fasih.Adapter.prototype.openMenu;
      Fasih.Adapter.prototype.openMenu=async function(...args){
        const panel=document.getElementById('fasih-cawi-bot').shadowRoot.getElementById('panel');
        panelChecks.push(panel.classList.contains('working')&&panel.getBoundingClientRect().right<350);
        return original.apply(this,args);
      };
    });
    for(const script of ['runner.js','content.js'])await page.addScriptTag({path:path.join(__dirname,'../extension',script)});
    await page.getByRole('button',{name:'Pilot 5 data',exact:true}).click();
    await page.waitForFunction(()=>['PILOT_DONE','PAUSED'].includes(store.job?.status));
    const result=await page.evaluate(()=>({job:store.job,rows:[...store.rows.values()],metrics:radixSim,panelChecks}));
    assert.equal(result.job.status,'PILOT_DONE',result.job.notice);
    assert.equal(result.rows.filter(r=>r.result==='DONE').length,2);assert.equal(result.metrics.menus,2);assert.equal(result.metrics.saves,0);assert.equal(result.metrics.links,2);assert.deepEqual(result.metrics.actions,['Pengaturan Email','Pengaturan Email']);assert.equal(result.metrics.dropdowns,0);
    assert.equal(result.rows.every(r=>!Object.hasOwn(r.fields,'Petugas Saat Ini')&&!Object.hasOwn(r.fields,'Keterangan')),true);
    assert.equal(new URL(page.url()).searchParams.get('view'),'list');assert.equal(result.job.processingView,'list');
    assert.equal(result.metrics.emailSends,0);assert.equal(result.metrics.messageSends,0);assert.ok(result.panelChecks.every(Boolean));assert.deepEqual(errors,[]);
    fs.mkdirSync(path.join(__dirname,'../test-output'),{recursive:true});
    await page.screenshot({path:path.join(__dirname,'../test-output/radix-panel-simulation.png'),fullPage:true});
  }finally{await browser.close();}
});
