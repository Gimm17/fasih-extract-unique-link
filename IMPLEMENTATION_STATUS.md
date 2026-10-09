# FULX v0.3.1 — inventaris dan ekstraksi per wilayah

Implementasi Kota Palu melalui dropdown FASIH: discovery kecamatan/desa, filter otomatis tanpa Search/Apply, cabang [000] dan hasil nol, checkpoint halaman per partisi, pemecahan SLS/SUBSLS saat mencapai 1.000, serta rekonsiliasi identitas induk. Target proyek tidak diturunkan otomatis. Ekstraksi menggunakan kembali resep wilayah dan memverifikasi keanggotaan halaman sebelum popup.

Migrasi additive dan idempoten mempertahankan akun, token, hasil, link, serta inventaris lama; aktivasi wilayah melalui dashboard menaikkan generasi dan memetakan data lama berdasarkan kode identitas lengkap. Protokol v3 menolak alur flat dari klien lama pada proyek wilayah. Penguncian desa/partisi, halaman, sesi, claim token, heartbeat, REVIEW, requeue, dan outbox mempertahankan pemisahan tugas lima komputer.

Dashboard Progres wilayah menampilkan hierarki dan jumlah unik kota/kecamatan/desa; duplikasi lintas filter dan data belum terpetakan ditampilkan terpisah. Ekspor tujuh sheet: DATA, ERROR, RINGKASAN, REKAP_WILAYAH, INVENTARIS, DUPLIKAT, BELUM_TERPETAKAN. Total sumber yang tidak dapat dibaca dengan pasti tetap NULL/Belum diketahui.

Validasi: seluruh 79 pengujian otomatis lulus. Setelah perbaikan metadata paket/dashboard, 20 pengujian terkait dijalankan ulang dan lulus. Meliputi PHP/MariaDB lokal, lima proses claim bersamaan, migrasi link DONE, deduplikasi, 1.001 assignment melalui SLS, cabang kosong, perubahan signature saat resume, requeue kunci wilayah, serta Chrome dengan discovery → inventaris → filter ulang → dua popup link. Dashboard desktop/mobile dan workbook 1.001 baris diperiksa; ketujuh sheet dibaca ulang dengan openpyxl. Semua data uji fiktif.

Panduan pembaruan: UPDATE_WILAYAH.md. Distribusi ZIP v0.3.1 berversi dan arsip lama dipertahankan.

Batas lapangan: belum dijalankan pada sesi FASIH produksi atau dideploy langsung ke cPanel. Struktur label induk, opsi lazy/virtual, reset halaman, dan isolasi filter antarsesi perlu dibuktikan pada akun produksi. Jika SUBSLS tetap menyentuh 1.000 atau master tidak mencakup identitas induk, proses dijeda dan tidak menganggap inventaris lengkap.

# FULX v0.2.1 — koreksi domain deployment

Domain yang benar: fulx.pinnhost.my.id. Host permission, API default, tombol dashboard, label web, dan panduan menggunakan domain tersebut dengan HTTPS. Versi ekstensi/dashboard dan backup menjadi 0.2.1; ZIP 0.2.0 dipertahankan. Tidak ada perubahan skema database atau alur ekstraksi. Konfigurasi server yang sudah tersimpan tidak diganti otomatis; ubah alamat API lewat Pengaturan server jika sebelumnya menggunakan domain yang salah.

# FULX v0.2.0 — server dan dashboard

Backend PHP/PDO MySQL untuk fulx.pinnhost.my.id, Chrome MV3, lima komputer. Rekomendasi hosting PHP 8.3; pengujian aktual memakai PHP 8.5.11 dan MariaDB 10.11.14 portable lokal. Distribusi: ekstensi dan backend ZIP terpisah, keduanya berversi 0.2.0. Dokumentasi cPanel: INSTALL.md.

