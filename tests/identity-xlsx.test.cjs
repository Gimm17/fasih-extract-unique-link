const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),{deflateRawSync}=require('node:zlib');
require('../extension/core.js');require('../extension/identity-input.js');
const F=globalThis.Fasih,{zip}=require('../extension/xlsx.js'),{CODES}=require('./fixtures.cjs');
const dom=new JSDOM('');globalThis.DOMParser=dom.window.DOMParser;
function compressedZip(files){
  // Start with the production ZIP writer, then replace stored entries with raw DEFLATE.
  const original=Buffer.from(zip(files.map(([name,xml])=>[name,new TextEncoder().encode(xml)])));
  const locals=[],central=[];let p=0,offset=0;
  while(original.readUInt32LE(p)===0x04034b50){
    const n=original.readUInt16LE(p+26),len=original.readUInt32LE(p+18),name=original.subarray(p+30,p+30+n),body=original.subarray(p+30+n,p+30+n+len),data=deflateRawSync(body);
    const header=Buffer.from(original.subarray(p,p+30));header.writeUInt16LE(8,8);header.writeUInt32LE(data.length,18);
    const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(8,10);directory.writeUInt32LE(original.readUInt32LE(p+14),16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(len,24);directory.writeUInt16LE(n,28);directory.writeUInt32LE(offset,42);
    locals.push(header,name,data);central.push(directory,name);offset+=30+n+data.length;p+=30+n+len;
  }
  const c=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(c.length,12);end.writeUInt32LE(offset,16);return new Uint8Array(Buffer.concat([...locals,c,end]));
}
function fixture(sheet,compressed=true){
  const files=[['xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Petunjuk" r:id="a"/><sheet name="Target" r:id="b"/></sheets></workbook>'],['xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="a" Target="worksheets/sheet1.xml"/><Relationship Id="b" Target="/xl/worksheets/sheet2.xml"/></Relationships>'],['xl/sharedStrings.xml','<sst><si><t>Kode Identitas</t></si><si><r><t>'+CODES[0].slice(0,16)+'</t></r><r><t>'+CODES[0].slice(16)+'</t></r></si></sst>'],['xl/worksheets/sheet1.xml','<worksheet><sheetData><row><c r="A1" t="inlineStr"><is><t>Petunjuk saja</t></is></c></row></sheetData></worksheet>'],['xl/worksheets/sheet2.xml',sheet]];
  return compressed?compressedZip(files):zip(files.map(([name,xml])=>[name,new TextEncoder().encode(xml)]));
}
const sheet='<worksheet><sheetData><row r="1"><c r="B1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Kolom lain diabaikan</t></is></c><c r="B2" t="s"><v>1</v></c></row><row r="4"><c r="B4" t="inlineStr"><is><t>'+CODES[1]+'</t></is></c></row><row r="5"><c r="B5" t="s"><v>1</v></c></row></sheetData></worksheet>';
for(const compressed of [true,false])test('Excel '+(compressed?'DEFLATE':'stored')+': shared/rich/inline strings, selected sheet and exact column with blanks and duplicates',async()=>{
  const book=await F.readIdentityWorkbook(fixture(sheet,compressed));assert.deepEqual(book.sheets,['Petunjuk','Target']);
  await assert.rejects(()=>book.identities(0),/kolom/i);const parsed=await book.identities(1);assert.deepEqual(parsed.codes,CODES);assert.equal(parsed.duplicates,1);
});
test('Excel rejects formulas in identity cells, malformed archives, oversized and invalid identity cells',async()=>{
  const book=await F.readIdentityWorkbook(fixture(sheet.replace('<v>1</v>','<f>"code"</f><v>1</v>')));await assert.rejects(()=>book.identities(1),/rumus/i);
  await assert.rejects(()=>F.readIdentityWorkbook(new Uint8Array([1,2,3])),/xlsx/i);
  await assert.rejects(()=>F.readIdentityWorkbook(new Uint8Array(10*1024*1024+1)),/10 MB/);
  const bad=await F.readIdentityWorkbook(fixture(sheet.replace(CODES[1],'7271…')));await assert.rejects(()=>bad.identities(1),/tidak valid/);
});
