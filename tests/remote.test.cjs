const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {IDBFactory}=require('fake-indexeddb'),crypto=require('node:crypto').webcrypto;const {fields}=require('./fixtures.cjs');
test('worker bridge keeps failed uploads in durable outbox, fences callers and flushes idempotently',async()=>{
 let listener,offline=false;const sent=[],folder=path.resolve(__dirname,'../extension');
 const url='https://fasih-sm.bps.go.id/app/surveys/remote/period/data?page=1&perPage=100&view=list';
 const ctx=vm.createContext({indexedDB:new IDBFactory(),URL,Date,Set,Map,console,crypto,TextEncoder,AbortController,setTimeout,clearTimeout,
 fetch:async(endpoint,opts)=>{if(offline)throw Error('offline');const data=JSON.parse(opts.body);sent.push(data);return {ok:true,status:200,json:async()=>({ok:true,value:data.action==='worker_info'?{worker:{id:'worker',name:'Komputer 1'},campaign:{id:'project',name:'FULX'}}:{saved:true}})};},
 chrome:{runtime:{id:'fixture-extension',getURL:f=>'chrome-extension://fixture-extension/'+f,onMessage:{addListener:fn=>listener=fn}},tabs:{get:async()=>({id:1,url}),create:async()=>{},query:async()=>[],sendMessage:async()=>{}},action:{onClicked:{addListener:()=>{}}}}});
 ctx.importScripts=(...files)=>files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(folder,f),'utf8'),ctx));vm.runInContext(fs.readFileSync(path.join(folder,'background.js'),'utf8'),ctx);
 const sender={id:'fixture-extension',url,tab:{id:1}},configSender={id:sender.id,url:'chrome-extension://fixture-extension/server.html'};
 const call=(m,s=sender)=>new Promise(resolve=>listener(m,s,resolve));
 const settings={type:'SAVE_SERVER_SETTINGS',url:'https://fulx.pinnhost.my.id/api.php',token:'a'.repeat(64)};
 assert.equal((await call(settings)).ok,false);assert.equal((await call(settings,{...configSender,url:configSender.url+'.evil'})).ok,false);
 assert.equal((await call(settings,configSender)).ok,true);
 const sanitized=(await call({type:'GET_SERVER_SETTINGS'})).value;assert.equal(sanitized.workerName,'Komputer 1');assert.equal('token' in sanitized,false);
 assert.equal((await call({type:'CREATE',options:{}})).ok,false);
 assert.throws(()=>ctx.FasihRemote.endpoint('http://fulx.pinnhost.my.id/api.php'),/HTTPS/);assert.throws(()=>ctx.FasihRemote.endpoint('https://user:pass@fulx.pinnhost.my.id/api.php'),/HTTPS/);
 const job=(await call({type:'CREATE',options:{server:{mode:'WORK'}}})).value;
 const f=fields(undefined,'CAWI'),record={key:ctx.Fasih.key(f['Kode Identitas']),fields:f,result:'DONE',link:'https://esurvey.bps.go.id/h/s/saved',stage:'SELESAI'};
 const checkpoint={type:'REMOTE',id:job.id,action:'checkpoint',data:{page:1,claimToken:'owned',session:'spoof',record}};
 assert.equal((await call(checkpoint,{...sender,tab:{id:2}})).ok,false);
 offline=true;assert.equal((await call(checkpoint)).ok,false);assert.equal((await call({type:'GET_SERVER_SETTINGS'})).value.outboxCount,1);
 await call({type:'PATCH',id:job.id,patch:{status:'PAUSED'}});
 assert.equal((await call({type:'RESET_ALL'})).ok,false);assert.equal((await call(settings,configSender)).ok,false);
 offline=false;assert.equal((await call({type:'REMOTE_FLUSH'})).value.synced,1);
 assert.equal(sent.at(-1).session,job.id);assert.equal(sent.at(-1).record.link,record.link);assert.equal((await call({type:'GET_SERVER_SETTINGS'})).value.outboxCount,0);
 assert.equal((await call({type:'REMOTE',id:job.id,action:'reset',data:{}})).ok,false);
 assert.equal((await call({type:'RESET_ALL'})).ok,true);
});