Koordinator mengirim inventaris semua halaman, server memverifikasi identitas penuh dan jumlah target. Paket satu halaman diklaim dalam transaksi InnoDB dengan lock kampanye/paket, session pemilik, claim token, dan lease 300 detik. Ekstensi memverifikasi membership halaman sebelum popup dan memperbarui lease tiap 15 detik. Paket kedaluwarsa masuk REVIEW, tidak direbut otomatis; admin requeue menolak lease aktif dan membatalkan token lama.

Hasil lokal disimpan sebelum checkpoint remote. Outbox IndexedDB mengirim ulang checkpoint idempoten dengan koneksi/token/session yang sama. Kegagalan acknowledgment server tidak menurunkan DONE menjadi ERROR. Pemulihan memanfaatkan URL tersimpan dan import/finalisasi yang sudah diterima dapat dikirim ulang. Network failure menghentikan runner dan mempertahankan proses. Beralih koneksi/reset lokal ditolak jika outbox belum tersinkron.

Dashboard login admin + HttpOnly session/CSRF, token tiap komputer tersimpan sebagai SHA-256 pada database. Config database berada di private di luar document root; HTTPS wajib produksi. Dashboard polling setiap 3 detik, heartbeat workers tiap 15 detik, queue/review, worker enable/disable, retry, reset pusat dengan generation fencing, edit cakupan sebelum inventaris/setelah reset, pencarian dan XLSX/JSON gabungan. Ekspor XLSX memakai library lokal bawaan proyek, tidak ada CDN. Default target 11649; jumlah aktual diverifikasi saat inventaris selesai.

Mode lokal versi sebelumnya tetap tersedia saat server tidak terhubung, dan diblokir saat terhubung agar tidak melewati pembagian kerja pusat. Hanya ekstraksi OPEN/CAWI di list; perubahan mode dan pengiriman tidak dijalankan. Kecepatan 500 ms/aksi dan 1000 ms/antar kartu tetap dapat diatur.

Validasi mencakup lima proses PHP bersamaan yang mendapat paket berbeda, ownership/session fencing, duplicate identity/link, retry mempertahankan DONE, reset dengan lease aktif ditolak, generation guard, CSRF, outbox, lost final acknowledgment, inventory idempotency, dan browser Chrome yang memakai backend nyata lokal untuk ekstraksi dua kartu fiktif. Dashboard desktop/mobile diperiksa visual, lima komputer tampil, formulir tidak tertimpa polling saat fokus, search aman dari HTML sumber, dan XLSX terunduh. Seluruh fixture FASIH di-route lokal; tidak ada ekstraksi produksi atau deployment cPanel yang dilakukan.

Batas: paket Review perlu pemeriksaan manusia jika pemilik hilang sebelum hasil tersimpan; lock server tidak bisa memberi jaminan exactly-once untuk UI situs eksternal. Tidak ada impor backup otomatis, publikasi cPanel otomatis, atau clipboard fallback untuk link yang tidak muncul di DOM. File `.tools`/test-output/data fiktif/config.php tidak masuk ZIP.

## Riwayat sebelum 0.2.0

# Status implementasi

Tanggal: 9 Oktober 2026

## Sudah dibuat

- Ekstensi Chrome Manifest V3, seluruh kode runtime lokal tanpa CDN.
- Panel kontrol berbahasa Indonesia dengan cakupan Palu/Sulawesi Tengah, diagnostik, pilot, mulai penuh, jeda, lanjutkan, hentikan, ulang gagal, dan ekspor.
- Adapter tabel/list berbasis HTML pengguna, pembacaan kode lengkap, pemetaan label/nilai, serta pemeriksaan kolom sumber lengkap.
- Pengendali menu/dialog Pengaturan Email berbasis teks/role dan pembacaan URL Unique Link lengkap dari assignment OPEN yang sudah CAWI.
- Inventaris semua halaman dan runner serial berdasarkan identitas lengkap.
- Checkpoint inventaris atomik dan progres per assignment melalui IndexedDB pada origin ekstensi.
- Penguncian pemilik tab, pemeriksaan wilayah/query/keanggotaan halaman, dan resume setelah navigasi/reload.
- Ekspor Excel DATA/ERROR/RINGKASAN, identifier teks, hyperlink, filter/header beku; backup JSON.
- Pengujian parser, runner, penyimpanan, service worker, browser simulasi, serta pembacaan ulang Excel.

