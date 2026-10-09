# Pasang FULX v0.2.4 di cPanel

> **Rilis v0.3.2:** untuk pembaruan proyek yang sudah terpasang, ikuti [UPDATE_WILAYAH.md](UPDATE_WILAYAH.md). Migrasi wilayah mempertahankan database, link, dan token; installer tidak perlu dijalankan ulang. Scope awal Kota Palu, prefix 7271, target 11649.

Target: **https://fulx.pinnhost.my.id** · **5 komputer** · **11.649 assignment**.
Nama aplikasi: **FULX — FASIH Unique Link eXtractor**.

## 1. Siapkan hosting

Pilih **PHP 8.3** di MultiPHP Manager/Select PHP Version. Aktifkan **PDO dan pdo_mysql**. Gunakan database MySQL atau MariaDB dengan tabel InnoDB dan charset utf8mb4. Hosting tidak perlu menjalankan Node.js, Python, WebSocket, atau proses PHP permanen. Dashboard meminta pembaruan setiap 3 detik; ekstensi mengirim heartbeat setiap 15 detik saat mengerjakan paket.

Buat domain/subdomain `fulx.pinnhost.my.id` melalui menu Domains. Aktifkan SSL/AutoSSL dan Force HTTPS Redirect. Jangan gunakan HTTP untuk instalasi produksi. Rekomendasi document root:

```text
/home/NAMA_AKUN/fulx/public
```

Folder `private` harus berada di luar document root:

```text
/home/NAMA_AKUN/fulx/
  public/                 <- document root fulx.pinnhost.my.id
    index.html
    api.php
    bootstrap.php
    install.php
    dashboard.js
    dashboard.css
    assets/
    .htaccess
  private/                <- bukan folder yang dapat dibuka lewat web
    config.example.php
    config.php            <- dibuat sendiri; tidak disertakan dalam ZIP
    Service.php
    schema.sql
    .htaccess
```

Di File Manager, aktifkan **Show Hidden Files** supaya `.htaccess` ikut terunggah. Ekstrak `fulx-cpanel-server-v0.2.4.zip` ke `/home/NAMA_AKUN/fulx`. Isi ZIP sudah memiliki folder `public` dan `private`; jangan meletakkan seluruh paket di document root.

Jika cPanel mengharuskan root subdomain berada di bawah `public_html`, gunakan contoh `/home/NAMA_AKUN/public_html/flux/public` sebagai document root. Pastikan domain lain juga tidak dapat membuka folder saudaranya `private`; `.htaccess` private memblokir akses pada Apache/LiteSpeed. Pilihan pertama di luar `public_html` lebih baik. Jika hosting tidak mengizinkan mengubah document root/menempatkan private dengan susunan ini, minta dukungan hosting menyesuaikannya sebelum memasang.

## 2. Buat database dan konfigurasi

Di **MySQL Database Wizard**, buat database kosong khusus FULX dan satu pengguna database. Tambahkan pengguna ke database dengan **ALL PRIVILEGES untuk database tersebut**. Catat nama lengkap beserta awalan akun cPanel, misalnya `akun_fulx`.

Salin `private/config.example.php` menjadi `private/config.php`. Isi:

```php
<?php
return [
    'dsn' => 'mysql:host=localhost;dbname=akun_fulx;charset=utf8mb4',
    'db_user' => 'akun_fulx',
    'db_password' => 'PASSWORD_DATABASE_ANDA',
    'setup_key' => 'SECRET_ACAK_ANDA_MINIMAL_32_KARAKTER',
    'allow_http' => false,
    'lease_seconds' => 300,
];
```

Ganti semua contoh di atas dengan nilai sendiri. Buat setup key acak dari password manager, misalnya 64 karakter; jangan memakai teks contoh. Sesuaikan host database apabila penyedia hosting memakai host selain localhost. Gunakan permission file konfigurasi 600/640 jika didukung akun PHP hosting; jangan memakai 777. File konfigurasi tidak perlu diberikan kepada komputer pelaksana.

## 3. Pasang admin dan buat proyek

