# Rencana FULX: inventaris bertingkat per wilayah

Tanggal: 9 Oktober 2026. Dasar kode: v0.2.4. Usulan rilis besar: v0.3.0.

Status: telah diimplementasikan dan diperbarui sampai v0.3.6; deployment hosting dilakukan melalui Git pull pengguna.
Arahan terbaru 9 Oktober 2026: otomatisasi mulai per desa bernama; opsi `-`/kode seluruhnya nol dilewati pada semua tingkat. Desa mencapai 1.000 dipecah ke SLS; SLS mencapai 1.000 dipecah ke SUBSLS. Di bawah batas, dropdown anak tidak dibuka. SUBSLS yang tetap mencapai batas dijeda dan belum dianggap lengkap.
Dokumen ini menggantikan rancangan satu URL/satu urutan halaman untuk seluruh proyek pada IMPLEMENTATION_PLAN.md.

## 1. Tujuan dan dasar keputusan

Temuan pengguna: FASIH membatasi data yang dapat dijangkau pada satu hasil pencarian/filter menjadi 1.000. Mengubah nomor halaman saja tidak menjamin seluruh data dapat ditemukan. Batas ini dipakai sebagai asumsi operasional sampai perilaku filter dan hitungannya diverifikasi pada pilot.

FULX akan menjelajah kabupaten/kota → kecamatan → desa/kelurahan, mengganti filter, menginventarisasi semua halaman desa, menyimpan checkpoint, lalu beralih ke desa berikutnya. Sesudah desa dalam kecamatan habis, lanjut kecamatan dan kabupaten/kota berikutnya.

Hasil yang dituju:

- Seluruh assignment dalam cakupan proyek tercatat satu kali berdasarkan kode identitas lengkap.
- Dashboard memperlihatkan total dan progres per desa, kecamatan, kabupaten/kota, dan proyek.
- Inventaris lengkap diverifikasi sebelum lima komputer mulai ekstraksi secara paralel.
- Ekstraksi tetap hanya untuk assignment OPEN yang sudah CAWI. Tidak mengubah mode atau mengirim pesan/email.
- Pekerjaan dapat dilanjutkan setelah tab berpindah, koneksi terputus, atau komputer mati.
- Link dan data lama dipertahankan selama migrasi, termasuk yang wilayahnya belum dapat ditentukan.

Konfirmasi pengguna: cakupan awal hanya Kota Palu, menggunakan dropdown bertingkat kabupaten/kota → kecamatan → desa. Daftar wilayah diambil dari pilihan FASIH. Target awal 11.649 untuk Kota Palu masih perlu dicocokkan dengan cakupan/status sumber karena pengguna menyebutnya sebagai perkiraan yang seharusnya berlaku.

Pada 100 kartu per halaman, satu daftar datar sebanyak itu memerlukan 117 halaman. Setelah dibagi per desa, jumlah halaman dapat lebih besar karena halaman terakhir setiap desa mungkin tidak penuh. Seluruh Sulawesi Tengah merupakan perluasan berikutnya, bukan cakupan yang langsung dijalankan pada rilis awal.

## 2. Informasi yang harus dipastikan sebelum menulis adapter filter

### Bukti dari screenshot filter pengguna

Panel bernama **Filter Data**, dengan pilihan `[72] SULAWESI TENGAH` dan `[71] PALU`. Kontrol bertingkat yang terlihat: PROVINSI, KABUPATEN/KOTA, KECAMATAN, DESA, SLS, SUBSLS. Masing-masing dropdown wilayah yang terbuka memiliki kolom Cari. Panel juga mempunyai filter nonwilayah dan tombol Reset; jangan memakai Reset global untuk berpindah desa karena dapat menghapus cakupan/filter dasar.

Daftar yang terlihat pada screenshot:

| Kode kecamatan relatif | Nama | Pilihan desa/kelurahan terlihat |
|---|---|---:|
| 010 | PALU BARAT | 6 |
| 011 | TATANGA | 6 |
| 012 | ULUJADI | 6 |
| 020 | PALU SELATAN | 5 |
| 030 | PALU TIMUR | 5 |
| 031 | MANTIKULORE | 8 |
| 040 | PALU UTARA | 5 |
| 041 | TAWAELI | 5 |
| Total kecamatan bernama | 8 | 46 |

Jumlah 46 merupakan pembanding dari opsi yang tampak, bukan bukti bahwa opsi tersembunyi/lazy loading tidak ada. Kode `[71]` dan kode kecamatan/desa pada label bersifat relatif terhadap induk; nilai internal dropdown dan penggabungan kodenya harus diverifikasi lewat DOM.