## Batas verifikasi

Hasil pengujian lokal versi 0.1.6: **56 passed, 0 failed, 0 skipped**. Manifest dan seluruh JavaScript ekstensi lolos pemeriksaan sintaks. Excel hasil simulasi lolos pemeriksaan ZIP/XML dan pembacaan ulang melalui openpyxl. Simulasi browser memakai Chrome headless terpisah dengan seluruh request dipenuhi lokal.

## Perubahan 0.1.6 — jeda dan reset

Adapter memberi jeda default 500 ms sebelum aksi UI dan pembacaan URL. Pemeriksaan elemen memakai interval yang sama dengan batas tunggu 20 detik, serta pembacaan terakhir pada batas timeout agar elemen yang baru muncul tidak terlewat. Runner memberi jeda default 1000 ms setelah assignment. Panel menyediakan kedua input dalam detik dan Simpan jeda. Nilai disimpan lokal di meta IndexedDB, dipulihkan setelah reload, dan diterapkan pada mulai/resume/retry termasuk job lama. Guard diperiksa setelah jeda sebelum aksi; cleanup popup tetap tersedia saat stop.

Reset full menampilkan konfirmasi lokal dan menunggu runner tab berhenti sebelum transaksi atomik mengosongkan jobs, rows, dan meta untuk semua survei. Reset ditolak bila job RUNNING masih mempunyai tab pemilik lain. Panel FASIH diberi pesan untuk menghapus cache UI dan kembali ke default. Halaman ekspor membaca ulang penyimpanan sebelum unduh agar hasil lama yang sudah di-reset tidak dapat diunduh dari cache halaman. Reset tidak mengubah server FASIH maupun file unduhan pengguna.

Tes baru mencakup urutan jeda pada aksi/pembacaan, validasi dan persistensi custom timing, default pada resume lama, penghapusan semua scope secara atomik, pembatasan reset saat RUNNING, pemulihan panel default, pembacaan ulang ekspor setelah reset, serta reset browser ketika popup aktif. Status progres memakai kode identitas lengkap per job; retry mengaktifkan ERROR dan melanjutkan PENDING sambil melewati DONE/SKIPPED.

ZIP distribusi terbaru: `dist/fasih-cawi-link-exporter-v0.1.6.zip`. Versi ini diuji lokal; belum dijalankan pada data FASIH produksi oleh agen. Bagian versi sebelumnya di bawah merupakan riwayat.

## Perubahan 0.1.5 — Cek data halaman

Dengan progres lama tersimpan, handler tombol menampilkan hasil cek lalu blok finally memanggil update dan menimpanya dengan pesan job lama. Pesan kesalahan validasi juga tertimpa. Tiga tes regresi mereproduksi kegagalan ini sebelum perbaikan.

Hasil cek sekarang memakai kotak diagnostics tersendiri dengan role status dan aria-live. Kotak menampilkan jumlah kartu, jumlah OPEN/CAWI, kesiapan, kolom opsional, dan penjelasan bahwa ekstraksi dimulai lewat Pilot/Mulai. Kesalahan cek memakai kotak yang sama; kesalahan aksi lain ditampilkan setelah pembaruan status. Cek hanya memvalidasi prefix dan tidak bergantung pada domain ekspor.

Lima tes panel mencakup progres tersimpan, klik ulang dengan data berubah, domain ekspor tidak valid, error prefix pada cek/mulai, dan list kosong. Tes Chrome panel juga memeriksa hasil cek setelah pilot serta memastikan cek tidak mengambil link tambahan. Semua pengujian lokal lolos; belum diverifikasi ulang pada tab FASIH produksi pengguna.

