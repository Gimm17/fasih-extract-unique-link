const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
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