Dropdown kecamatan juga menampilkan **`[000] -`**. Sesuai arahan terbaru, pilihan ini dilewati dan tidak dimasukkan ke katalog kerja. Ketentuan yang sama berlaku untuk opsi desa bernama `-` atau kode seluruhnya nol. Target Kota Palu tetap 11.649; kelengkapan akhir tetap diperiksa berdasarkan identitas unik.

Keberadaan kontrol SLS/SUBSLS sudah terlihat, tetapi ketersediaan opsi dan kemampuannya membagi setiap desa besar belum terbukti. Pengguna mengonfirmasi bahwa memilih/mengganti opsi langsung menerapkan filter secara otomatis; sesudah selesai memilih wilayah, sidebar ditutup dengan tombol X/Close. Tidak ada langkah menekan Search/Terapkan pada sidebar. Total hasil khusus satu desa belum ditunjukkan.

Untuk pemetaan selector, diperlukan outerHTML tombol pembuka Filter Data, struktur panel berlabel wilayah, serta satu dropdown terbuka lengkap dengan kolom pencarian dan satu atau beberapa opsi. Tidak perlu menyalin class untuk setiap desa. Gunakan DOM Elements, bukan View Page Source.

### HTML kontrol yang sudah diberikan pengguna

- Pembuka filter: `button[aria-haspopup="dialog"]` yang memiliki anak `svg.tabler-icon-filter`. Batasi pencarian pada toolbar FASIH dan wajib tepat satu kandidat. Angka badge filter dapat berubah, sehingga bukan penanda tombol.
- Dropdown Kecamatan dan Desa: sama-sama `button[role="combobox"][aria-haspopup="dialog"]`. Class dan teks placeholder keduanya identik. Pilih lewat container label KECAMATAN atau DESA di panel Filter Data, bukan urutan global combobox.
- Contoh opsi Kecamatan: `[role="option"][cmdk-item][data-value="010 PALU BARAT"]` dengan teks `[010] PALU BARAT`.
- Contoh opsi Desa: `[role="option"][cmdk-item][data-value="004 UJUNA"]` dengan teks `[004] UJUNA`. Kode desa berlaku dalam konteks kecamatan terpilih.
- ID `radix-_r_...` bersifat dinamis; tidak disimpan sebagai selector tetap. Hubungan runtime `aria-controls`, jika tersedia saat dibuka, boleh dipakai untuk mengaitkan dropdown dan popup.
- `aria-selected="true"`/`data-selected="true"` pada opsi cmdk tidak dianggap bukti filter telah diterapkan: contoh ikon centang masih memiliki `opacity-0`. Setelah memilih opsi, verifikasi teks tombol, pilihan induk-anak, serta perubahan hasil FASIH.
- Popup dropdown menggunakan semantik dialog pada trigger. Harus dibedakan dari panel Filter Data dan popup Pengaturan Email; penanganan dialog generik yang langsung menutup semua dialog tidak boleh berjalan di tengah pemilihan filter.

Pengguna juga memberikan tombol penutup sidebar: `button[type="button"]` dengan anak `svg.tabler-icon-x` dan teks aksesibel `Close`. Cari tombol ini hanya di sidebar berjudul Filter Data yang sedang aktif; jangan memakai pencarian Close global karena popup lain dapat mempunyai tombol bernama sama.

HTML yang dikirim sebagai label Kecamatan masih berupa tombol combobox, belum memuat pembungkus label. Hubungan label-kontrol, container popup, dan input Cari masih perlu dibaca dari DOM saat pengembangan adapter. Informasi yang sudah ada cukup untuk melengkapi rencana; pemetaan tersebut akan diverifikasi oleh diagnostik selector sebelum operasi inventaris, tanpa mengandalkan posisi combobox global.

Karena setiap pilihan langsung menerapkan filter, pemilihan kecamatan dapat memicu hasil sementara sebelum desa terpilih. Selama transisi, bot tidak boleh membaca atau mengunggah kartu. Tunggu opsi anak sesuai induk, pilih desa, baca kembali pilihan lengkap, tutup sidebar dengan Close, lalu tunggu halaman 1 dan hasil filter akhir siap. Penutupan sidebar bukan bukti bahwa permintaan hasil terbaru sudah selesai. Respons lama, kartu desa sebelumnya, atau keadaan kosong sementara tidak boleh dijadikan checkpoint baru.