ZIP distribusi terbaru: `dist/fasih-cawi-link-exporter-v0.1.5.zip`. Bagian versi sebelumnya di bawah merupakan riwayat.

## Perubahan 0.1.4 — hanya ekstraksi unique link

Pengguna menyampaikan pusat sudah mengubah semua mode menjadi CAWI. Runner langsung mengambil link dari kartu OPEN yang sudah CAWI. Kode adapter untuk dropdown mode, label switch, toggle Email/Pesan, dan save mode dihapus. Menu yang boleh dibuka adapter hanya Pengaturan Email. Panel, label fase, deskripsi manifest, dan bantuan diperbarui menjadi ekstraksi link. Job mencatat operation EXTRACT_LINK.

Mode tetap dibaca untuk memastikan Unique Link tersedia. Jika kartu masih CAPI/PAPI, hasil ERROR menjelaskan pembaruan pusat belum terlihat; ekstensi tidak mengubah mode. Setelah mode aktual CAWI, Coba ulang gagal mengambil link langsung. Progres lama yang gagal saat perubahan mode dapat dilanjutkan, initialMode historis dipertahankan, hasil selesai dilewati, dan link yang sudah tersimpan digunakan kembali.

Tes browser membuktikan hanya Pengaturan Email dibuka, nol dropdown mode, nol save mode, dan nol pengiriman. Pengujian mencakup Radix asli pada table/list, isolated content-script world, panel list, kartu yang masih non-CAWI, serta resume record SAVE_MODE_DICOBA setelah pusat mengubah mode. Tes kontrol perubahan mode versi lama diganti dengan regresi ekstraksi dan larangan tindakan mode.

ZIP distribusi terbaru: `dist/fasih-cawi-link-exporter-v0.1.4.zip`. Pengujian otomatis berlangsung lokal; versi ini belum dijalankan ulang pada data FASIH pengguna. Bagian 0.1.3 dan sebelumnya di bawah merupakan riwayat, bukan alur aktif.

## Perubahan 0.1.3 — menggunakan list sesuai arahan pengguna

Pengguna mengutamakan perubahan mode dan pengambilan link serta memperbolehkan kolom yang tidak terlihat pada list kosong. Runner sekarang memakai view=list untuk inventaris, perubahan mode, ekstraksi link, navigasi kembali ke halaman pertama, resume, dan pagination. Peluncuran dari tabel dialihkan otomatis ke list dengan pencarian dan parameter lain dipertahankan. Pembaca data mengikuti view aktif, sehingga tabel yang kebetulan masih ada dalam DOM tidak menggantikan kartu list.

Validasi runner hanya mewajibkan Kode Identitas lengkap, Status, dan Mode; wilayah dan keunikan identitas tetap diperiksa. Seluruh kolom lain yang tampil tetap diambil. Kolom opsional yang tidak tersedia diekspor sebagai sel kosong, sementara data tambahan dari inventaris lama yang sudah tersimpan dipertahankan. Parser dan batas halaman kosong diperluas untuk list. Label panel dan bantuan menunjukkan v0.1.3 · LIST.

Tes tambahan mencakup alur panel list dengan Radix asli dan tanpa Petugas Saat Ini/Keterangan, kartu dengan hanya tiga field wajib, navigasi table → list sebelum tindakan, melanjutkan hasil gagal dari versi tabel tanpa mengulangi hasil selesai, deteksi akhir list, serta ekspor kolom opsional kosong. ZIP distribusi: `dist/fasih-cawi-link-exporter-v0.1.3.zip`.

Versi ini belum dijalankan ulang pada server FASIH pengguna; pengujian otomatis memakai fixture lokal. Perubahan 0.1.2 di bawah merupakan riwayat, dan keputusan menggunakan tabel pada versi tersebut digantikan oleh mode list pada 0.1.3.

