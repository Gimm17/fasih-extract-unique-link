const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');

test('identity export keeps all targets including missing ones in original input order',async()=>{
  const dom=new JSDOM('<button id="xlsx">Excel</button><button id="json">JSON</button><div id="status"></div><div id="summary"></div>',{url:'chrome-extension://fixture/export.html?job=saved',runScripts:'outside-only'});
  try{
    const w=dom.window,blobs=[];
    const rows=[{key:'b',inputOrder:2,result:'ERROR',stage:'PENCARIAN_TIDAK_DITEMUKAN',fields:{'Kode Identitas':'input second'}},{key:'a',inputOrder:1,result:'DONE',link:'https://esurvey.bps.go.id/h/s/first',fields:{'Kode Identitas':'input first'}}];
    w.chrome={runtime:{sendMessage:async()=>({ok:true,value:{job:{id:'saved-job',options:{region:'Palu',identityList:['input first','input second']},status:'NEEDS_ATTENTION'},rows:structuredClone(rows)}})}};
    w.Fasih={totals:()=>({total:2,done:1,error:1,skipped:0,pending:0}),statusLabel:s=>s,localDate:()=> '2026-10-16'};
    w.Blob=class{constructor(parts){blobs.push(parts[0]);}};w.URL.createObjectURL=()=> 'blob:test';w.HTMLAnchorElement.prototype.click=()=>{};
    w.eval(fs.readFileSync(path.join(__dirname,'../extension/export.js'),'utf8'));await new Promise(r=>setTimeout(r,0));
    w.document.getElementById('json').click();await new Promise(r=>setTimeout(r,0));
    const result=JSON.parse(blobs[0]);assert.deepEqual(result.rows.map(r=>r.inputOrder),[1,2]);assert.equal(result.rows[1].result,'ERROR');assert.equal(result.rows[0].link,rows[1].link);
  }finally{dom.window.close();}
});
test('an already open export page rereads storage and cannot download cached data after full reset',async()=>{
  const dom=new JSDOM('<button id="xlsx" disabled>Excel</button><button id="json" disabled>JSON</button><div id="status"></div><div id="summary"></div>',
    {url:'chrome-extension://fixture/export.html?job=saved',runScripts:'outside-only'});
  const w=dom.window;let reset=false,downloads=0;
  w.chrome={runtime:{sendMessage:async()=>({ok:true,value:reset?{job:undefined,rows:[]}:{job:{id:'saved',options:{region:'Palu'},status:'COMPLETE'},rows:[]}})}};
  w.Fasih={totals:()=>({total:0,done:0,error:0,skipped:0,pending:0}),statusLabel:s=>s};
  w.URL.createObjectURL=()=>{downloads++;return 'blob:test';};
  w.eval(fs.readFileSync(path.join(__dirname,'../extension/export.js'),'utf8'));
  await new Promise(r=>setTimeout(r,0));assert.equal(w.document.getElementById('json').disabled,false);
  reset=true;w.document.getElementById('json').click();await new Promise(r=>setTimeout(r,0));
  assert.equal(downloads,0);assert.equal(w.document.getElementById('json').disabled,true);assert.equal(w.document.getElementById('xlsx').disabled,true);
  assert.match(w.document.getElementById('status').textContent,/Reset full/);dom.window.close();
});