| Informasi | Pemeriksaan | Pengaruh pada implementasi |
|---|---|---|
| Mekanisme filter wilayah | Sudah dikonfirmasi: dropdown bertingkat, otomatis diterapkan saat memilih opsi, lalu Close sidebar | Menentukan selector dan cara memverifikasi wilayah |
| Daftar wilayah lengkap | Sudah dikonfirmasi: semua opsi FASIH; periksa pagination/lazy loading dropdown | Menentukan cakupan; tidak boleh berasal hanya dari 1.000 assignment yang sudah terbaca |
| Identitas wilayah | Kode, nama, tingkat, induk, dan nilai yang dipakai kontrol FASIH | Menghindari desa bernama sama di kecamatan berbeda |
| Total setelah filter | Apakah angka khusus hasil desa tersedia, atau hanya angka SEMUA/global | Menentukan bukti kelengkapan desa |
| Efek pergantian filter | URL, chip, isi kartu, urutan, dan reset halaman | Menentukan kapan halaman baru benar-benar siap |
| Persistensi filter | Per tab, browser, atau akun; uji dua komputer pada wilayah berbeda | Mencegah filter satu komputer mengubah sumber komputer lain |
| Desa mencapai batas | Nama desa dan jumlah yang teramati | Memecah ke SLS/SUBSLS valid hanya saat batas tercapai; memeriksa cakupan identitas induk |
| Cakupan target 11.649 | Kota Palu telah dikonfirmasi; verifikasi periode, status, dan pencarian dasar yang berlaku | Menentukan angka pembanding yang benar |

Pemeriksaan filter dipisahkan dari operasi pengambilan link. Tidak perlu mengekspor semua class; cukup contoh kontrol wilayah, opsi beserta nilai, indikator filter aktif, dan hasil setelah satu pergantian wilayah. Selector dipilih dari DOM aktual, bukan ditebak dari screenshot.

Jika filter tersimpan pada akun dan memengaruhi komputer lain, gunakan akun/sesi yang benar-benar independen atau batasi tahap yang bergantung pada filter menjadi satu komputer. Uji ini wajib selesai sebelum mengaktifkan lima pelaksana.

## 3. Model cakupan dan daftar wilayah

### 3.1 Hierarki wilayah

Satu proyek memiliki satu survei/periode dan satu cakupan wilayah yang eksplisit. Wilayah disimpan sebagai pohon:

```text
Proyek / provinsi
  Kabupaten atau kota
    Kecamatan
      Desa atau kelurahan
        Bagian yang lebih kecil, jika desa mencapai batas hasil
```

Kode dan nama resmi FASIH/master menjadi acuan. Panjang kode dan arti setiap digit tidak diasumsikan sebelum diverifikasi. Kode disimpan sebagai teks; nama saja tidak cukup untuk menentukan identitas wilayah.

### 3.2 Menemukan seluruh wilayah

1. Koordinator memilih cakupan proyek Kota Palu. Simpan ID/nilai dropdown Kota Palu sebagai induk cakupan.
2. Untuk tahap awal hanya pilih Kota Palu. Pada perluasan provinsi, baca seluruh kabupaten/kota dalam cakupan, termasuk opsi di luar viewport dropdown.
3. Untuk setiap kabupaten/kota, baca seluruh kecamatan; untuk setiap kecamatan, baca seluruh desa/kelurahan.
4. Simpan setiap wilayah beserta induknya dan posisi penjelajahan. Discovery dapat dilanjutkan dari checkpoint.
5. Bedakan induk yang sudah selesai didaftar dari induk yang baru dibaca sebagian.
6. Sumber utama adalah dropdown FASIH. Impor master Excel/CSV menjadi alternatif opsional untuk tahap berikutnya. Validasi kode ganda, induk hilang, wilayah di luar cakupan, dan nama yang tidak cocok.
7. Wilayah tanpa data tetap memiliki entri. Daftar anak kosong akibat gagal memuat tidak dianggap berarti tidak ada wilayah.
8. Catat assignment tanpa kode wilayah yang dapat diverifikasi dalam kategori Belum terpetakan; jangan menghilangkannya dari rekonsiliasi.

### 3.3 Wilayah administratif dan bagian pencarian

Pisahkan dua konsep:

- **Wilayah**: desa/kecamatan/kabupaten untuk pelaporan.
- **Bagian pencarian**: filter terkecil yang dapat dibaca lengkap di bawah batas FASIH.

Biasanya satu desa = satu bagian pencarian. Jika desa besar, satu desa memiliki beberapa bagian. Agregasi laporan desa tetap menghitung assignment unik, bukan jumlah bagian.

## 4. Mengatasi batas 1.000 tanpa menganggap data sudah lengkap

Aturan utama: hasil yang mencapai 1.000 dianggap berpotensi terpotong sampai ada bukti total hasil yang dapat dipercaya. Halaman kosong setelah 1.000 bukan bukti bahwa wilayah tersebut hanya memiliki 1.000 assignment.

