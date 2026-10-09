/* Minimal OOXML writer: no CDN, formulas, tracking, or third-party runtime. */
(function (root) {
  'use strict';
  const enc = new TextEncoder();
  const xml = value => String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  function col(n) { let v = ''; for (n++; n; n = Math.floor((n - 1) / 26)) v = String.fromCharCode(65 + (n - 1) % 26) + v; return v; }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc(bytes) { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    const local = [], central = []; let offset = 0;
    const header = (size, values) => { const a = new Uint8Array(size), d = new DataView(a.buffer);
      for (const [p, v, width] of values) width === 2 ? d.setUint16(p, v, true) : d.setUint32(p, v, true); return a; };
    for (const [name, content] of files) {
      const filename = enc.encode(name), data = typeof content === 'string' ? enc.encode(content) : content, c = crc(data);
      const lh = header(30, [[0,0x04034b50,4],[4,20,2],[6,0x800,2],[8,0,2],[12,33,2],
        [14,c,4],[18,data.length,4],[22,data.length,4],[26,filename.length,2]]);
      local.push(lh, filename, data);
      central.push(header(46, [[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x800,2],[10,0,2],[14,33,2],
        [16,c,4],[20,data.length,4],[24,data.length,4],[28,filename.length,2],[42,offset,4]]), filename);
      offset += lh.length + filename.length + data.length;
    }
    const size = central.reduce((a,b) => a+b.length,0);
    const end = header(22, [[0,0x06054b50,4],[8,files.length,2],[10,files.length,2],[12,size,4],[16,offset,4]]);
    const parts = [...local, ...central, end], out = new Uint8Array(parts.reduce((a,b) => a+b.length,0));
    let p = 0; for (const part of parts) { out.set(part,p); p += part.length; } return out;
  }
  function makeWorkbook(sheets) {
    const files = [], types = [], sheetEntries = [], wbRels = [];
    sheets.forEach((sheet, si) => {
      const rows = sheet.rows, links = [], ncols = Math.max(1, ...rows.map(r => r.length));
      if (rows.length > 1048576 || ncols > 16384) throw new Error('Data melebihi kapasitas satu sheet Excel.');
      const height = (row,ri) => ri===0 ? 42 : Math.min(409,Math.max(30,...row.map((v,ci)=>
        Math.ceil(String(v??'').length/(ci===sheet.linkColumn?65:ci===0?39:28))*15+8)));
      const data = rows.map((row, ri) => '<row r="' + (ri+1) + '" ht="'+height(row,ri)+'" customHeight="1">' +
        row.map((v, ci) => {
          const ref = col(ci)+(ri+1), link = ri > 0 && ci === sheet.linkColumn && root.Fasih.validLink(v, sheet.linkHost);
          if (link) links.push({ ref, link });
          const style = ri===0 ? 1 : link ? 3 : ri%2===0 ? 4 : 2;
          if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
          return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
        }).join('') + '</row>').join('');
      const last = col(ncols-1)+Math.max(rows.length,1);
      const columns = Array.from({length:ncols},(_,i) => `<col min="${i+1}" max="${i+1}" width="${i===sheet.linkColumn?65:i===0?39:28}" customWidth="1"/>`).join('');
      const hyperlinks = links.length ? '<hyperlinks>' + links.map((l,i) => `<hyperlink ref="${l.ref}" r:id="rId${i+1}"/>`).join('') + '</hyperlinks>' : '';
      files.push([`xl/worksheets/sheet${si+1}.xml`, declaration + `<worksheet xmlns="${ns}" xmlns:r="${relns}"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="30"/><cols>${columns}</cols><sheetData>${data}</sheetData>` +
        (sheet.filter === false ? '' : `<autoFilter ref="A1:${last}"/>`) + hyperlinks + '</worksheet>']);
      if (links.length) files.push([`xl/worksheets/_rels/sheet${si+1}.xml.rels`, declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        links.map((l,i) => `<Relationship Id="rId${i+1}" Type="${relns}/hyperlink" Target="${xml(l.link)}" TargetMode="External"/>`).join('')+'</Relationships>']);
      sheetEntries.push(`<sheet name="${xml(sheet.name)}" sheetId="${si+1}" r:id="rId${si+1}"/>`);
      wbRels.push(`<Relationship Id="rId${si+1}" Type="${relns}/worksheet" Target="worksheets/sheet${si+1}.xml"/>`);
      types.push(`<Override PartName="/xl/worksheets/sheet${si+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    });
    files.push(['xl/workbook.xml', declaration + `<workbook xmlns="${ns}" xmlns:r="${relns}"><sheets>${sheetEntries.join('')}</sheets></workbook>`]);
    wbRels.push(`<Relationship Id="rId${sheets.length+1}" Type="${relns}/styles" Target="styles.xml"/>`);
    files.push(['xl/_rels/workbook.xml.rels', declaration + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+wbRels.join('')+'</Relationships>']);
    files.push(['_rels/.rels', declaration + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`]);
    files.push(['[Content_Types].xml', declaration + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+types.join('')+'</Types>']);
    files.push(['xl/styles.xml', declaration + `<styleSheet xmlns="${ns}"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><u/><color rgb="FF0563C1"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF244A64"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F5F9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
    return zip(files);
  }
  function exportSheets(job, records) {
    const base = root.Fasih.sourceColumns, extra = [...new Set(records.flatMap(r => Object.keys(r.fields)))].filter(c=>!base.includes(c));
    const audit = ['Mode Awal', 'Mode Akhir', 'Unique Link', 'Hasil Proses', 'Tahap Terakhir', 'Waktu Ambil Data', 'Waktu Ambil Link', 'Halaman Asal', 'Percobaan', 'Pesan Error'];
    const headers = [...base, ...extra, ...audit];
    const data = records.map(r => [...base, ...extra].map(c => Object.hasOwn(r.fields,c) ? r.fields[c] : '').concat([
      r.initialMode, r.finalMode || '', r.link || '', root.Fasih.resultLabel(r.result), r.stage, root.Fasih.localTime(r.capturedAt), root.Fasih.localTime(r.linkAt), r.page, r.attempts || 0, r.error || '']));
    const count = root.Fasih.totals(records);
    return [{ name: 'DATA', rows: [headers, ...data], linkColumn: headers.indexOf('Unique Link'), linkHost: job.options.linkHost },
      { name: 'ERROR', rows: [['Kode Identitas','Nama Keluarga/Bangunan/Usaha','Hasil','Tahap','Alasan'], ...records.filter(r=>['ERROR','SKIPPED'].includes(r.result)).map(r=>[r.fields[base[0]],r.fields[base[1]],root.Fasih.resultLabel(r.result),r.stage,r.error])] },
      { name: 'RINGKASAN', filter: false, rows: [['Keterangan','Nilai'], ['Wilayah',job.options.region],['Prefix wilayah',job.options.prefix],
        ['Survei / periode',job.context.scope],['URL awal',job.context.url],['Tampilan pemrosesan',(job.processingView||job.context.view||'').toUpperCase()],['Kolom tidak tampil','Dibiarkan kosong; data lama yang sudah tersimpan dipertahankan.'],['Mulai',root.Fasih.localTime(job.createdAt)],['Selesai',root.Fasih.localTime(job.finishedAt)],
        ['Status proses',root.Fasih.statusLabel(job.status)],['Tahap',root.Fasih.phaseLabel(job.phase)],['Inventaris lengkap',Boolean(job.inventoryComplete)?'YA':'BELUM'],
        ['Mode pilot',job.options.pilot?'YA':'TIDAK'],['Total terinventaris',count.total],['Selesai',count.done],['Gagal',count.error],['Dilewati',count.skipped],['Tertunda',count.pending],
        ['Salah lewati yang dipulihkan',job.recoveredFalseSkips||0],['Halaman data terakhir',job.lastDataPage||''],['Halaman kosong setelah batas',job.emptyPage||''],['Catatan',job.notice||'']] }];
  }
  root.FasihXlsx = { makeWorkbook, exportSheets, zip };
  if (typeof module !== 'undefined') module.exports = root.FasihXlsx;
})(globalThis);
