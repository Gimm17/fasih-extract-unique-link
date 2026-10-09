const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {indexedDB}=require('fake-indexeddb'),{randomUUID}=require('node:crypto');
const {fields}=require('./fixtures.cjs');
const folder=path.resolve(__dirname,'../extension');
test('service-worker bridge persists results, scopes access and prevents competing tabs',async()=> {
  let listener;const openTabs=new Map([[1,{id:1,url:'https://fasih-sm.bps.go.id/app/surveys/a/b/data?page=1&perPage=100&view=table'}]]);
  const ctx=vm.createContext({indexedDB,URL,Date,Set,Map,console,crypto:{randomUUID},
    chrome:{runtime:{id:'fixture-extension',getURL:f=>'chrome-extension://fixture-extension/'+f,onMessage:{addListener:fn=>listener=fn}},
      tabs:{get:async id=>{if(!openTabs.has(id))throw new Error('closed');return openTabs.get(id);},create:async()=>{},query:async()=>[...openTabs.values()],sendMessage:async()=>{}},action:{onClicked:{addListener:()=>{}}}}});
  ctx.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(folder,file),'utf8'),ctx));
  vm.runInContext(fs.readFileSync(path.join(folder,'background.js'),'utf8'),ctx);
  const sender=id=>({id:'fixture-extension',tab:{id},url:openTabs.get(1).url});
  const call=(msg,s=sender(1))=>new Promise(resolve=>listener(msg,s,resolve));
  const created=await call({type:'CREATE',options:{pilot:true,prefix:'7271',linkHost:'esurvey.bps.go.id'}});assert.equal(created.ok,true);const id=created.value.id;
  assert.equal(created.value.context.view,'list');assert.equal(new URL(created.value.context.url).searchParams.get('view'),'list');
  const f=fields(),key=ctx.Fasih.key(f['Kode Identitas']);
  assert.equal((await call({type:'CHECKPOINT',id,patch:{pages:{1:key}},rows:[{key,fields:f,stage:'DATA_TERSIMPAN'}]})).ok,true);
  assert.equal((await call({type:'READ',id})).value.rows[0].fields['NIB / No. KK'],'0012345678901234');
  assert.equal((await call({type:'CLAIM',id},sender(2))).ok,false);
  assert.equal((await call({type:'CREATE',options:{}})).ok,false);
  const different={...sender(1),url:'https://fasih-sm.bps.go.id/app/surveys/different/period/data'};
  assert.equal((await call({type:'READ',id},different)).ok,false);
  const hostile={id:'other-extension',tab:{id:1},url:sender(1).url};
  assert.equal((await call({type:'READ',id},hostile)).ok,false);
  const exportSender={id:'fixture-extension',url:'chrome-extension://fixture-extension/export.html?job='+id};
  assert.equal((await call({type:'READ',id},exportSender)).ok,true);
  assert.equal((await call({type:'PATCH',id,patch:{status:'COMPLETE'}},exportSender)).ok,false);
  assert.equal(created.value.options.actionDelayMs,500);assert.equal(created.value.options.nextDelayMs,1000);
  assert.equal((await call({type:'SET_SETTINGS',settings:{actionDelayMs:750,nextDelayMs:1500}})).ok,true);
  assert.equal((await call({type:'GET_SETTINGS'})).value.actionDelayMs,750);
  assert.equal((await call({type:'SET_SETTINGS',settings:{actionDelayMs:-1}})).ok,false);
  assert.equal((await call({type:'RESET_ALL'},exportSender)).ok,false);
  assert.equal((await call({type:'RESET_ALL'},hostile)).ok,false);
  assert.equal((await call({type:'RESET_ALL'})).ok,false); // Running job in an open tab.
  await call({type:'PATCH',id,patch:{status:'STOPPED'}});
  assert.equal((await call({type:'RESET_ALL'})).ok,true);
  assert.equal((await call({type:'LATEST'})).value,undefined);
  assert.equal((await call({type:'GET_SETTINGS'})).value,undefined);
  assert.equal((await call({type:'READ',id},exportSender)).value.rows.length,0);
});
