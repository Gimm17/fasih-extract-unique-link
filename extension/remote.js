(function(root){
  'use strict';
  const F=root.Fasih;
  function endpoint(value){
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.pathname.endsWith('/api.php'))throw new Error('Alamat server harus HTTPS dan berakhir dengan /api.php.');
    return u.href;
  }
  async function request(config,action,data={}){
    if(!config?.token||!config?.url)throw new F.BotError('Hubungkan server melalui Pengaturan server dahulu.','REMOTE',true);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const response=await fetch(endpoint(config.url),{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+config.token},body:JSON.stringify({...data,action})});
      let json;try{json=await response.json();}catch{throw new Error('Server mengembalikan HTML/non-JSON. Periksa alamat API dan konfigurasi hosting.');}
      if(!response.ok||!json?.ok)throw new F.BotError(json?.error||'Permintaan server gagal.','REMOTE_'+(json?.code||response.status),true);
      return json.value;
    }catch(e){if(e instanceof F.BotError)throw e;throw new F.BotError(e.name==='AbortError'?'Server tidak merespons dalam 15 detik. Hasil lokal dipertahankan.':e.message,'REMOTE_NETWORK',true);}
    finally{clearTimeout(timer);}
  }
  root.FasihRemote={endpoint,request};
  if(typeof module!=='undefined')module.exports=root.FasihRemote;
})(globalThis);