1. Buka **https://fulx.pinnhost.my.id/install.php**.
2. Masukkan setup key dari konfigurasi, username admin, dan password minimal 12 karakter.
3. Klik **Pasang FULX**. Installer membuat tabel pada database kosong dan otomatis terkunci setelah admin terbentuk.
4. Buka **https://fulx.pinnhost.my.id/index.html**, lalu login.
5. Di **Kelola proyek**, buat proyek: nama bebas, awalan **72** untuk seluruh Sulawesi Tengah, target **11649**, domain link **esurvey.bps.go.id**.
6. Gunakan URL Data FASIH yang benar, contoh:

```text
https://fasih-sm.bps.go.id/app/surveys/a0429e96-51a5-477b-a415-485f9c153004/fd68e454-ba45-4b85-8205-f3bf777ded24/data?page=1&perPage=100&search=-+EC+-&view=list
```

URL contoh tidak menunjukkan filter wilayah secara eksplisit. Terapkan filter Sulawesi Tengah di FASIH pada semua komputer. Cek juga apakah pencarian `- EC -` memang menghasilkan seluruh 11.649 target. Jika target berbeda, inventaris tidak ditutup sampai filter/jumlah dikoreksi. Nilai target 0 menerima jumlah aktual; gunakan hanya setelah memeriksa cakupan.

Satu proyek hanya boleh dibuat untuk satu pasangan survei/periode. Jika sebelumnya membuat proyek uji Palu untuk pasangan survei/periode yang sama, jangan membuat proyek kedua yang tumpang tindih. Untuk beralih cakupan, selesaikan/ekspor pekerjaan, jeda semua komputer, sinkronkan hasil, reset proyek setelah kunci berakhir, lalu klik Isi dari proyek aktif, sesuaikan nama, URL, prefix dan target, dan klik Perbarui proyek aktif. Pengubahan cakupan ditolak selama inventaris/pekerjaan sudah berjalan; gunakan reset pusat dahulu. Token komputer tetap dapat digunakan untuk proyek tersebut.

## 4. Tambahkan 5 komputer

Di proyek yang sama, buat:

| Komputer | Peran |
|---|---|
| Komputer 1 | Koordinator inventaris |
| Komputer 2 | Pelaksana |
| Komputer 3 | Pelaksana |
| Komputer 4 | Pelaksana |
| Komputer 5 | Pelaksana |

Token muncul **sekali** saat dibuat. Simpan tiap token secara terpisah untuk komputer terkait. Jangan memakai satu token pada dua komputer. Jika token hilang, nonaktifkan komputer lama dan buat token komputer pengganti; paket lama tetap perlu disinkronkan/diperiksa sebelum dilepas.

Pada masing-masing komputer:

1. Ekstrak `fasih-cawi-link-exporter-v0.2.4.zip` ke folder permanen.
2. Buka `chrome://extensions`, aktifkan Developer mode, klik **Load unpacked**, pilih folder yang langsung berisi `manifest.json`.
3. Untuk memperbarui instalasi lama, gunakan folder pemasangan yang sama, klik **Reload**, lalu refresh FASIH. Pertahankan origin ekstensi agar progres lokal tersimpan.
4. Login FASIH seperti biasa. Buka URL proyek, **view=list**, 100 kartu, filter/pencarian/urutan yang sama.
5. Pada panel FULX klik **Pengaturan server**. Isi `https://fulx.pinnhost.my.id/api.php` dan token komputer tersebut. Klik simpan/hubungkan, lalu kembali ke tab FASIH dan refresh.
6. **Cek data halaman** memeriksa kartu; tombol ini tidak mengambil link dan tidak membuat inventaris pusat.

## 5. Jalankan bersama

