const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'),'utf8'));
const project=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
if(project.version!==manifest.version)throw new Error('Versi package.json dan manifest.json harus sama.');
for(const file of fs.readdirSync(path.join(root,'extension')).filter(f=>f.endsWith('.js'))) {
  const r=spawnSync(process.execPath,['--check',path.join(root,'extension',file)],{encoding:'utf8'});
  if(r.status)throw new Error(r.stderr);
}
for(const file of [...manifest.content_scripts.flatMap(c=>c.js),manifest.background.service_worker])if(!fs.existsSync(path.join(root,'extension',file)))throw new Error('Missing '+file);
console.log('Manifest and all extension JavaScript syntax OK.');
for(const file of ['server/public/dashboard.js','extension/server-runner.js','extension/remote.js']){
  const r=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});if(r.status)throw new Error(r.stderr);
}
const php=fs.existsSync(path.join(root,'.tools/php/php.exe'))?path.join(root,'.tools/php/php.exe'):'php';
let available=true;
for(const file of ['server/public/api.php','server/public/bootstrap.php','server/public/install.php','server/private/Service.php','server/private/TerritoryService.php','server/private/migrate.php','server/private/config.example.php']){
  const r=spawnSync(php,['-l',path.join(root,file)],{encoding:'utf8'});
  if(r.error?.code==='ENOENT'){available=false;break;}if(r.status)throw new Error(r.stderr||r.stdout);
}
console.log(available?'PHP server syntax OK.':'PHP lint skipped: install a local PHP runtime to validate server syntax.');
