const test=require('node:test'),assert=require('node:assert/strict');
global.indexedDB=require('fake-indexeddb').indexedDB;
const store=require('../extension/storage.js');
test('inventory rows and page checkpoint are atomic and survive store reads',async()=> {
  const job={id:'durable',context:{scope:'survey/period'},pages:{},status:'RUNNING'};
  await store.create(job);
  await store.checkpoint(job.id,{pages:{1:'signature'}},[{key:'full-code',fields:{'NIB / No. KK':'0012345678901234'},stage:'DATA_TERSIMPAN'}]);
  assert.equal(await store.latest('survey/period'),job.id);
  assert.equal((await store.getJob(job.id)).pages[1],'signature');
  assert.equal((await store.getRows(job.id))[0].fields['NIB / No. KK'],'0012345678901234');
  await store.patchJob(job.id,{status:'PAUSED'});assert.equal((await store.getRows(job.id)).length,1);
});

test('full reset atomically clears every survey, row, latest pointer and setting while the database remains usable',async()=>{
  for(const id of ['reset-a','reset-b']){
    await store.create({id,context:{scope:id},status:'STOPPED'});await store.putRows(id,[{key:'row-'+id,result:'DONE',link:'local-test'}]);
  }
  await store.setSettings({actionDelayMs:750,nextDelayMs:1500});assert.equal((await store.settings()).actionDelayMs,750);
  await store.reset();assert.deepEqual(await store.allJobs(),[]);assert.equal(await store.settings(),undefined);
  for(const id of ['reset-a','reset-b']){assert.equal(await store.latest(id),undefined);assert.deepEqual(await store.getRows(id),[]);}
  const job={id:'after-reset',context:{scope:'new'},status:'STOPPED'};await store.create(job);assert.equal(await store.latest('new'),job.id);
});