## Perbaikan 0.1.2 berdasarkan hasil pengguna

Excel pilot terbaru mempunyai 100 baris: dua ERROR tahap LINK_DICOBA dengan pesan `Timeout: menu Pengaturan Email`, dan 98 PENDING. Tombol tiga titik berhasil ditemukan, tetapi `.click()` tidak membuka DropdownMenu Radix karena pemicu utamanya memakai pointerdown/keydown. Adapter sekarang membuka menu dengan ArrowDown, memeriksa portal berdasarkan aria-controls, memilih CAWI dengan Enter, dan menutup menu dengan Escape. Pointer/click hanya menjadi fallback untuk implementasi kontrol biasa.

Tes memakai React dan komponen Radix DropdownMenu/Select asli pada kedua tampilan table/list. Tes mereproduksi kegagalan `.click()` versi sebelumnya, lalu membuktikan alur Ganti Mode → CAWI → pengiriman OFF → save → Pengaturan Email → Unique Link → tutup. Pengujian tambahan menjalankan adapter di isolated world Chrome agar menyerupai content script ekstensi yang berinteraksi dengan handler React pada page world. Dependency fixture tidak disertakan dalam ZIP distribusi.

Panel saat pemrosesan menjadi ringkas di kiri atas agar menu/popup terlihat. Kegagalan membuka kontrol UI menjeda proses pada data pertama yang gagal; alasan kegagalan disimpan dan tidak tertutup oleh pesan Jeda. Versi panel ditampilkan untuk memastikan reload telah memakai kode baru.

DOM table dan list dibaca terpisah. Tabel tetap dipakai runner karena memuat seluruh 15 kolom; kartu list pengguna tidak memuat Petugas Saat Ini dan Keterangan. Ekspor pengguna menunjukkan seluruh kolom tabel sudah terinventaris, sehingga ketidaksesuaian tampilan bukan penyebab dua error menu tersebut.

## Perbaikan 0.1.1 berdasarkan hasil pengguna

Ekspor pengguna menunjukkan 999 baris dengan Status `open` dan satu `draft`. Versi 0.1.0 memakai perbandingan case-sensitive saat inventaris, sehingga 1000 baris salah ditandai dilewati. Eligibility kini memakai pemeriksaan OPEN yang konsisten tanpa membedakan huruf besar/kecil; nilai sumber tetap utuh. Resume memperbaiki hanya hasil SKIPPED tahap inventaris dari bug tersebut, tanpa mengubah hasil selesai atau status selain OPEN.

Halaman 11 yang menampilkan No results kini menjadi batas inventaris hanya setelah timeout pemuatan, tidak ada indikator loading, dan nomor halaman tepat sesudah halaman inventaris terakhir. Pemrosesan memakai batas halaman yang telah terinventaris agar tidak kembali melewati batas. Pengujian regresi mencakup pemulihan 1000 record (999 tertunda dan satu draft dilewati), placeholder kosong sementara, serta penghentian walaupun Next masih aktif.

Seluruh pengujian otomatis menggunakan data fiktif dan simulasi lokal. Pengguna sudah memasang ekstensi dan menjalankan pilot versi sebelumnya; ekspornya membuktikan inventaris tabel berhasil tetapi pemicu menu gagal. Perbaikan 0.1.2 belum dijalankan pada data produksi oleh agen. Popup, asosiasi label kedua switch, dan URL produksi tetap diperiksa lewat pilot pengguna setelah reload.

Fitur yang sengaja belum disediakan: import backup JSON, ekspor lewat clipboard bila aplikasi tidak mengekspos URL lengkap dalam DOM, dan dukungan khusus virtualisasi yang menghilangkan kolom/baris dari DOM. Jika data sumber tidak lengkap, program menjeda dan melaporkan kekurangan.

Instruksi pemasangan dan pengoperasian: [README.md](README.md).
