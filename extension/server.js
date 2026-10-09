'use strict';
const $=id=>document.getElementById(id),send=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw new Error(r?.error||'Koneksi ekstensi gagal.');return r.value;};
$('form').onsubmit=async e=>{e.preventDefault();try{
  const u=new URL($('url').value);if(u.protocol!=='https:'||!u.pathname.endsWith('/api.php'))throw new Error('Gunakan alamat HTTPS /api.php.');
  const origin=u.origin+'/*';if(!await chrome.permissions.contains({origins:[origin]})&&!await chrome.permissions.request({origins:[origin]}))throw new Error('Izin domain server belum diberikan.');
  $('status').textContent='Menghubungkan…';const info=await send({type:'SAVE_SERVER_SETTINGS',url:u.href,token:$('token').value});$('token').value='';
  $('status').textContent='Terhubung: '+info.worker.name+' · '+info.worker.role+' · '+info.campaign.name+'. Refresh tab FASIH.';
}catch(e){$('status').textContent=e.message;}};
$('disconnect').onclick=async()=>{try{await send({type:'DISCONNECT_SERVER'});$('status').textContent='Koneksi lokal diputus. Data pusat tetap tersedia.';}catch(e){$('status').textContent=e.message;}};
(async()=>{try{const c=await send({type:'GET_SERVER_SETTINGS'});if(c){$('url').value=c.url;$('status').textContent='Tersimpan: '+c.workerName+' · '+c.campaignName+' · '+c.outboxCount+' hasil tertunda.';}else $('status').textContent='Belum terhubung.';}catch(e){$('status').textContent=e.message;}})();
