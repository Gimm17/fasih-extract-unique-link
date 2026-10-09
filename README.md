# FULX — FASIH Unique Link eXtractor

**v0.3.1** · ekstensi Chrome + server PHP/MySQL + dashboard untuk 5 komputer.

Ekstraksi assignment **OPEN yang sudah CAWI**, pada **view=list**. Perubahan mode, pengiriman email/pesan, dan save mode tidak dijalankan. Kolom opsional yang tidak tampil boleh kosong. Default jeda aksi 0,50 detik; antar data 1 detik, bisa diatur melalui panel.

## Wilayah Kota Palu

Batas 1.000 FASIH diatasi melalui dropdown kecamatan → desa, dengan pemecahan SLS/SUBSLS bila perlu. Inventaris dan ekstraksi menggunakan resep filter yang sama. Dashboard memiliki Progres wilayah, rekap unik, pemetaan data lama, dan penguncian desa per komputer. [UPDATE_WILAYAH.md](UPDATE_WILAYAH.md) menjelaskan Git pull, migrasi tanpa reset, dan urutan menjalankan lima komputer.

## Paket distribusi

- `dist/fasih-cawi-link-exporter-v0.3.1.zip` — ekstensi siap Load unpacked setelah diekstrak.
- `dist/fulx-cpanel-server-v0.3.1.zip` — dashboard dan backend untuk **fulx.pinnhost.my.id**.
- [INSTALL.md](INSTALL.md) — panduan cPanel, database, 5 token komputer, pemulihan, dan ekspor.
- [DEPLOY_CPANEL_GIT.md](DEPLOY_CPANEL_GIT.md) — pemasangan lewat Terminal cPanel dengan git clone, pembaruan git pull, backup konfigurasi, dan rollback.

Versi ZIP lama dipertahankan. Paket server tidak berisi credential, hasil pengguna, runtime pengembang, atau database simulasi.

## Pasang/perbarui ekstensi

1. Ekstrak ZIP ke folder permanen, atau gunakan folder `extension` proyek ini.
2. Buka `chrome://extensions`, aktifkan Developer mode, pilih Load unpacked dan folder yang berisi manifest.json.
3. Jika sudah terpasang, perbarui folder pemasangan yang sama, klik Reload, lalu refresh FASIH. Pastikan panel **FULX v0.3.1**.
4. Login FASIH, gunakan view=list dan 100 kartu per halaman. Filter, pencarian dan urutan data harus sesuai proyek.

## Pekerjaan bersama pada server

1. Pasang backend sesuai INSTALL.md. Pilih **PHP 8.3 + PDO MySQL**. Tidak perlu Node di hosting.
2. Buat proyek wilayah **Kota Palu**, target **11649**, prefix **7271**. Pada proyek lama, aktifkan mode wilayah melalui Kelola proyek setelah menghentikan komputer dan menyinkronkan hasil.
3. Buat 5 token berbeda; satu komputer menjadi Koordinator, empat Pelaksana.
4. Masukkan API `https://fulx.pinnhost.my.id/api.php` dan token masing-masing pada Pengaturan server ekstensi.
5. Koordinator klik **Inventaris ke server**; tunggu total cocok dan proyek Siap.
6. Kelima komputer klik **Mulai tugas server**. Server memberikan desa/partisi berbeda. Ekstensi menerapkan filter lalu menjalankan halaman dalam wilayah tersebut.
7. Pantau dashboard: pembaruan 3 detik, status komputer, total/selesai/gagal/tertunda, paket Review, laju dan estimasi.
8. Unduh **Excel gabungan** atau backup JSON dari Data & hasil.

Identitas lengkap menjadi kunci per proyek. Paket dikunci secara atomik oleh server; komputer berbeda tidak mendapatkan paket aktif yang sama. Saat koneksi putus, hasil lokal dipertahankan untuk sinkronisasi dan paket kedaluwarsa masuk **Perlu pemeriksaan**. Paket tidak otomatis direbut komputer lain. Gunakan proses/token pemilik yang sama dan **Lanjutkan**; pelepasan manual Review dilakukan setelah komputer lama berhenti dan kunci berakhir.

**Coba ulang gagal** pada ekstensi mengaktifkan ERROR milik komputer itu; tombol dashboard mengaktifkan ERROR dari paket yang sudah ditutup untuk seluruh komputer. DONE dan link tersimpan tetap dipakai. Ketika server terhubung, ekstraksi lokal diblokir agar seluruh pekerjaan mengikuti pembagian pusat.

**Reset full** menghapus data/pengaturan/koneksi lokal; hasil belum tersinkron harus dikirim dahulu. **Reset pusat** terpisah, memerlukan nama proyek, dan ditolak jika kunci masih aktif. Reset pusat menambah generasi sehingga proses lama tidak dapat mengubah generasi baru. Panduan pemulihan lengkap terdapat di INSTALL.md.

## Mode lokal

Mode lokal tersedia saat server tidak terhubung. Klik **Cek data halaman** untuk diagnosis, **Pilot 5 data** untuk pemeriksaan alur popup, atau **Mulai seluruh data pada filter** untuk inventaris seluruh halaman dan ekstraksi. Pilot/Mulai membuat job baru; Lanjutkan/Coba ulang gagal memakai progres lama. Mode lokal pada komputer berbeda tidak disinkronkan.

Alur: **titik tiga → Pengaturan Email → Dapatkan Unique Link jika diperlukan → baca URL lengkap → simpan → tutup popup**. URL dibaca langsung dari DOM, sehingga klik Copy/clipboard tidak diperlukan. Jika mode ternyata belum CAWI, hasil gagal dicatat; mode tidak diubah.

**Simpan jeda** berlaku saat mulai/lanjut/ulang gagal. Respons FASIH dapat menambah waktu tunggu. Biarkan tab aktif; perubahan filter, urutan, atau isi halaman menjeda proses. Program berpindah halaman otomatis. Reload terencana melanjutkan navigasi; reload tak terduga membutuhkan Lanjutkan.

**Ekspor Excel / backup** menyimpan hasil lokal: DATA, ERROR, RINGKASAN. Identitas/KK ditulis sebagai teks agar angka panjang/nol awal utuh; URL lengkap dan kolom sumber tersedia. Kolom opsional yang tidak muncul dibiarkan kosong. Backup JSON belum mempunyai fitur impor otomatis.

## Pengujian pengembang

```text
npm install
node scripts/check.cjs
node --test tests/*.test.cjs
node scripts/package.cjs
```

Tes PHP/MySQL memerlukan runtime lokal dan database fixture khusus. Pada workspace Windows ini `node scripts/start-test-server.cjs` menyalakan PHP/MariaDB portable dari `.tools` di loopback port 9079/3319. Tes integrasi hanya menghapus database fixture `fulx_test` pada port 3319, tidak boleh diarahkan ke produksi. Semua data browser/API fiktif; browser fixture FASIH tidak menghubungi situs produksi.

Paket 0.3.1 diuji dengan PHP 8.5.11/MariaDB 10.11.14 lokal; kode PHP kompatibel dengan fitur PHP 8.3. Pemasangan cPanel dan ekstraksi data FASIH produksi belum dilakukan. Ringkasan teknis/riwayat: [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

Tombol **Unduh ekstensi (ZIP)** pada header dashboard menyediakan versi yang dibundel dengan server. Setiap `node scripts/package.cjs` menyalin ZIP versi saat ini ke `server/public/downloads` dan memperbarui tombol. Deploy seluruh hasil commit dengan `git pull --ff-only` agar tombol dan ZIP tetap sesuai.
