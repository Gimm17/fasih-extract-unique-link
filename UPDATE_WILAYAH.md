# FULX v0.3.6 — pembaruan wilayah Kota Palu

FASIH membatasi hasil satu filter hingga 1.000 assignment. Rilis ini menemukan wilayah dari dropdown FASIH, menginventarisasi per kecamatan/desa, lalu memakai filter yang sama untuk ekstraksi. Target awal Kota Palu tetap **11.649 identitas unik**. Target tidak diturunkan otomatis.

## Perubahan v0.3.6: tombol mata pada login

Kolom password login memiliki tombol mata untuk menampilkan atau menyembunyikan karakter yang diketik. Awalnya password tersembunyi; tombol dapat digunakan dengan mouse atau keyboard dan tidak mengirim formulir login. Password kembali tersembunyi setelah login/keluar. Ini tidak memulihkan password yang lupa atau menampilkan hash database.

Pembaruan hosting cukup `git pull --ff-only`, lalu muat ulang halaman login. Tidak ada perubahan database atau token. Paket ekstensi hanya disamakan versinya; alur inventaris dan ekstraksi tetap seperti v0.3.5.

## Perubahan v0.3.5: pemecahan bersyarat ke SLS/SUBSLS

Inventaris mulai dari kecamatan/desa bernama, melewati opsi `-` dan kode seluruhnya nol pada semua tingkat. Desa yang terbaca 1.000 kartu dipecah ke SLS valid. SLS yang juga mencapai 1.000 dipecah ke SUBSLS valid. Desa/SLS di bawah batas selesai tanpa membuka dropdown anak; pilihan anak lama dikosongkan melalui X. Ekstraksi memasang kembali seluruh resep yang menghasilkan inventaris, termasuk SLS/SUBSLS bila digunakan.

Sampel 1.000 identitas induk disimpan untuk pemeriksaan cakupan; inventaris induk terpotong tidak diunggah. Server menolak status Siap bila identitas induk hilang pada hasil anak atau total unik tidak sesuai target. Daftar anak valid kosong dan SUBSLS yang tetap mencapai 1.000 menyebabkan jeda untuk pemeriksaan, bukan inventaris lengkap.

Setelah Git pull dan pembaruan ekstensi, klik **Lanjutkan** dengan token/sesi yang sama. Checkpoint desa v0.3.4 dipertahankan, termasuk sampel desa yang dijeda pada 1.000. Katalog pemecahan SLS/SUBSLS valid tetap ada saat resume. Server tetap membersihkan cabang placeholder lama sambil mempertahankan identitas, hasil, link, token, target, dan generasi. Jika pembersihan diperlukan dan kunci kerja aktif, hentikan semua komputer, sinkronkan hasil, dan tunggu kunci berakhir. Tidak perlu reset database/proyek; tidak ada perubahan skema database.

## Perbaikan v0.3.3: pemilik inventaris lama sudah nonaktif

Pesan **Koordinator lain memiliki inventaris** dapat muncul setelah mengganti token: nama komputer yang sama tetap memiliki ID berbeda untuk setiap token. Sebelumnya, menonaktifkan token lama belum melepaskan kepemilikan inventarisnya.

Mulai v0.3.3, Koordinator pengganti dapat melanjutkan inventaris wilayah jika pemilik lama sudah **dinonaktifkan** melalui dashboard. Server mengganti pemilik dalam transaksi tanpa menghapus master, halaman inventaris, hasil, atau link. Pemilik yang masih aktif tetap dilindungi; status OFFLINE saja tidak cukup untuk mengambil alih. Token lama yang diaktifkan kembali tidak boleh menulis inventaris setelah kepemilikan berpindah.

Untuk kasus ini: lakukan `git pull --ff-only` di hosting, muat ulang dashboard, periksa ID pemilik inventaris di **Kelola proyek** dan tanda **Pemilik inventaris** di tabel komputer. Jika pemilik sudah nonaktif, gunakan token Koordinator yang sekarang terhubung dan klik **Lanjutkan** pada ekstensi. Jika pemilik masih aktif, hentikan proses lama dan nonaktifkan ID pemilik itu terlebih dahulu. Tidak perlu reset data, membuat proyek baru, atau membuat token tambahan. ZIP v0.3.6 juga tersedia melalui tombol dashboard. Tidak ada perubahan skema database.

## Perbaikan v0.3.2: dropdown Kecamatan tidak ditemukan

Pencarian label tidak lagi terbatas ke tag tertentu atau label tanpa elemen anak. Caption dalam heading, label dengan ikon/markup, dan teks yang berada dalam grup tombol didukung. Asosiasi `for`, `aria-label`, dan `aria-labelledby` juga dibaca. Tombol tetap dipilih berdasarkan nama field dan grupnya, bukan urutan dropdown atau ID Radix. Sidebar menunggu keenam kontrol wilayah selesai muncul sebelum discovery.

Jika v0.3.1 dijeda dengan pesan **Dropdown KECAMATAN: ditemukan 0 kandidat**, perbarui ekstensi pada folder pemasangan yang sama, Reload di `chrome://extensions`, muat ulang FASIH, lalu klik **Lanjutkan** memakai token dan sesi tersimpan. Tidak perlu reset inventaris atau membuat token baru. Pembaruan ini tidak mengubah skema database; `git pull --ff-only` juga memperbarui tombol download ZIP dashboard.

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
2. Klik **Unduh ekstensi v0.3.6 (ZIP)**.
3. Ekstrak ZIP dan salin isinya ke folder ekstensi yang selama ini dipasang. Timpa file lama dengan versi baru, lalu klik **Reload** di `chrome://extensions`.
4. Muat ulang tab FASIH. Panel harus menampilkan **FULX v0.3.6**.

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
5. Opsi `[000] -` dan kode kosong/nol dilewati. Desa bernama yang tidak mempunyai data tetap disimpan sebagai nol setelah tampilan `No results` terkonfirmasi.
6. Desa mencapai **1.000** dipecah ke SLS; SLS mencapai **1.000** dipecah ke SUBSLS. Di bawah batas, dropdown anak tidak dibuka. SUBSLS tetap mencapai batas atau opsi anak valid kosong dijeda untuk pemeriksaan; inventaris belum dianggap lengkap.
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