| Hasil per bagian | Tindakan |
|---|---|
| Kurang dari 1.000, seluruh halaman terbaca, total terfilter cocok bila tersedia | Kandidat inventaris lengkap; jalankan pemeriksaan cakupan dan duplikasi |
| Tepat 1.000 | Tandai Perlu dipecah, kecuali ada bukti independen yang memastikan total memang 1.000 |
| Total terfilter lebih dari 1.000 | Pecah sebelum dinyatakan lengkap |
| Desa kosong | Pastikan filter benar, tidak loading/error, dan hasil kosong stabil; catat kosong terverifikasi |
| Total terfilter tidak tersedia | Catat sebagai tidak diketahui, bukan nol; tampilkan tingkat verifikasi dan lakukan rekonsiliasi global/master |
| Belum ada cara memperkecil filter | Tandai Terblokir batas FASIH; wilayah lain boleh dilanjutkan, kelengkapan global tetap belum terpenuhi |

Pemecahan otomatis turun ke SLS hanya saat desa mencapai 1.000, lalu ke SUBSLS hanya saat SLS mencapai 1.000. Opsi placeholder dilewati. Induk bertanda SPLIT tidak diunggah sebagai inventaris terpotong. Seluruh contoh identitas induk wajib ditemukan pada hasil anak, dan total unik proyek tetap cocok dengan target. Jika SUBSLS tetap mencapai batas atau opsi anak valid kosong, proses dijeda.

Jika anak sudah dipakai, hasil induk menjadi bukti pembanding dan tidak ikut dijumlahkan sebagai data tambahan. Jika sebagian hasil induk sudah masuk sebelum batas ditemukan, jadikan hasil sementara lalu rekonsiliasi ke bagian anak berdasarkan identitas lengkap. Jangan mengantrikan induk dan anak untuk ekstraksi sekaligus.

## 5. Alur inventaris otomatis

Default rilis pertama: satu Koordinator menjalankan inventaris seluruh wilayah secara berurutan. Empat komputer lain menunggu sampai inventaris proyek dinyatakan siap.

1. Hubungkan token Koordinator dan periksa survei/periode serta versi protokol server.
2. Ambil bagian pencarian berikutnya dari server menurut urutan kabupaten/kota, kecamatan, desa, lalu bagian.
3. Simpan checkpoint sebelum mengganti filter.
4. Terapkan kabupaten/kota, tunggu opsi kecamatan siap, pilih kecamatan, tunggu opsi desa siap, kemudian pilih desa.
5. Bersihkan pilihan anak yang berasal dari induk sebelumnya dan pastikan pilihan desa sesuai induk. Filter langsung diterapkan setelah memilih opsi; tutup sidebar memakai Close yang berada dalam panel Filter Data.
6. Atur view=list dan 100 kartu per halaman; mulai halaman 1.
7. Verifikasi filter terpilih dan konteks hasil. Nomor halaman 1 dengan kartu desa sebelumnya tidak boleh dianggap sebagai hasil baru.
8. Baca semua kartu dan seluruh kolom yang tersedia. Tambahkan metadata wilayah yang sudah diverifikasi.
9. Simpan lokal secara atomik, kemudian unggah halaman. Ulang unggahan yang sama tidak menambah hitungan.
10. Klik Next, tunggu nomor halaman serta isi berubah, dan ulangi. Jangan hanya mengandalkan jeda tetap.
11. Setelah batas halaman tercapai, cocokkan jumlah, identitas, filter, dan indikasi batas 1.000. Baru tutup inventaris bagian tersebut.
12. Server menyimpan status bagian dan menentukan desa berikutnya. Setelah anak habis, lanjut induk berikutnya.
13. Ketika seluruh bagian selesai, rekonsiliasi cakupan dan total proyek sebelum mengizinkan ekstraksi.

Jeda awal mengikuti pengaturan saat ini: 0,50 detik per aksi dan 1 detik antar assignment, tetap dapat diubah. Pergantian filter ditentukan oleh kesiapan UI; tidak dipaksa selesai dalam 0,50 detik.

Perubahan filter oleh bot hanya diperbolehkan pada tahap perpindahan bagian yang tercatat. Pergantian manual yang tidak cocok dengan bagian aktif akan menjeda proses. Guard lama yang menganggap semua perubahan URL sebagai kesalahan akan diganti dengan validasi konteks bagian aktif.

## 6. Pembagian ekstraksi ke lima komputer

### 6.1 Unit kerja

Server membagikan **bagian pencarian/desa yang telah diverifikasi** kepada satu komputer. Komputer mengerjakan seluruh halaman dalam bagian tersebut, lalu mengambil bagian berikutnya. Checkpoint tetap disimpan per halaman dan assignment.

Pilihan ini mengurangi pergantian filter dan menghindari dua komputer mengerjakan desa yang sama. Jika pengujian menunjukkan ketimpangan besar, pembagian per halaman di dalam bagian dapat ditambahkan dengan identitas bagian tetap wajib; bukan syarat rilis pertama.

### 6.2 Klaim dan pemulihan

**Konfirmasi tambahan pengguna:** filter wilayah wajib dipakai kembali pada tahap ekstraksi, karena batas 1.000 juga berlaku saat mencari assignment untuk mengambil unique link. Inventaris lengkap tidak membuat seluruh assignment dapat diakses melalui daftar global.

