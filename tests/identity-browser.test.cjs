const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
require('../extension/core.js');require('../extension/identity-input.js');
const F=globalThis.Fasih,X=require('../extension/xlsx.js'),{fields,card,dialog,CODES}=require('./fixtures.cjs');
const playwright=process.env.FASIH_PLAYWRIGHT,exe=process.env.FASIH_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
test('browser: paste/upload Excel, exact search across reloads, pause/resume and retry without repeating saved links', {skip:!playwright||!fs.existsSync(playwright)||!fs.existsSync(exe),timeout:60000},async()=>{
  const browser=await require(playwright).chromium.launch({executablePath:exe,headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],queries=[],clicked=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base='https://fasih-sm.bps.go.id/app/surveys/list-test/period/data?view=list&page=1&perPage=100';
  const missing='7271000000000000 - EC - 1 - 9999',otherMode='7271000000000000 - EC - 1 - 8888',draft='7271000000000000 - EC - 1 - 7777';
  const codes=[CODES[1],CODES[0],missing,otherMode,draft],saved=new Map();let job=null,availableMissing=false,repairedMode=false;
  const scripts=JSON.parse(fs.readFileSync(path.join(__dirname,'../extension/manifest.json'))).content_scripts[0].js;
  try{
    await page.exposeFunction('bridge',async m=>{
      calls.push(m.type+(m.patch?':'+JSON.stringify(m.patch):''));
      if(m.type==='GET_SETTINGS')return {actionDelayMs:50,nextDelayMs:100};
      if(m.type==='GET_SERVER_SETTINGS')return null;
      if(m.type==='SET_SETTINGS')return m.settings;
      if(m.type==='LATEST')return job?.id;
      if(m.type==='READ')return {job,rows:[...saved.values()],owned:true};
      if(m.type==='CREATE'){
        job={id:'queue',context:F.context(page.url()),options:m.options,status:'RUNNING',phase:'PROCESS',pages:{},targetCursor:0,createdAt:new Date().toISOString()};
        for(const [i,code] of m.options.identityList.entries())saved.set(F.key(code),{key:F.key(code),fields:{'Kode Identitas':code,'Urutan Daftar':String(i+1)},inputOrder:i+1,result:'PENDING',stage:'MENUNGGU_PENCARIAN',attempts:0});return job;
      }
      if(m.type==='CLAIM'){job.status='RUNNING';return job;}
      if(m.type==='PATCH'){Object.assign(job,m.patch);return job;}
      if(m.type==='ROWS'){for(const row of m.rows)saved.set(row.key,row);return true;}
      throw Error('Unexpected '+m.type);
    });
    await page.exposeFunction('trackLink',code=>clicked.push(code));
    await page.route('**/*',async route=>{
      const query=new URL(route.request().url()).searchParams.get('search');queries.push(query);
      let rows=query===missing&&!availableMissing?[]:[fields(query||CODES[0],query===otherMode&&!repairedMode?'CAPI':'CAWI',query===draft?'DRAFT':'OPEN')];
      if(query===CODES[1])rows.push(fields(CODES[0],'CAWI')); // A broad search response must still select only its exact target.
      await route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><title>FASIH · Uji daftar kode lokal</title></head><body><h1>Simulasi FASIH</h1><main>'+ (rows.length?rows.map(card).join(''):'<p>No results.</p>')+'</main><button aria-label="Go to next page" disabled>Next</button></body></html>'});
    });
    await page.addInitScript({content:`
      window.chrome={runtime:{sendMessage:async m=>({ok:true,value:await bridge(m)}),onMessage:{addListener:()=>{}}}};
      const original=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){return original.call(this,{...o,mode:'open'});};
      addEventListener('DOMContentLoaded',()=>{
        for(const button of document.querySelectorAll('button[aria-haspopup="menu"]'))button.onkeydown=e=>{
          if(e.key!=='ArrowDown')return;e.preventDefault();const code=button.parentElement.querySelector('button').textContent;
          const menu=document.createElement('div');menu.setAttribute('role','menu');menu.onkeydown=e=>{if(e.key==='Escape')menu.remove();};const action=document.createElement('button');action.setAttribute('role','menuitem');action.textContent='Pengaturan Email';menu.append(action);document.body.append(menu);
          action.onclick=()=>{menu.remove();document.body.insertAdjacentHTML('beforeend',${JSON.stringify(dialog())});const popup=document.querySelector('[role="dialog"]');popup.querySelector('button').onclick=async()=>{await trackLink(code);const input=document.createElement('input');input.value='https://esurvey.bps.go.id/h/s/'+code.replace(/ /g,'');popup.querySelector('div').append(input);};popup.querySelector('[aria-label="Close"]').onclick=()=>popup.remove();};
        };
        ${scripts.map(f=>fs.readFileSync(path.join(__dirname,'../extension',f),'utf8')).join('\n')}
      });
    `});
    await page.goto(base);
    const panel=page.locator('#fasih-cawi-bot'),textarea=panel.locator('#identityCodes');
    await textarea.fill('Kode Identitas\n'+codes.concat(CODES[0]).join('\n'));
    await page.waitForFunction(()=>document.getElementById('fasih-cawi-bot').shadowRoot.getElementById('identityStatus').textContent.includes('5 kode unik'));
    const output=path.join(__dirname,'../test-output');fs.mkdirSync(output,{recursive:true});
    await page.screenshot({path:path.join(output,'identity-panel-desktop.png')});
    await panel.locator('#identityStart').click();
    await page.waitForURL(u=>u.searchParams.get('search')===CODES[1]);
    await page.waitForLoadState('load');
    await panel.locator('#pause').click();
    await page.waitForFunction(()=>document.getElementById('fasih-cawi-bot').shadowRoot.getElementById('state').textContent.includes('Dijeda'));
    assert.equal(clicked.length<=1,true);await panel.locator('#resume').click();
    // Empty-page detection deliberately waits for the adapter timeout before marking NOT FOUND.
    await page.waitForFunction(()=>document.getElementById('fasih-cawi-bot').shadowRoot.getElementById('state').textContent.includes('Ada data yang perlu diperiksa'),{},{timeout:35000});
    assert.equal(job.targetCursor,5);assert.equal(saved.get(F.key(missing)).result,'ERROR');assert.equal(saved.get(F.key(otherMode)).result,'ERROR');assert.equal(saved.get(F.key(draft)).result,'SKIPPED');
    assert.deepEqual(clicked,[CODES[1],CODES[0]]);assert.equal(queries.filter(Boolean).every(q=>codes.includes(q)),true);
    // A manual page reload must restore the persisted list and completed results.
    await page.reload();await panel.locator('#identitySection').evaluate(e=>e.open=true);
    assert.equal(await textarea.inputValue(),codes.join('\n'));
    await page.screenshot({path:path.join(output,'identity-panel-results.png')});
    availableMissing=true;repairedMode=true;await panel.locator('#retry').click();
    await page.waitForFunction(()=>document.getElementById('fasih-cawi-bot').shadowRoot.getElementById('state').textContent.includes('Hasil tersimpan · Selesai'));
    assert.deepEqual(clicked,[CODES[1],CODES[0],missing,otherMode]);assert.equal(saved.get(F.key(draft)).result,'SKIPPED');
    const bookBytes=X.makeWorkbook([{name:'Target',rows:[['Kode Identitas'],[CODES[0]],[CODES[1]],[CODES[0]]]}]);
    await panel.locator('#identityFile').setInputFiles({name:'target.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(bookBytes)});
    await page.waitForFunction(()=>document.getElementById('fasih-cawi-bot').shadowRoot.getElementById('identityStatus').textContent.includes('2 kode unik siap'));
    assert.equal(await textarea.inputValue(),CODES.join('\n'));
    await page.setViewportSize({width:420,height:900});await page.screenshot({path:path.join(output,'identity-panel-small.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
  }catch(e){
    console.error(JSON.stringify({status:job?.status,notice:job?.notice,cursor:job?.targetCursor,queries,errors,rows:[...saved.values()].map(r=>({result:r.result,stage:r.stage,error:r.error})),calls:calls.slice(-15)}));
    await page.screenshot({path:path.join(__dirname,'../test-output/identity-browser-failure.png')}).catch(()=>{});throw e;
  }finally{await browser.close();}
});
