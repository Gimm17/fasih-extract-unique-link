const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const F=require('../extension/core.js'),X=require('../extension/xlsx.js');
const {fields,CODES}=require('./fixtures.cjs');
test('Excel is independently readable, preserves 16-digit identifiers and links, and never creates formulas from source text',()=> {
  const job={options:{region:'Kota Palu',prefix:'7271',linkHost:'esurvey.bps.go.id',pilot:false},context:{scope:'survey/period',url:'https://fasih-sm.bps.go.id/'},status:'COMPLETE',phase:'FINISHED',inventoryComplete:true,createdAt:'2026-10-08T06:00:00Z'};
  const f=fields(CODES[0],'CAWI');f['Nama Keluarga/Bangunan/Usaha']='=HYPERLINK("https://example.com","formula")';
  const rows=[{fields:f,initialMode:'CAPI',finalMode:'CAWI',result:'DONE',stage:'SELESAI',link:'https://esurvey.bps.go.id/h/s/token?x=1&y=2',page:1,attempts:1}];
  const sheets=X.exportSheets(job,rows), bytes=X.makeWorkbook(sheets);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fasih-xlsx-test-')),file=path.join(dir,'verification.xlsx');fs.writeFileSync(file,bytes);
  const python=process.env.FASIH_PYTHON||'C:/Users/BPSAdmin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
  const result=spawnSync(python,[path.join(__dirname,'verify_xlsx.py'),file],{encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout,/Workbook read-back OK/);
  // Temporary fixtures are created under an explicit test directory only.
  fs.rmSync(dir,{recursive:true});
});

test('list export leaves absent optional columns blank while retaining the unique link and captured source values',()=> {
  const job={options:{region:'Kota Palu',prefix:'7271',linkHost:'esurvey.bps.go.id'},context:{scope:'survey/period',url:'https://fasih-sm.bps.go.id/',view:'list'},processingView:'list'};
  const f=fields(CODES[0],'CAWI');delete f['Petugas Saat Ini'];delete f.Keterangan;
  const rows=[{fields:f,initialMode:'CAPI',finalMode:'CAWI',result:'DONE',stage:'SELESAI',link:'https://esurvey.bps.go.id/h/s/list-token',page:1}];
  const sheets=X.exportSheets(job,rows),[headers,data]=sheets[0].rows;
  assert.equal(data[headers.indexOf('Petugas Saat Ini')],'');assert.equal(data[headers.indexOf('Keterangan')],'');
  assert.equal(data[headers.indexOf('Unique Link')],rows[0].link);assert.equal(data[headers.indexOf('NIB / No. KK')],'0012345678901234');
  assert.equal(sheets[2].rows.find(r=>r[0]==='Tampilan pemrosesan')[1],'LIST');
});