Alur ekstraksi setiap komputer:

1. Minta satu paket bagian wilayah dari server beserta resep filter lengkap, revisi inventaris, dan identitas assignment target.
2. Buka Filter Data; pilih provinsi/kabupaten/kota, kecamatan, dan desa bernama. Jika paket berasal dari pemecahan batas 1.000, pilih juga SLS/SUBSLS sesuai resep server. Kosongkan filter anak di luar resep melalui X. Jangan memakai Reset global.
3. Tunggu dropdown turunan sesuai induknya; setiap pilihan otomatis diterapkan. Baca kembali pilihan lengkap lalu tutup sidebar melalui Close.
4. Tunggu hasil akhir siap pada view=list dan 100 kartu per halaman. Untuk paket baru mulai halaman 1; untuk resume, terapkan filter yang sama dahulu baru arahkan ke halaman checkpoint dan verifikasi ulang.
5. Cocokkan konteks filter dan identitas kartu dengan inventaris bagian yang diklaim. Nomor halaman/urutan baris saja tidak cukup untuk menentukan assignment.
6. Untuk assignment OPEN dan CAWI yang belum mempunyai hasil valid: titik tiga → Pengaturan Email → Dapatkan Unique Link jika diperlukan → baca URL lengkap → simpan hasil lokal dan unggah ke server → tutup popup.
7. Lanjutkan assignment dan halaman berikutnya dalam bagian yang sama. Selesaikan seluruh target bagian sebelum menutup klaim dan meminta paket berikutnya.
8. Pada paket berikutnya, ulangi pemilihan filter wilayah. Jangan beralih ke daftar global untuk mencari assignment yang tidak ditemukan; tandai ketidakcocokan dan lakukan rekonsiliasi pada wilayah terkait.

Resep filter ekstraksi harus sama dengan resep yang menghasilkan inventaris, termasuk tingkat pemecahan desa besar dan filter dasar nonwilayah. Inventaris dan ekstraksi memakai adapter pemilihan wilayah yang sama. Kepemilikan klaim dipertahankan melalui navigasi/reload; heartbeat juga mencakup tahap pergantian filter agar klaim tidak habis saat menunggu dropdown/hasil.

- Server melakukan klaim dalam transaksi database. Hanya satu pemilik aktif untuk satu unit kerja.
- Klaim menyertakan proyek, bagian, revisi inventaris, komputer, sesi, token klaim, dan waktu kedaluwarsa.
- Heartbeat memperpanjang klaim selama bekerja; satu token komputer digunakan satu instance aktif.
- Setiap checkpoint/hasil diperiksa terhadap klaim dan revisi yang sama. Unggahan sesi lama setelah pekerjaan dialihkan ditolak.
- Sebelum membuka assignment, cocokkan identitas lengkap dan status/mode aktual. Jika data berpindah halaman atau wilayah, tandai untuk rekonsiliasi.
- Jika jaringan putus, simpan hasil langkah aktif ke penyimpanan lokal, lalu jeda sebelum tindakan berikutnya. Hasil tertunda dikirim kembali dengan kunci unggahan yang sama.
- Klaim kedaluwarsa masuk Perlu pemeriksaan. Tidak langsung diberikan kepada komputer lain ketika masih mungkin ada browser lama yang berjalan.
- Pada pemulihan, server menolak penulisan dari pemilik lama; browser lama juga wajib memperoleh/mengecek klaim yang valid sebelum meneruskan tindakan.
- Sistem menjamin pencegahan klaim bersamaan dan penyimpanan hasil tanpa duplikasi. Tidak mengklaim bahwa popup FASIH mustahil dibuka ulang setelah kegagalan jaringan pada waktu yang tidak diketahui.

Pengiriman Email/Pesan dan perubahan mode tetap tidak dilakukan. Unique link yang sudah tersimpan valid digunakan kembali setelah verifikasi identitas.

## 7. Perubahan struktur database

Masalah pada struktur saat ini: primary key halaman adalah `(campaign_id, page_no)`, sehingga halaman 1 dari dua desa akan bertabrakan. Filter dan URL juga disimpan satu kali untuk seluruh proyek.

