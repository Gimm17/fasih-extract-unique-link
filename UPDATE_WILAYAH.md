# FULX v0.3.1 — pembaruan wilayah Kota Palu

FASIH membatasi hasil satu filter hingga 1.000 assignment. Rilis ini menemukan wilayah dari dropdown FASIH, menginventarisasi per kecamatan/desa, lalu memakai filter yang sama untuk ekstraksi. Target awal Kota Palu tetap **11.649 identitas unik**. Target tidak diturunkan otomatis.

## 1. Sebelum memperbarui

1. Hentikan/jeda proses pada kelima komputer.
2. Klik **Sinkronkan hasil tertunda** pada setiap komputer. Pastikan hasil belum tersinkron = 0.
3. Unduh Excel dan backup JSON dari dashboard serta ekstensi jika ada hasil lokal.
4. Backup database melalui cPanel atau terminal. Password dimasukkan saat diminta:

```bash
mkdir -p ~/deploy-backups
mysqldump -u pinnhost_fulxuser -p pinnhost_fulx > ~/deploy-backups/fulx-before-v030.sql
```

Jika nama backup sudah ada, gunakan nama baru. Jangan menaruh backup database di document root web.

## 2. Perbarui server dengan Git

```bash
cd ~/fulx.pinnhost.my.id
git status --short
git pull --ff-only
php -v
php server/private/migrate.php
```

Gunakan PHP 8.3 atau lebih baru, dengan PDO MySQL. Sesuaikan PHP CLI apabila versi terminal berbeda dari versi situs. Document root tetap `~/fulx.pinnhost.my.id/server/public`. Konfigurasi tetap di `server/private/config.php`; file ini tidak ikut Git/ZIP.

Migrasi menambah tabel wilayah, partisi, pemetaan halaman, lokasi identitas, serta jurnal migrasi. Migrasi aman diulang dan juga dijalankan otomatis saat request PHP pertama. Akun admin, token komputer, identitas, dan link lama dipertahankan. **Tidak perlu membuka installer lagi dan tidak perlu reset database.**

## 3. Perbarui kelima ekstensi

1. Muat ulang dashboard dengan **Ctrl+Shift+R**.
2. Klik **Unduh ekstensi v0.3.1 (ZIP)**.
3. Ekstrak ZIP dan salin isinya ke folder ekstensi yang selama ini dipasang. Timpa file lama dengan versi baru, lalu klik **Reload** di `chrome://extensions`.
4. Muat ulang tab FASIH. Panel harus menampilkan **FULX v0.3.1**.

Menggunakan folder pemasangan yang sama mempertahankan identitas ekstensi dan penyimpanan lokal. Memasang folder berbeda dapat membuat ekstensi baru dengan penyimpanan berbeda. Gunakan satu ekstensi aktif dan satu token berbeda untuk setiap komputer.

## 4. Aktifkan proyek wilayah

1. Di dashboard **Kelola proyek**, pilih proyek lama.
2. Klik **Aktifkan mode wilayah Kota Palu pada proyek ini** setelah semua komputer berhenti dan hasil tertunda disinkronkan. Jika masih ada kunci aktif, tunggu sampai habis.
3. Periksa awalan proyek **7271**, URL/pencarian FASIH, dan target **11649**. URL menggunakan `view=list`, `perPage=100`. Huruf besar/kecil serta spasi pada pencarian harus sama.
4. Untuk proyek baru, pilih metode **Otomatis per wilayah Kota Palu** saat membuat proyek.

Aktivasi mode wilayah menaikkan generasi proses sehingga tugas lama tidak diteruskan dengan model halaman yang berbeda. Inventaris lama tetap ada sebagai **belum terpetakan**, lalu dipetakan ulang berdasarkan kode identitas lengkap. Link yang sudah tersimpan tetap dipakai.

## 5. Inventaris semua wilayah

