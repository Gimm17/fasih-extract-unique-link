'use strict';
let data;
function download(bytes,type,name) {
  const url=URL.createObjectURL(new Blob([bytes],{type}));
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function filename(ext) {
  const region=data.job.options.region.replace(/[^a-z0-9]+/gi,'-');
  return `FASIH-${region}-${Fasih.localDate()}-${data.job.id.slice(0,8)}.${ext}`;
}
async function refreshData() {
  const id=new URL(location.href).searchParams.get('job');
  const result=await chrome.runtime.sendMessage({type:'READ',id});
  if(!result?.ok || !result.value?.job) {
    data=null;for(const name of ['xlsx','json'])document.getElementById(name).disabled=true;
    throw new Error(result?.error||'Hasil tidak tersedia. Progres mungkin sudah dihapus lewat Reset full.');
  }
  data=result.value;data.rows.sort((a,b)=>a.page-b.page || a.key.localeCompare(b.key));
}
document.getElementById('xlsx').onclick=async()=> {
  try {
    await refreshData();
    const bytes=FasihXlsx.makeWorkbook(FasihXlsx.exportSheets(data.job,data.rows));
    download(bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',filename('xlsx'));
    document.getElementById('status').textContent='Excel dibuat. Periksa unduhan Chrome.';
  } catch(e) { document.getElementById('status').textContent=e.message; }
};
document.getElementById('json').onclick=async()=>{try{await refreshData();download(JSON.stringify(data,null,2),'application/json',filename('json'));}catch(e){document.getElementById('status').textContent=e.message;}};
(async()=> {
  try {
    await refreshData();
    const c=Fasih.totals(data.rows);
    document.getElementById('status').textContent=`${data.job.options.region} · ${Fasih.statusLabel(data.job.status)}`;
    document.getElementById('summary').textContent=`Inventaris ${c.total} · Selesai ${c.done} · Gagal ${c.error} · Dilewati ${c.skipped} · Tertunda ${c.pending}`;
    for(const id of ['xlsx','json']) document.getElementById(id).disabled=false;
  } catch(e) {document.getElementById('status').textContent=e.message;}
})();
