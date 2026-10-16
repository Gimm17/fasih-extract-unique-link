/* Identity-list input and bounded, local OOXML reading. No workbook code is executed. */
(function(root){
  'use strict';
  const F=root.Fasih,limit=10000,maxFile=10*1024*1024,maxXml=32*1024*1024;
  const fail=message=>{throw new F.BotError(message,'INPUT');};
  function parseIdentityList(value){
    const codes=[],seen=new Set();let duplicates=0;
    const lines=String(value??'').replace(/^\uFEFF/,'').split(/\r\n|\n|\r/);
    for(let i=0;i<lines.length;i++){
      const code=F.text(lines[i]);if(!code||/^kode\s+identitas$/i.test(code))continue;
      let key;try{key=F.key(code);}catch{fail('Kode Identitas tidak valid pada baris '+(i+1)+': '+code);}
      if(seen.has(key)){duplicates++;continue;}seen.add(key);codes.push(code);
      if(codes.length>limit)fail('Maksimal '+limit.toLocaleString('id')+' kode per daftar.');
    }
    if(!codes.length)fail('Daftar Kode Identitas kosong.');
    return {codes,duplicates};
  }
  function xml(value){
    if(/<!DOCTYPE|<!ENTITY/i.test(value))fail('XML Excel tidak didukung.');
    const doc=new root.DOMParser().parseFromString(value,'application/xml');
    if(doc.querySelector('parsererror'))fail('Struktur XML Excel tidak valid.');return doc;
  }
  const elements=(node,name)=>[...node.getElementsByTagNameNS('*',name)];
  async function workbook(buffer){
    const bytes=new Uint8Array(buffer);if(bytes.length>maxFile)fail('Ukuran Excel maksimal 10 MB.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dec=new TextDecoder();
    let end=-1;
    for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(view.getUint32(p,true)===0x06054b50&&p+22+view.getUint16(p+20,true)===bytes.length){end=p;break;}
    if(end<0)fail('Gunakan file Excel .xlsx yang valid, bukan .xls atau file berpassword.');
    const count=view.getUint16(end+10,true),directory=view.getUint32(end+16,true),size=view.getUint32(end+12,true);
    if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||count===65535||count>5000||directory+size>end)fail('Format arsip Excel tidak didukung.');
    const entries=new Map();let pos=directory,total=0;
    for(let i=0;i<count;i++){
      if(pos+46>end||view.getUint32(pos,true)!==0x02014b50)fail('Direktori Excel rusak.');
      const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),packed=view.getUint32(pos+20,true),length=view.getUint32(pos+24,true),names=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
      const name=dec.decode(bytes.subarray(pos+46,pos+46+names));
      total+=length;if(flags&1||![0,8].includes(method)||total>maxXml||offset+30>directory||pos+46+names+extra+comment>end||entries.has(name))fail('Excel terlalu besar, terenkripsi, atau tidak didukung.');
      entries.set(name,{method,packed,length,offset});pos+=46+names+extra+comment;
    }
    const cache=new Map();
    async function read(name){
      if(cache.has(name))return cache.get(name);
      const entry=entries.get(name);if(!entry)fail('Bagian Excel tidak ditemukan: '+name);
      const {offset,method,packed,length}=entry;
      if(view.getUint32(offset,true)!==0x04034b50)fail('Isi arsip Excel rusak.');
      const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
      if(start+packed>directory)fail('Isi arsip Excel tidak lengkap.');
      let data=bytes.subarray(start,start+packed);
      if(method===8){
        if(!root.DecompressionStream)fail('Perbarui Chrome untuk membaca Excel, atau gunakan tempel daftar kode.');
        const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks=[];let n=0;
        try{while(true){const part=await reader.read();if(part.done)break;n+=part.value.length;if(n>length||n>maxXml){await reader.cancel();fail('Isi Excel melebihi batas.');}chunks.push(part.value);}}
        finally{reader.releaseLock();}
        data=new Uint8Array(n);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}
      }
      if(data.length!==length)fail('Ukuran isi Excel tidak cocok.');
      const result=xml(dec.decode(data));cache.set(name,result);return result;
    }
    const book=await read('xl/workbook.xml'),rels=await read('xl/_rels/workbook.xml.rels');
    const relation=new Map(elements(rels,'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
    const sheets=elements(book,'sheet').map(s=>{
      const id=s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||s.getAttributeNS('http://purl.oclc.org/ooxml/officeDocument/relationships','id');
      const target=relation.get(id);if(!target)fail('Relasi sheet Excel tidak valid.');
      const file=new URL(target,'https://xlsx.invalid/xl/workbook.xml');
      if(file.origin!=='https://xlsx.invalid'||!file.pathname.startsWith('/xl/')||!file.pathname.endsWith('.xml'))fail('Lokasi sheet Excel tidak valid.');
      return {name:s.getAttribute('name'),file:file.pathname.slice(1)};
    });
    if(!sheets.length)fail('Excel tidak memiliki sheet.');
    let strings=[];
    if(entries.has('xl/sharedStrings.xml'))strings=elements(await read('xl/sharedStrings.xml'),'si').map(s=>elements(s,'t').map(t=>t.textContent).join(''));
    async function identities(index=0){
      if(!sheets[index])fail('Pilih sheet Excel.');
      const rows=elements(await read(sheets[index].file),'row');let column=null,header=-1;
      const cells=row=>elements(row,'c');
      const value=c=>{const raw=elements(c,'v')[0]?.textContent||'';return c.getAttribute('t')==='s'?strings[Number(raw)]??'':c.getAttribute('t')==='inlineStr'?elements(c,'t').map(t=>t.textContent).join(''):raw;};
      for(let i=0;i<Math.min(rows.length,20);i++){
        const matches=cells(rows[i]).filter(c=>/^kode\s+identitas$/i.test(F.text(value(c))));
        if(matches.length>1)fail('Ada beberapa kolom Kode Identitas pada sheet ini.');
        if(matches.length){column=matches[0].getAttribute('r')?.match(/^[A-Z]+/)?.[0];header=i;break;}
      }
      if(!column)fail('Kolom Kode Identitas tidak ditemukan dalam 20 baris pertama. Pilih sheet lain atau tambahkan judul kolom.');
      const codes=[];
      for(const row of rows.slice(header+1)){
        const cell=cells(row).find(c=>c.getAttribute('r')?.match(/^[A-Z]+/)?.[0]===column);if(!cell)continue;
        if(elements(cell,'f').length)fail('Kode Identitas harus berupa teks, bukan rumus. Baris '+row.getAttribute('r')+'.');
        const code=F.text(value(cell));if(code)codes.push(code);
      }
      return {...parseIdentityList(codes.join('\n')),sheet:sheets[index].name};
    }
    return {sheets:sheets.map(s=>s.name),identities};
  }
  F.parseIdentityList=parseIdentityList;F.readIdentityWorkbook=workbook;
})(globalThis);