1. **Hanya Koordinator** klik **Inventaris ke server**. Ekstensi membaca seluruh halaman secara otomatis dan mengunggah identitas serta detail kartu, tanpa membuka menu pengambilan link.
2. Tunggu dashboard menunjukkan **Siap** dan total inventaris sesuai target. Untuk 11.649 data pada 100 kartu per halaman, jumlah paket sekitar **117 halaman**, dengan paket terakhir berisi 49 kartu.
3. Kelima komputer klik **Mulai tugas server**. Koordinator juga dapat mengerjakan ekstraksi setelah inventaris selesai.
4. Server memberi satu paket halaman kepada satu komputer. Setelah paket selesai, komputer meminta paket berikutnya secara otomatis. Komputer tidak perlu diberi rentang halaman manual.
5. Alur kartu OPEN dan CAWI: titik tiga → Pengaturan Email → Dapatkan Unique Link jika belum tersedia → baca URL lengkap → simpan → tutup popup. Link dibaca langsung; tombol Copy tidak diperlukan.
6. Biarkan tab FASIH aktif di setiap komputer. Jangan mengubah filter/urutan/pencarian saat proses berjalan. Semua komputer harus membaca halaman yang sama untuk paket yang sama; pemeriksaan identitas akan menjeda jika isi halaman berbeda.
7. Default jeda aksi **0,50 detik** dan antar kartu **1 detik**. Keduanya bisa diubah pada panel dan disimpan. Mulai dengan default; penurunan jeda tidak menjamin FASIH merespons lebih cepat. Dashboard menampilkan laju aktual dan perkiraan waktu.
8. Saat semua paket siap sudah diambil, komputer yang menganggur berhenti meminta paket. Setelah data gagal/Review diaktifkan kembali, klik **Lanjutkan** atau **Mulai tugas server** sesuai status proses komputer.

Ketika server terhubung, tombol ekstraksi lokal tidak dapat memulai/melanjutkan pekerjaan. Gunakan **Mulai tugas server** untuk pekerjaan bersama. Mode lokal dapat dipakai setelah koneksi server diputus pada Pengaturan server dan pekerjaan pusat ditangani.

## 6. Progres, koneksi putus, dan retry

Penanda data adalah **kode identitas lengkap**, termasuk suffix EC/nomor assignment, di dalam proyek server. Identitas ganda dan link identik untuk assignment berbeda ditolak. Server menyimpan penanggung jawab paket serta hasil per assignment; nama/nomor urut kartu tidak menjadi penanda selesai.

| Status | Artinya |
|---|---|
| Belum dikerjakan | Belum diambil/dimulai |
| Sedang dikerjakan | Assignment sudah dimulai oleh pemilik paket |
| Selesai | Link valid tersimpan dan popup berhasil ditutup |
| Gagal | Ada kesalahan dengan alasan tersimpan |
| Dilewati | Status sumber bukan OPEN |
| Perlu pemeriksaan | Paket kehilangan koneksi/kunci; bagian dari data belum selesai |

Hasil disimpan lokal sebelum dikirim. Jika upload gagal, hasil masuk antrean lokal tahan reload. **Sinkronkan hasil tertunda** mengirim ulang hasil tersebut; **Lanjutkan** juga mencoba sinkronisasi terlebih dahulu. Gunakan proses, token, dan komputer pemilik yang sama. URL yang sudah tersimpan dipakai kembali agar tidak meminta link ulang.

Kunci paket diperpanjang berkala dan kedaluwarsa setelah 300 detik tanpa perpanjangan. Paket kedaluwarsa masuk **Perlu pemeriksaan**, bukan langsung dibagikan ulang. Cara utama pemulihan: sambungkan kembali komputer pemilik, sinkronkan hasil, klik **Lanjutkan** pada proses lama. Jika komputer lama tidak tersedia, pastikan komputer itu sudah berhenti, tunggu kunci berakhir, periksa hasil tertunda bila bisa, lalu klik **Periksa & antrikan ulang** di dashboard. Setelah dilepas, kunci lama ditolak server. Sistem tidak bisa menjamin tindakan pada situs FASIH hanya terjadi sekali jika komputer hilang sebelum hasil disimpan; paket Review memerlukan pemeriksaan manusia sebelum dialihkan.

**Coba ulang gagal pada ekstensi** mengaktifkan kembali data ERROR milik komputer tersebut, lalu meminta paket yang tersedia. **Coba ulang gagal pada dashboard** mengaktifkan data ERROR dari paket yang sudah ditutup, sehingga dapat dibagi ke semua komputer. Paket yang masih aktif/Review tidak direbut. DONE dan link tersimpan dipertahankan. Retry lokal saat server tidak terhubung mengikuti progres per job lokal sebelumnya.

