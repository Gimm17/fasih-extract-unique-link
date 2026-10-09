const fs=require('node:fs'),path=require('node:path');
require('./check.cjs');
require('../extension/core.js');
const {zip}=require('../extension/xlsx.js');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'extension');
const files=fs.readdirSync(dir).sort().filter(f=>fs.statSync(path.join(dir,f)).isFile()).map(f=>[f,new Uint8Array(fs.readFileSync(path.join(dir,f)))]);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
const {version}=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
if(!/^\d+(\.\d+){1,3}$/.test(version))throw new Error('Versi manifest tidak valid untuk nama arsip.');
const target=path.join(root,'dist',`fasih-cawi-link-exporter-v${version}.zip`);
const bytes=Buffer.from(zip(files));
if(fs.existsSync(target)) {
  if(!fs.readFileSync(target).equals(bytes))throw new Error(`ZIP v${version} sudah ada dengan isi berbeda. Naikkan versi sebelum mengemas pembaruan.`);
} else fs.writeFileSync(target,bytes,{flag:'wx'});
console.log(target);
// Publish the same extension archive through the dashboard on every release.
const publicDir=path.join(root,'server/public'),downloadsDir=path.join(publicDir,'downloads');
fs.mkdirSync(downloadsDir,{recursive:true});
fs.copyFileSync(target,path.join(downloadsDir,path.basename(target)));
const indexPath=path.join(publicDir,'index.html');
let index=fs.readFileSync(indexPath,'utf8');
if(!index.includes('id="downloadExtension"'))throw new Error('Tombol unduh ekstensi tidak ditemukan di dashboard.');
index=index.replace(/<a id="downloadExtension"[^>]*>[^<]*<\/a>/,
  `<a id="downloadExtension" class="button-link primary" href="downloads/${path.basename(target)}" download>Unduh ekstensi v${version} (ZIP)</a>`);
fs.writeFileSync(indexPath,index);
// Dashboard uses the same local XLSX writer, never a CDN dependency.
for(const file of ['core.js','xlsx.js'])fs.copyFileSync(path.join(dir,file),path.join(root,'server/public/assets',file));
const serverFiles=[];
function walk(base,prefix='') {
  for(const file of fs.readdirSync(base).sort()){
    if(file==='config.php')continue;
    const full=path.join(base,file),name=prefix+file;
    if(fs.statSync(full).isDirectory())walk(full,name+'/');
    else serverFiles.push([name,new Uint8Array(fs.readFileSync(full))]);
  }
}
walk(path.join(root,'server'));
serverFiles.push(['UPDATE_WILAYAH.md',new Uint8Array(fs.readFileSync(path.join(root,'UPDATE_WILAYAH.md')))],['IMPLEMENTATION_PLAN_WILAYAH.md',new Uint8Array(fs.readFileSync(path.join(root,'IMPLEMENTATION_PLAN_WILAYAH.md')))],['INSTALL.md',new Uint8Array(fs.readFileSync(path.join(root,'INSTALL.md')))],['VERSION.txt',new TextEncoder().encode('FULX '+version+'\n')]);
const serverTarget=path.join(root,'dist',`fulx-cpanel-server-v${version}.zip`),serverBytes=Buffer.from(zip(serverFiles));
if(fs.existsSync(serverTarget)){
  if(!fs.readFileSync(serverTarget).equals(serverBytes))throw new Error(`Paket server v${version} sudah ada dengan isi berbeda. Naikkan versi dahulu.`);
}else fs.writeFileSync(serverTarget,serverBytes,{flag:'wx'});
console.log(serverTarget);