| Entitas | Isi yang direncanakan |
|---|---|
| `schema_migrations` | Versi migrasi, tahap, waktu, hasil pemeriksaan |
| `regions` | ID internal, proyek/master, kode, nama, tingkat, parent_id, sumber master, status kelengkapan discovery |
| `campaign_regions` | Wilayah yang termasuk cakupan proyek, target opsional, total sumber terfilter, waktu dan sumber hitungan |
| `partitions` | Desa pemilik, parent partition bila dipecah, resep filter terstruktur, revisi, bukti filter, status inventaris, indikasi terpotong |
| `inventory_pages` | `(campaign_id, partition_id, revision, page_no)`, daftar identitas, jumlah, fingerprint, status unggah |
| `records` | Identitas lengkap unik per proyek; wilayah terverifikasi/asal pemetaan, status/mode, kolom asli, link dan hasil |
| `record_locations` | Lokasi ditemukan: bagian, revisi, halaman, ordinal; menangani perpindahan dan temuan duplikat antar filter |
| `work_units` | Bagian yang siap diekstrak, pemilik/sesi/token klaim, lease, tahap dan checkpoint |
| `events` | Aktivitas dengan region_id, partition_id, komputer, revisi dan halaman |

Identitas assignment tetap `(campaign_id, identity_key)`. Satu assignment yang muncul pada dua filter dicatat sebagai temuan duplikasi/konflik lokasi, bukan dihitung dua kali. Konflik induk wilayah tidak diselesaikan otomatis dengan menimpa nama wilayah.

Jumlah induk dihitung dari assignment unik pada wilayah anak yang aktif, bukan penjumlahan mentah setiap query. Nilai total tidak diketahui disimpan sebagai NULL dan ditampilkan “Belum diketahui”.

## 8. Kontrak API dan penyimpanan ekstensi

Rancangan operasi API:

- Discovery/master: daftar/upsert wilayah, simpan checkpoint penjelajahan, tandai daftar anak lengkap.
- Inventaris: klaim bagian, mulai, unggah halaman, pecah bagian, tutup bagian, rekonsiliasi proyek.
- Ekstraksi: klaim bagian siap, heartbeat, mulai assignment, unggah hasil, tutup bagian, ulang gagal.
- Dashboard: pohon wilayah, ringkasan per tingkat, detail bagian/halaman, konflik, dan ekspor.

Semua permintaan mutasi memakai otorisasi yang sudah ada, ditambah validasi bagian/revisi/klaim. Kunci idempotensi minimum unggahan inventaris: proyek + bagian + revisi + halaman. Isi berbeda pada kunci yang sama menghasilkan konflik, bukan overwrite diam-diam.

IndexedDB ekstensi menyimpan bagian aktif, urutan parent, resep filter, halaman terakhir, revisi, hasil lokal, dan outbox. Navigasi penuh tidak menghilangkan progres. Resume membaca keadaan server dahulu sebelum membuka kembali halaman.

Versi protokol minimum diperiksa sebelum tugas berjalan. Ekstensi lama v0.2.x tidak boleh mengunggah menggunakan skema halaman datar setelah proyek dimigrasikan.

## 9. Dashboard web

### 9.1 Pemetaan wilayah

Tambahkan menu **Wilayah & inventaris** dengan tampilan pohon/tabel yang dapat dibuka bertingkat:

| Wilayah | Target | Total sumber | Inventaris unik | Layak ekstraksi | Link selesai | Gagal | Selisih | Status |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Kabupaten/kota | opsional | diketahui/belum diketahui | agregasi unik | OPEN+CAWI | tersimpan | jumlah | jika pembanding tersedia | ringkasan |
| Kecamatan | opsional | diketahui/belum diketahui | agregasi unik | OPEN+CAWI | tersimpan | jumlah | jika pembanding tersedia | ringkasan |
| Desa/kelurahan | opsional | diketahui/belum diketahui | jumlah unik | OPEN+CAWI | tersimpan | jumlah | jika pembanding tersedia | detail |

Angka inventaris meliputi seluruh status yang ditemukan; target link hanya assignment yang layak. “Inventaris selesai” dan “Ekstraksi selesai” menjadi status terpisah.

Pemetaan rilis pertama berarti hierarki dan rekap wilayah. Peta geografis berwarna dapat menjadi tahap tambahan jika pengguna menghendaki dan data batas wilayah yang sesuai tersedia.

### 9.2 Detail dan kontrol

- Wilayah aktif Koordinator, halaman, jumlah kartu, komputer, dan checkpoint terakhir.
- Jumlah desa ditemukan, menunggu, diinventarisasi, kosong terverifikasi, lengkap, perlu dipecah, gagal, dan belum terpetakan.
- Status seluruh anak pada kecamatan/kabupaten; induk tidak lengkap jika discovery atau salah satu anak belum selesai.
- Tombol Jeda/Lanjutkan inventaris, ulang wilayah gagal, lihat duplikasi, lihat hasil, dan ekspor wilayah terpilih.
- Filter kabupaten/kota, kecamatan, desa, status, dan komputer pada halaman hasil.
- Tautan unduh ZIP ekstensi dengan versi dan kompatibilitas server tetap diperbarui setiap rilis.