1. Hanya komputer dengan token **Koordinator** yang menjalankan inventaris.
2. Klik **Buka URL proyek**, lalu **Inventaris ke server**.
3. Ekstensi membuka sidebar Filter Data, memilih `[72] SULAWESI TENGAH` dan `[71] PALU`, membaca semua pilihan kecamatan/desa, kemudian berjalan per filter.
4. Tidak ada tombol Search/Apply: pilihan langsung diterapkan oleh FASIH. Ekstensi menunggu hasil stabil dan menutup sidebar dengan tombol **Close** di dalam sidebar itu.
5. Cabang `[000] -` dan wilayah kosong tetap diperiksa. Wilayah kosong disimpan sebagai nol setelah tampilan `No results` terkonfirmasi.
6. Bila satu filter mencapai **1.000**, filter dipecah ke **SLS**, lalu **SUBSLS**. Identitas yang terlihat pada induk harus ditemukan lagi pada gabungan anak. Bila SUBSLS masih mencapai 1.000 atau opsi pemecahan tidak tersedia, proses dijeda dengan alasan yang jelas.
7. Dashboard **Progres wilayah** menampilkan master, status inventaris, jumlah terbaca, hasil, komputer pemilik, duplikasi, dan data lama belum terpetakan. Total sumber yang tidak tersedia dengan pasti ditampilkan sebagai **Belum diketahui**, bukan ditebak dari badge global.
8. Proyek menjadi **Siap** setelah semua filter daun terverifikasi, data lama terpetakan, dan total unik cocok dengan target. Jika jumlah berbeda, periksa filter/status/akses wilayah; jangan langsung mengubah target agar lolos.

Jika terputus, aktifkan kembali tab lalu klik **Lanjutkan**. Checkpoint menyimpan kecamatan terakhir saat discovery, desa/partisi aktif, halaman lokal, serta kartu yang sudah terbaca. Isi halaman yang berubah sejak checkpoint menyebabkan jeda, bukan penimpaan diam-diam.

## 6. Ekstraksi pada lima komputer

Setelah inventaris **Siap**, kelima komputer dapat menekan **Mulai tugas server**. Server mencadangkan satu desa/partisi kepada satu komputer, kemudian memberikan halaman-halamannya. Ekstensi memasang resep filter dari server, memeriksa identitas halaman, membuka titik tiga → Pengaturan Email → Dapatkan Unique Link, membaca URL lengkap, menutup popup, lalu beralih ke assignment berikutnya.

Jeda awal tetap **0,50 detik per aksi** dan **1 detik antarassignment**, dapat diubah lewat panel saat berhenti. Waktu menunggu respons FASIH atau pergantian filter bisa lebih lama. Mode CAWI tidak diubah; email/pesan tidak dikirim. Assignment yang bukan OPEN/CAWI tidak diproses.

Satu token tidak boleh digunakan pada dua komputer/sesi bersamaan. Kunci yang kedaluwarsa masuk **Perlu pemeriksaan**. Pemilik dapat melanjutkan sesi lama; admin dapat mengantrikan ulang setelah memastikan komputer lama berhenti, hasil tertunda telah disinkronkan, dan kunci habis.

**Coba ulang gagal** mempertahankan identitas lengkap dan link yang sudah berhasil disimpan. Hanya hasil ERROR yang dikembalikan menjadi PENDING. DONE tidak diproses ulang. Halaman/partisi dengan pekerjaan tertunda akan diantrikan kembali.

## 7. Hasil dan validasi lapangan

Excel gabungan memuat DATA, ERROR, RINGKASAN, REKAP_WILAYAH, INVENTARIS, DUPLIKAT, dan BELUM_TERPETAKAN. JSON memuat hasil dan snapshot wilayah. Rekap kecamatan/kota dihitung dari identitas unik, termasuk apabila assignment terlihat pada beberapa filter.

Pengujian otomatis memakai DOM yang mengikuti HTML pengguna, browser Chrome lokal, dan server PHP/MariaDB lokal. Uji pertama pada FASIH produksi tetap diperlukan untuk memastikan struktur grup label, daftar opsi kosong/bergulir, reset halaman, serta perilaku filter pada akun yang dipakai lima komputer. Bila filter disimpan secara bersama pada akun/server FASIH, gunakan sesi/akun yang tidak saling mengubah filter. Verifikasi identitas halaman akan menjeda proses jika daftar berubah.

ZIP rilis disimpan dengan nomor versi berbeda; arsip lama dipertahankan. Setelah rilis berikutnya, lakukan Git pull dan download ZIP dari tombol dashboard lagi.
