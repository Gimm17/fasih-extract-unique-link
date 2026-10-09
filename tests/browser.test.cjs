const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {fields,CODES}=require('./fixtures.cjs');
const bundled='C:/Users/BPSAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const chromeExe=process.env.FASIH_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const playwrightPath=process.env.FASIH_PLAYWRIGHT||bundled;
test('browser simulation: actual list panel extracts links with zero mode saves and zero sends',
  {skip:!fs.existsSync(chromeExe)||!fs.existsSync(playwrightPath),timeout:30000},async()=> {
  const {chromium}=require(playwrightPath);
  const browser=await chromium.launch({executablePath:chromeExe,headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    // Every request is fulfilled locally. No test request reaches the real FASIH server.
    await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><title>FASIH SIMULASI LOKAL</title></head><body><h1>FASIH — Simulasi lokal</h1><p>Data fiktif untuk pengujian ekstensi.</p></body></html>'}));
    await page.goto('https://fasih-sm.bps.go.id/app/surveys/simulation/period/data?page=1&perPage=100&view=list');
    await page.addScriptTag({path:path.resolve(__dirname,'../extension/core.js')});
    await page.evaluate(rows=> {
      // Open shadow roots only in this fixture to let the test exercise the actual UI buttons.
      const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'});};
      window.sim={saves:0,emailSends:0,messageSends:0,links:0,exported:0,rows:new Map(),job:null};
      function closeButton(dialog){const close=document.createElement('button');close.setAttribute('aria-label','Close');close.textContent='Close';close.onclick=()=>dialog.remove();dialog.append(close);}
      for(const data of rows) {
        const card=document.createElement('div');card.className='f:overflow-hidden f:border f:bg-card';card.style.cssText='margin:12px;padding:12px;border:1px solid gray;max-width:1000px';
        const code=document.createElement('button');code.className='f:underline';code.textContent=data['Kode Identitas'];card.append(code);
        const status=document.createElement('div');status.className='f:capitalize';status.textContent=data.Status;card.append(status);
        const grid=document.createElement('div');grid.className='f:grid f:grid-cols-2';card.append(grid);
        for(const column of Fasih.sourceColumns.slice(1,11)){
          const field=document.createElement('div'),label=document.createElement('div'),value=document.createElement('div');label.textContent=column;value.textContent=data[column];field.append(label,value);grid.append(field);
        }
        const modeNode=document.createElement('div');modeNode.className='f:border';modeNode.textContent=data.Mode;card.append(modeNode);document.body.append(card);
        const menu=document.createElement('button');menu.setAttribute('aria-haspopup','menu');menu.innerHTML='<svg width="14" height="14" class="tabler-icon-dots-vertical"></svg>⋮';card.append(menu);
        menu.onclick=()=> {
          const portal=document.createElement('div');portal.setAttribute('role','menu');
          for(const item of ['Ganti Mode','Pengaturan Email']) {
            const action=document.createElement('div');action.setAttribute('role','menuitem');action.textContent=item;
            action.onclick=()=> {
              portal.remove();const dialog=document.createElement('section');dialog.setAttribute('role','dialog');
              dialog.style.cssText='position:fixed;top:200px;left:300px;padding:30px;background:white;border:1px solid #ccc;z-index:100';
              const title=document.createElement('h2');title.textContent=item;dialog.append(title);document.body.append(dialog);
              if(item==='Ganti Mode') {
                const combo=document.createElement('button');combo.setAttribute('role','combobox');combo.textContent='Pilih mode yang tersedia';dialog.append(combo);
                combo.onclick=()=> {
                  const option=document.createElement('div');option.setAttribute('role','option');option.textContent='CAWI';document.body.append(option);
                  option.onclick=()=> {combo.textContent='CAWI';option.remove();
                    for(const [i,name] of ['Kirim Email','Kirim Pesan'].entries()) {
                      const field=document.createElement('div'),label=document.createElement('label'),sw=document.createElement('button');
                      sw.id='dynamic-'+i;label.htmlFor=sw.id;label.textContent=name;sw.setAttribute('role','switch');sw.setAttribute('aria-checked',i===0?'true':'false');sw.textContent='Toggle';
                      sw.onclick=()=>sw.setAttribute('aria-checked',sw.getAttribute('aria-checked')==='true'?'false':'true');field.append(label,sw);dialog.append(field);
                    }
                    const save=document.createElement('button');save.textContent='Ubah Mode Pendataan';save.onclick=()=>{
                      const switches=[...dialog.querySelectorAll('[role="switch"]')];
                      if(switches[0].getAttribute('aria-checked')==='true')sim.emailSends++;
                      if(switches[1].getAttribute('aria-checked')==='true')sim.messageSends++;
                      sim.saves++;modeNode.textContent='CAWI';dialog.remove();
                    };dialog.append(save);
                  };
                };
              } else {
                const section=document.createElement('div'),description=document.createElement('div'),get=document.createElement('button');
                description.textContent='Unique Link untuk assignment CAWI';get.textContent='Dapatkan Unique Link';
                get.onclick=()=> {sim.links++;get.remove();const input=document.createElement('input');input.value='https://esurvey.bps.go.id/h/s/fixture-'+data['Kode Identitas'].split('-').at(-1).trim();section.append(input);};
                section.append(description,get);dialog.append(section);
              }
              closeButton(dialog);
            };portal.append(action);
          }document.body.append(portal);
        };
      }
      const next=document.createElement('button');next.setAttribute('aria-label','Go to next page');next.disabled=true;next.textContent='Next';document.body.append(next);
      chrome.runtime={sendMessage:async msg=> {
        const s=sim;let value;
        if(msg.type==='GET_SETTINGS')value=s.settings;
        else if(msg.type==='SET_SETTINGS'){s.settings=msg.settings;value=s.settings;}
        else if(msg.type==='RESET_ALL'){if(s.job?.status==='RUNNING')throw new Error('Reset before stop');s.job=null;s.rows.clear();s.settings=null;value=true;}
        else if(msg.type==='LATEST')value=s.job?.id;
        else if(msg.type==='CREATE'){s.job={id:'fixture-job',context:Fasih.context(location.href),options:msg.options,status:'RUNNING',phase:'INVENTORY',owner:1,createdAt:new Date().toISOString(),pages:{},visitPages:[],processPages:[],attempted:[],navigating:null};value=s.job;}
        else if(msg.type==='PATCH'){s.job={...s.job,...msg.patch};value=s.job;}
        else if(msg.type==='ROWS'){msg.rows.forEach(r=>s.rows.set(r.key,structuredClone(r)));value=true;}
        else if(msg.type==='CHECKPOINT'){msg.rows.forEach(r=>s.rows.set(r.key,structuredClone(r)));s.job={...s.job,...msg.patch};value=s.job;}
        else if(msg.type==='READ')value={job:s.job,rows:[...s.rows.values()],owned:true};
        else if(msg.type==='EXPORT'){s.exported++;value=true;}
        else throw new Error(msg.type);
        return {ok:true,value:structuredClone(value)};
      },onMessage:{addListener:()=>{}}};
    },[fields(CODES[0],'CAWI'),fields(CODES[1],'CAWI')]);
    for(const script of ['adapter.js','runner.js','content.js'])await page.addScriptTag({path:path.resolve(__dirname,'../extension',script)});
    await page.getByRole('button',{name:'Cek data halaman',exact:true}).click();
    await page.getByText('Kartu list siap diproses. Popup akan diuji pada pilot.',{exact:false}).waitFor();
    await page.getByRole('button',{name:'Pilot 5 data',exact:true}).click();
    await page.waitForFunction(()=>window.sim.job?.status==='PILOT_DONE');
    const result=await page.evaluate(()=>({saves:sim.saves,emails:sim.emailSends,messages:sim.messageSends,links:sim.links,
      rows:[...sim.rows.values()].map(r=>({result:r.result,link:r.link,finalMode:r.finalMode}))}));
    assert.equal(result.saves,0);assert.equal(result.emails,0);assert.equal(result.messages,0);assert.equal(result.links,2);
    assert.equal(result.rows.every(r=>r.result==='DONE'&&r.finalMode==='CAWI'&&r.link),true);
    // Reproduce the user's case: inspect again after a job is already saved/restored in the panel.
    await page.getByRole('button',{name:'Cek data halaman',exact:true}).click();
    const diagnostic=page.getByRole('status');assert.equal(await diagnostic.isVisible(),true);
    assert.match(await diagnostic.textContent(),/Kartu terbaca: 2/);
    assert.equal(await page.evaluate(()=>sim.links),2);
    await page.locator('#fasih-cawi-bot #prefix').fill('bad');
    await page.getByRole('button',{name:'Cek data halaman',exact:true}).click();
    assert.match(await diagnostic.textContent(),/Isi awalan kode wilayah/);
    await page.locator('#fasih-cawi-bot #prefix').fill('7271');
    await page.getByRole('button',{name:'Ekspor Excel / backup',exact:true}).click();
    assert.equal(await page.evaluate(()=>sim.exported),1);
    fs.mkdirSync(path.resolve(__dirname,'../test-output'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../test-output/panel-simulation.png'),fullPage:true});
    // Reset during extraction must finish stopping/closing the popup before clearing records.
    await page.getByRole('button',{name:'Pilot 5 data',exact:true}).click();
    await page.waitForFunction(()=>sim.links===3);
    await page.getByRole('button',{name:'Reset full',exact:true}).click();
    await page.getByRole('button',{name:'Hapus semua data lokal',exact:true}).click();
    await page.getByText('Reset full selesai.',{exact:false}).waitFor();
    assert.deepEqual(await page.evaluate(()=>({job:sim.job,rows:sim.rows.size,settings:sim.settings,links:sim.links,dialogs:document.querySelectorAll('[role="dialog"]').length})),
      {job:null,rows:0,settings:null,links:3,dialogs:0});
    assert.equal(await page.locator('#fasih-cawi-bot #actionDelay').inputValue(),'0.50');
    assert.equal(await page.locator('#fasih-cawi-bot #nextDelay').inputValue(),'1.00');
  } finally {await browser.close();}
});
