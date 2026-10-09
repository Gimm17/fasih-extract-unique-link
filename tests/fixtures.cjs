const F=require('../extension/core.js');
const CODES=['7271000000000000 - EC - 1 - 354','7271000000000000 - EC - 1 - 78'];
function fields(code=CODES[0],mode='CAPI',status='OPEN') {
  const f=Object.fromEntries(F.sourceColumns.map(c=>[c,'-']));
  return Object.assign(f,{'Kode Identitas':code,'Nama Keluarga/Bangunan/Usaha':'KELUARGA UJI & <CONTOH>',
    'Alamat Prelist':'ALAMAT UJI', 'NIB / No. KK':'0012345678901234',Mode:mode,Status:status});
}
function table(records) {
  return '<table><thead><tr><th></th>'+F.sourceColumns.map(c=>'<th>'+c+'</th>').join('')+'<th></th></tr></thead><tbody>'+records.map(f=>
    '<tr><td><input type="checkbox"></td>'+F.sourceColumns.map(c=>'<td>'+escape(f[c])+'</td>').join('')+
    '<td><button aria-haspopup="menu" aria-expanded="false"><svg class="tabler-icon-dots-vertical"></svg></button></td></tr>').join('')+'</tbody></table><button aria-label="Go to next page" disabled>Next</button>';
}
function escape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function card(f=fields()) {
  const pairs=F.sourceColumns.slice(1,11).map(c=>`<div class="f:min-w-0"><div class="f:truncate">${c}</div><div class="f:truncate">${escape(f[c])}</div></div>`).join('');
  return `<div class="f:overflow-hidden f:rounded-lg f:border f:bg-card"><div><button type="button" class="f:underline f:truncate">${f['Kode Identitas']}</button><div class="f:capitalize">${f.Status}</div><button aria-haspopup="menu" id="radix-random-id"><svg class="tabler-icon-dots-vertical"></svg></button></div><div class="f:grid f:grid-cols-2">${pairs}</div><div><div class="f:border">${f.Mode}</div></div></div>`;
}
function dialog() {
  return '<section role="dialog"><h2>Pengaturan Email</h2><div><div>Unique Link untuk assignment CAWI</div><button>Dapatkan Unique Link</button></div><button aria-label="Close"><svg class="tabler-icon-x"></svg></button></section>';
}
module.exports={CODES,fields,table,card,dialog};