Pembaruan menggunakan polling ringan sekitar 3 detik saat dashboard aktif, dengan backoff ketika gagal dan indikator waktu pembaruan terakhir. Gunakan endpoint ringkasan/halaman data, bukan mengirim semua 11.649 baris setiap polling. Cocok dengan rancangan PHP/MySQL cPanel yang sudah ada.

## 10. Kriteria inventaris lengkap dan rekonsiliasi

Proyek siap ekstraksi hanya jika:

1. Master seluruh wilayah dalam cakupan selesai didaftar atau diverifikasi dari master impor.
2. Seluruh wilayah daun memiliki status yang jelas; tidak ada desa hilang akibat dropdown terpotong.
3. Seluruh bagian aktif telah selesai diverifikasi; tidak ada bagian mencapai batas tanpa penyelesaian.
4. Halaman setiap bagian berurutan dan tidak ada perpindahan isi yang belum direkonsiliasi.
5. Assignment dideduplikasi dengan kode identitas lengkap; konflik wilayah dan assignment belum terpetakan yang memengaruhi cakupan sudah diselesaikan.
6. Jumlah assignment unik cocok dengan target terverifikasi proyek jika target tersedia; selisih ditampilkan beserta sumber hitungan dan waktu pengambilan.
7. Perbedaan hitungan akibat status tidak OPEN/non-CAWI dipisahkan dari kekurangan inventaris.

Jika total desa tidak tersedia, dashboard tetap membedakan kelengkapan penjelajahan wilayah dari kecocokan jumlah. Jangan menampilkan klaim “100% terverifikasi” hanya karena semua tombol Next sudah habis. Jika sumber berubah selama proses, buat revisi inventaris dan laporan tambah/pindah/hilang; target tidak diturunkan otomatis untuk menutup selisih.

## 11. Excel dan ekspor

Workbook gabungan direncanakan memiliki sheet:

- DATA: seluruh kolom yang terbaca, kode/nama kabupaten-kecamatan-desa, sumber pemetaan wilayah, bagian, revisi, halaman, status/mode, unique link, komputer, waktu, dan hasil.
- REKAP_WILAYAH: total dan progres tiap tingkat tanpa hitung ganda.
- INVENTARIS: status bagian, halaman, total sumber, jumlah unik, indikasi batas dan verifikasi.
- ERROR: wilayah/assignment, tahap, alasan, percobaan, tindakan pemulihan.
- DUPLIKAT: identitas yang ditemukan pada lebih dari satu bagian dan hasil rekonsiliasinya.
- BELUM_TERPETAKAN: data lama/baru yang lokasi administratifnya belum terverifikasi.
- RINGKASAN: cakupan, versi, target, total unik, jumlah layak, hasil, dan batas verifikasi.

Semua kode panjang disimpan sebagai teks. Kolom sumber yang tidak tersedia tetap kosong, tidak diisi dengan perkiraan. Ekspor dapat dipilih per desa, kecamatan, kabupaten/kota, atau seluruh proyek.

## 12. Migrasi dari v0.2.4 dan data produksi

1. Buat backup database dan konfigurasi; catat jumlah record, link valid, token, dan pekerjaan tertunda.
2. Sinkronkan outbox seluruh komputer, hentikan pengambilan tugas baru, dan tunggu pekerjaan aktif berhenti sebelum migrasi.
3. Jalankan migrasi versi yang eksplisit dan dapat dilanjutkan bila terhenti. DDL MySQL tidak diasumsikan dapat di-rollback sebagai satu transaksi.
4. Buat tabel baru dan pindahkan referensi tanpa menghapus data lama. Inventaris 1.000 yang sekarang ada ditandai Legacy / Belum diverifikasi wilayah.
5. Cocokkan hasil lama dengan inventaris baru memakai identitas lengkap. Link valid dipertahankan; jangan mengasumsikan setiap kode 16 digit menyandikan desa tanpa bukti dari master.
6. Assignment lama yang tidak ditemukan di cakupan baru tetap tersedia sebagai Belum terpetakan/Di luar cakupan untuk pemeriksaan.
7. Periksa kesetaraan jumlah record/link sebelum dan sesudah migrasi, serta keunikan kunci baru.
8. Deploy backend kompatibel, update dashboard/ZIP, muat ulang semua ekstensi, lalu jalankan pilot wilayah.
9. Jangan menjalankan installer awal lagi pada database produksi. Gunakan migrasi khusus.
10. Rollback sebelum proses baru berjalan memakai backup terverifikasi. Jika sudah ada hasil baru, hentikan proses dan ekspor hasil baru dahulu agar rollback tidak menghilangkannya.

Token komputer dapat dipertahankan jika valid dan belum dicabut. Reset pusat seluruh data bukan langkah default migrasi.

## 13. Tahapan implementasi dan hasil setiap tahap

