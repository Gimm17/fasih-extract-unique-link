(function (root) {
  'use strict';
  const sourceColumns = ['Kode Identitas', 'Nama Keluarga/Bangunan/Usaha', 'Alamat Prelist',
    'Nomor Urut Bangunan / IDSBR', 'NIB / No. KK', 'Email', 'Skala Usaha / Jenis Prelist',
    'Jumlah Usaha', 'Kode Pos', 'Perubahan SLS', 'IDSBR UMKM SLS Sama', 'Status', 'Mode',
    'Petugas Saat Ini', 'Keterangan'];
  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const normalized = value => text(value).toLocaleLowerCase('id').replace(/\s*\/\s*/g, '/');
  const isOpen = value => text(value).toUpperCase()==='OPEN';
  const mode = value => text(value).toUpperCase();
  const column = value => sourceColumns.find(c => normalized(c) === normalized(value)) || text(value);
  class BotError extends Error {
    constructor(message, code = 'ROW', fatal = false) { super(message); this.name = 'BotError'; this.code = code; this.fatal = fatal; }
  }
  function context(url) {
    const u = new URL(url);
    const m = u.pathname.match(/^\/app\/surveys\/([^/]+)\/([^/]+)\/data\/?$/);
    if (u.origin !== 'https://fasih-sm.bps.go.id' || !m) throw new BotError('Buka halaman Data FASIH.', 'CONTEXT', true);
    const params = [...u.searchParams].filter(([k]) => !['page', 'view'].includes(k)).sort(([a], [b]) => a.localeCompare(b));
    return { scope: m[1] + '/' + m[2], signature: JSON.stringify([u.origin, u.pathname, params]),
      page: Number(u.searchParams.get('page') || 1), view: u.searchParams.get('view') || 'table', url: u.href };
  }
  function identity(value) {
    const code = text(value);
    // Full code must remain a string. Never use only the leading geographical digits.
    if (!/^\d{16}\s*-\s*\S.+/.test(code) || code.includes('…') || code.endsWith('...')) {
      throw new BotError('Kode identitas lengkap tidak terbaca: ' + code, 'IDENTITY', true);
    }
    return code;
  }
  function key(code) { return identity(code).replace(/\s*-\s*/g, '-'); }
  function checkRows(rows, prefix, requireAll = true) {
    if (!rows.length) throw new BotError('Tidak ada assignment yang terbaca. Pastikan login dan tampilan list.', 'DOM', true);
    const seen = new Set();
    for (const row of rows) {
      row.key = key(row.fields['Kode Identitas']);
      if (seen.has(row.key)) throw new BotError('Identitas ganda pada halaman: ' + row.fields['Kode Identitas'], 'DUPLICATE', true);
      seen.add(row.key);
      if (prefix && !row.fields['Kode Identitas'].startsWith(prefix)) {
        throw new BotError('Kode wilayah tidak cocok dengan cakupan ' + prefix + '. Periksa filter FASIH.', 'SCOPE', true);
      }
      const required=requireAll?sourceColumns:['Kode Identitas','Status','Mode'];
      const missing = required.filter(c => !Object.hasOwn(row.fields, c) || (!requireAll&&!text(row.fields[c])));
      if (missing.length) throw new BotError('Kolom belum terbaca: ' + missing.join(', '), 'COLUMNS', true);
      if (!['CAPI', 'PAPI', 'CAWI'].includes(text(row.fields.Mode).toUpperCase())) {
        throw new BotError('Mode tidak dikenali: ' + row.fields.Mode, 'MODE', true);
      }
    }
    return rows;
  }
  function validLink(value, host = 'esurvey.bps.go.id') {
    try {
      const raw=text(value);
      if(raw.includes('…') || raw.includes('...') || decodeURIComponent(raw).includes('…'))return null;
      const u = new URL(raw);
      return u.protocol === 'https:' && u.hostname === host && !u.username && !u.password &&
        u.pathname !== '/' && !u.href.includes('…') && !u.href.includes('...') ? u.href : null;
    } catch { return null; }
  }
  function totals(records) {
    const count = { total: records.length, done: 0, error: 0, skipped: 0, pending: 0 };
    for (const r of records) count[{ DONE: 'done', ERROR: 'error', SKIPPED: 'skipped' }[r.result] || 'pending']++;
    return count;
  }
  function localTime(value) {
    if(!value)return '';
    return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Singapore',dateStyle:'short',timeStyle:'medium'}).format(new Date(value))+' UTC+8';
  }
  function localDate() {return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
  const resultLabel = result => ({DONE:'SELESAI',ERROR:'GAGAL',SKIPPED:'DILEWATI',PENDING:'TERTUNDA'}[result]||result||'TERTUNDA');
  const statusLabel = result => ({RUNNING:'Berjalan',PAUSED:'Dijeda',STOPPED:'Dihentikan',COMPLETE:'Selesai',NEEDS_ATTENTION:'Ada data yang perlu diperiksa',PILOT_DONE:'Pilot selesai'}[result]||result);
  const phaseLabel = result => ({INVENTORY:'Mengumpulkan data',PROCESS:'Mengambil unique link',FINISHED:'Hasil tersimpan'}[result]||result);
  function timings(options={}) {
    const actionDelayMs=options.actionDelayMs??500, nextDelayMs=options.nextDelayMs??1000;
    if(!Number.isFinite(actionDelayMs)||actionDelayMs<50||actionDelayMs>60000||!Number.isFinite(nextDelayMs)||nextDelayMs<0||nextDelayMs>300000)
      throw new BotError('Jeda aksi harus 0,05–60 detik dan jeda antar data 0–300 detik.','SETTINGS');
    return {actionDelayMs,nextDelayMs};
  }
  const api = { sourceColumns, text, normalized, isOpen, mode, column, BotError, context, identity, key, checkRows, validLink, totals,localTime,localDate,resultLabel,statusLabel,phaseLabel,timings };
  root.Fasih = Object.assign(root.Fasih || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