**Jeda pusat** menghentikan pengambilan paket baru; komputer aktif mendeteksi jeda lewat heartbeat atau sebelum kartu berikutnya. Aksi popup yang sedang berlangsung dapat diselesaikan/disimpan dahulu. Setelah **Lanjutkan pusat**, operator komputer yang telah dijeda klik **Lanjutkan** di panel.

## 7. Ekspor, reset, dan backup

Di **Data & hasil**, gunakan **Unduh Excel gabungan** untuk seluruh hasil proyek, termasuk data dari semua komputer. Workbook berisi **DATA, ERROR, RINGKASAN**, identitas sebagai teks, link lengkap, kolom komputer, dan detail sumber yang tersedia. Ekspor selama proses berjalan merupakan snapshot bertahap; unduh kembali setelah pekerjaan selesai untuk hasil final. Backup JSON berisi hasil dan metadata, bukan password/token. Impor backup otomatis belum disediakan; backup database cPanel diperlukan untuk pemulihan pusat penuh.

**Reset full di ekstensi** menghapus semua progres/pengaturan/koneksi lokal, dan ditolak jika ada hasil yang belum tersinkron. Data pusat tetap tersimpan. Reset lokal juga menghilangkan session pemilik lama; tangani paket aktifnya melalui Review sebelum memulai proses baru.

**Reset data pusat** menghapus inventaris/hasil/riwayat proyek setelah nama proyek diketik sebagai konfirmasi. Token komputer tetap ada. Hentikan semua komputer, sinkronkan hasil lokal, tunggu kunci berakhir; reset ditolak jika kunci masih aktif. Reset menambah generasi proyek, sehingga job lama tidak bisa melanjutkan ke generasi baru. Reset lokal pada komputer sebelum inventaris/proses baru.

Lakukan backup database melalui cPanel sebelum reset pusat atau pembaruan. Saat memperbarui file server, jangan menimpa `private/config.php`. Tabel versi 0.2.4 dipasang lewat installer pada database kosong; tidak ada migrasi dari backend server versi lain.

## 8. Bila ada kendala

- **Konfigurasi belum tersedia / database belum terhubung:** cek letak private/config.php, DSN, username/password, dan hak database.
- **HTTP 426:** SSL/HTTPS harus aktif. Jika hosting memakai proxy yang menyembunyikan HTTPS dari PHP, minta hosting meneruskan informasi HTTPS dengan benar; jangan mengaktifkan allow_http untuk produksi.
- **HTML/non-JSON, 403 atau timeout pada API:** cek PHP, endpoint /api.php, ModSecurity hosting, dan penerusan header Authorization pada `.htaccess`. Jangan menonaktifkan perlindungan seluruh hosting; minta dukungan menyesuaikan aturan spesifik jika ada false positive.
- **Kartu berbeda dari inventaris:** samakan filter, urutan, cakupan akun, dan pencarian; jangan memaksa melewati pemeriksaan.
- **Target tidak cocok:** periksa cakupan dan hasil pencarian, lalu koreksi target sebelum inventaris ditutup. Koordinator klik Lanjutkan untuk menyelesaikan upload/verifikasi.
- **Token masih punya proses lain:** gunakan Lanjutkan pada proses lama. Jika progres sudah hilang, tangani paket Review dari dashboard setelah kunci kedaluwarsa.
- **Dashboard belum diperbarui:** indikator menunjukkan koneksi terputus; angka yang tampil adalah data terakhir, bukan kepastian kondisi terkini.

## Validasi paket

Backend diuji lokal dengan PHP 8.5.11 dan MariaDB 10.11.14, lima proses PHP paralel, browser Chrome, serta data fiktif. Kode backend menggunakan fitur yang tersedia pada PHP 8.3; versi 8.3 direkomendasikan untuk hosting, tetapi runtime cPanel pengguna belum diuji. Pengujian belum melakukan ekstraksi terhadap data FASIH produksi atau pemasangan pada domain hosting pengguna.

Rujukan teknis: [PHP PDO transactions](https://www.php.net/manual/en/pdo.transactions.php), [MySQL locking reads](https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-reads.html).