| Tahap | Pekerjaan | Syarat selesai |
|---|---|---|
| A. Verifikasi FASIH | Uji filter, daftar wilayah, hitungan, persistensi lintas akun, dan desa besar | Mekanisme filter serta bukti kelengkapan didokumentasikan |
| B. Skema dan migrasi | Hierarki, bagian, halaman berscope, lokasi record, revisi dan kompatibilitas | Migrasi uji mempertahankan semua data/link lama |
| C. Discovery wilayah | Baca/impor master, checkpoint, validasi parent | Master dapat dibaca lengkap, termasuk dropdown bertingkat yang dipaginasi |
| D. Inventaris per wilayah | Pergantian filter, verifikasi, Next, unggah, pecah, resume | Dua desa dengan halaman 1 berbeda tersimpan benar; desa kosong/besar ditangani |
| E. Antrean lima komputer | Klaim bagian, heartbeat, checkpoint, konflik, ulang gagal | Uji klaim bersamaan dan pemulihan tidak menghasilkan penyimpanan ganda |
| F. Dashboard dan Excel | Pohon, rekap, selisih, detail wilayah, ekspor | Agregat wilayah sama dengan distinct identitas inventaris |
| G. Pilot bertahap | Satu desa kecil → beberapa desa lintas kecamatan → satu kabupaten/kota → lima komputer | Hitungan dan identitas cocok dengan pemeriksaan FASIH pada cakupan pilot |
| H. Rilis | Versi baru, ZIP ekstensi/server, migrasi, Git, panduan cPanel | Paket/tautan unduh konsisten dan versi produksi terlihat jelas |

Tidak mengestimasi durasi penuh sebelum mekanisme filter dan sumber master diketahui. Ukuran rilis ini mencakup perubahan skema dan alur kerja, sehingga bukan patch nomor halaman saja.

## 14. Skenario pengujian wajib

- Desa dengan 0, 1, 99, 100, 101, 999, tepat 1.000, dan lebih dari 1.000 assignment.
- Dua desa bernama sama di kecamatan berbeda; kode dengan nol awal.
- Dropdown hanya memuat sebagian opsi; pilihan anak lama tertinggal setelah induk berubah.
- Filter baru sudah dipilih tetapi kartu lama masih tampil; empty/loading sementara dan error jaringan.
- Halaman 1 dari Desa A dan Desa B; resume pada halaman 3 Desa B setelah tab reload.
- Query induk dan anak tumpang tindih; satu assignment muncul di dua bagian; anak pembagian ada yang hilang.
- Desa tanpa total hasil terfilter; badge global 11.649 tidak digunakan sebagai total setiap desa.
- Desa yang tepat mencapai batas tetapi UI tetap mengaktifkan Next.
- Dua komputer memakai akun sama dan filter berbeda; pastikan tidak saling mengubah hasil.
- Lima worker mengklaim bersamaan; lease habis, server lambat, respons unggahan hilang, dan worker lama kembali.
- Hasil tersimpan lokal sebelum respons server hilang; retry tidak menghasilkan baris/link ganda.
- Mode/status assignment berubah sejak inventaris; urutan halaman berubah; identitas masih menjadi acuan.
- Migrasi 1.000 data lama beserta hasil DONE, data belum terpetakan, token, dan outbox.
- Ekstensi lama menghubungi backend baru; permintaan ditolak dengan pesan versi yang dapat ditindaklanjuti.
- Rekap induk sama dengan gabungan identitas unik anak; Excel dan dashboard menampilkan jumlah yang sama.

## 15. Keputusan sementara dan pertanyaan terbuka

Keputusan terkonfirmasi: Kota Palu dahulu; dropdown bertingkat kabupaten/kota → kecamatan → desa; master diambil dari opsi FASIH. Target awal 11.649 untuk Kota Palu akan diverifikasi.

Keputusan rancangan: satu Koordinator menelusuri wilayah berurutan; desa menjadi unit inventaris; lima komputer membagi ekstraksi setelah inventaris seluruh Kota Palu siap; dashboard memakai pohon/tabel wilayah; target tidak dikurangi otomatis; semua hasil lama dipertahankan selama migrasi.

Masih perlu diperiksa pada tahap A:

1. Apakah FASIH menampilkan total khusus desa yang sedang difilter, dan apakah angka itu ikut dibatasi 1.000?
2. Apakah ada desa mencapai batas, dan filter lebih rinci apa yang tersedia untuk menyelesaikannya?
3. Apakah pilihan filter hanya berlaku pada tab/komputer atau tersimpan bersama untuk satu akun?
4. Apakah pencarian dasar `- EC -` tetap diperlukan setelah wilayah dipilih? Tentukan dari cakupan data yang hendak diambil, bukan menghapusnya otomatis.

Hasil tahap A akan memastikan selector, sumber kode, mekanisme pembagian desa besar, dan rancangan final resep filter. Bagian itu tidak boleh diisi dengan asumsi yang belum diuji.
