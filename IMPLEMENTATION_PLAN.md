# Rencana implementasi ekstraksi unique link FASIH

Tanggal: 8 Oktober 2026

**Arahan terbaru, 9 Oktober 2026, versi 0.1.4:** pusat sudah mengubah seluruh mode ke CAWI. Ekstensi hanya mengambil unique link dari kartu OPEN yang sudah CAWI di view=list. Seluruh langkah perubahan mode, dropdown CAWI, toggle pengiriman, dan save mode dihapus. Arahan ini menggantikan alur konversi pada rencana awal dan keputusan 0.1.3 di bawah.

**Arahan terbaru pengguna, versi 0.1.3:** seluruh proses menggunakan **view=list**, termasuk inventaris, perubahan mode, pengambilan link, dan pagination. Kolom opsional yang tidak tampil boleh kosong. Kode identitas lengkap, Status, dan Mode tetap diperlukan. Prioritasnya perubahan mode ke CAWI dan ekstraksi link. Arahan ini menggantikan syarat kelengkapan tabel pada rencana awal di bawah.

## 1. Tujuan dan batas pekerjaan

Mengambil seluruh data tabel per assignment pada cakupan Kota Palu, mengubah mode CAPI/PAPI menjadi CAWI, mengambil unique link setelah CAWI terverifikasi, lalu menghasilkan Excel `.xlsx` yang menghubungkan setiap link dengan assignment yang benar.

Dokumen ini mencatat rencana dan pemetaan selector. Implementasi ekstensi kini tersedia di folder `extension`; lihat [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) dan [README.md](README.md). Belum ada perubahan pada data FASIH atau pengambilan link produksi. Folder proyek hanya berisi dokumen rencana saat tahap perencanaan dimulai.

Keputusan pengguna: ekstensi Chrome yang bekerja pada tab FASIH yang sudah login; semua jenis baris termasuk keluarga, bangunan, dan usaha/UMKM pada wilayah terpilih; hanya status OPEN yang diproses; Kirim Email dan Kirim Pesan harus OFF. Data yang sudah CAWI tidak perlu diubah modenya.

Jumlah data belum pasti. Program wajib menemukan jumlah aktual dan tidak memakai batas 1.000 yang dihardcode. Kota Palu menjadi cakupan awal; desain mendukung seluruh Sulawesi Tengah melalui konfigurasi wilayah.

## 2. Hal yang terlihat pada screenshot

- Tabel memiliki kolom di luar area layar; pembacaan wajib mencakup sisi kiri sampai kanan.
- Kode identitas pada tampilan terpotong; ekspor harus mengambil nilai lengkap.
- Menu baris menyediakan Ganti Mode dan Pengaturan Email.
- Memilih CAWI menampilkan Kirim Email dan Kirim Pesan. Kirim Email terlihat ON pada contoh.
- Pengaturan Email menyediakan Dapatkan Unique Link, kemudian menampilkan URL yang juga terlihat terpotong.
- Screenshot menunjukkan 10 baris per halaman, Page 1 of 1000, dan badge 11.649. Jumlah baris untuk filter Kota Palu belum dapat dipastikan dari gambar.

Screenshot menjadi referensi alur. Pengguna sudah memberikan HTML satu kartu list, tombol identitas, tombol menu, combobox mode, satu switch, tombol Dapatkan Unique Link, dan tombol Next. Selector yang didukung HTML tersebut dipetakan pada bagian 13. Perilaku interaksi dan bagian yang belum disertakan tetap perlu diverifikasi saat pilot ekstensi pada tab pengguna.

## 3. Arsitektur yang disarankan

| Komponen | Tanggung jawab |
|---|---|
| Adapter FASIH | Membaca header/baris, menemukan assignment, membuka menu/dialog, membaca mode dan URL |
| Pengendali proses | Menjalankan satu assignment pada satu waktu dan memverifikasi setiap tahap |
| Penyimpanan lokal | Menyimpan inventaris, hasil, tahap terakhir, dan riwayat kesalahan |
| Panel kontrol | Mulai, Jeda, Lanjutkan, Hentikan, Ekspor, Coba ulang gagal, dan indikator kemajuan |
| Eksportir Excel | Menghasilkan workbook lengkap dengan identifier bertipe teks dan hyperlink |

Content script cocok untuk membaca serta berinteraksi dengan DOM halaman yang sudah login. Penyimpanan dirancang lokal, tidak memakai sinkronisasi akun untuk data keluarga. Implementasi mekanisme penyimpanan dipilih setelah ukuran data diketahui, dengan akses dibatasi ke komponen ekstensi yang membutuhkan.

Referensi teknis: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) dan [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage).

## 4. Pemeriksaan halaman dan selector

1. Buka URL tabel yang diberikan pengguna menggunakan sesi login yang tersedia.
2. Identifikasi survei, periode, filter aktif, jumlah hasil, urutan tabel, dan pilihan 100 baris per halaman.
3. Petakan header dengan sel berdasarkan struktur tabel, bukan urutan kolom yang dihardcode.
4. Periksa apakah kolom/baris memakai virtualisasi. Jika iya, kumpulkan nilai sambil menggulir dan cocokkan kembali melalui ID assignment.
5. Ambil selector dari DOM: utamakan label, role, teks, atribut stabil, dan hubungan elemen di dalam baris/dialog yang benar. Class dapat menjadi cadangan setelah diverifikasi.
6. Pastikan menu tiga titik yang dipilih milik assignment target. Tombol di dialog harus dicari di dalam dialog aktif.
7. Identifikasi sumber nilai lengkap kode identitas dan URL: teks DOM, atribut, atau nilai input yang memang disajikan UI. Jangan memakai hasil screenshot yang terpotong.

HTML yang diberikan pengguna menjadi dasar adapter; tidak perlu mengulangi pemeriksaan browser dari Codex atau meminta seluruh class lagi. Pemeriksaan awal dilakukan melalui fitur diagnostik baca-saja di ekstensi pada tab FASIH pengguna. Class utilitas yang mengandung titik dua dipilih melalui selector atribut class, sehingga tidak perlu merangkai selector CSS yang rawan kesalahan escaping.

Tabel menjadi sumber seluruh kolom. List menjadi sumber pendukung identitas lengkap dan pemetaan aksi per assignment. HTML kartu list mencakup 10 pasangan label/nilai serta kode identitas, status, dan mode, tetapi tidak mencakup Petugas Saat Ini atau Keterangan. Data yang belum terbaca tidak boleh diganti tanda `-` seolah-olah itu nilai sumber. Sebelum perubahan massal, pastikan kedua kolom tersebut terbaca dari tabel dan pencocokan antartampilan memakai identitas lengkap, bukan posisi atau potongan kode.

## 5. Inventaris sebelum perubahan

Sebelum mengubah mode, buat inventaris seluruh assignment pada cakupan yang dipilih:

1. Validasi bahwa wilayahnya Kota Palu. Gunakan filter status OPEN jika tersedia, lalu simpan filter, survei, periode, waktu mulai, dan jumlah hasil. Jika status tidak dapat difilter, inventaris juga mencatat baris selain OPEN sebagai dilewati.
2. Gunakan 100 baris per halaman jika tersedia.
3. Baca seluruh detail dan ID stabil di setiap halaman, termasuk kolom di kanan.
4. Klik Next otomatis setelah inventaris halaman tersimpan. Tunggu isi tabel berubah dan pemuatan selesai.
5. Catat ID setiap halaman untuk mendeteksi halaman berulang dan assignment duplikat.
6. Rekonsiliasi jumlah ID unik dengan jumlah hasil filter.

Inventaris mencegah kehilangan target jika perubahan mode membuat baris bergeser atau hilang dari filter. Hindari filter CAPI/PAPI saat menjalankan perubahan apabila filter itu menyebabkan data yang berubah ke CAWI keluar dari daftar. Gunakan filter wilayah yang tetap dan pemilihan target dari inventaris.

ID assignment yang stabil, jika tersedia pada UI, menjadi kunci bersama identitas survei/periode. Nama keluarga dan nomor urut halaman tidak boleh menjadi kunci tunggal. Jika ID stabil tidak tersedia, keunikan kode identitas lengkap harus diverifikasi dahulu.

## 6. Alur per assignment

### A. Baca dan simpan data

1. Temukan kembali baris menggunakan ID assignment, termasuk setelah tabel dirender ulang.
2. Cocokkan identitas dengan inventaris dan baca detail terbaru sebelum perubahan.
3. Simpan mode awal, status assignment, data sumber, serta tahap proses ke penyimpanan lokal.
4. Verifikasi status terbaru tepat OPEN sebelum tindakan perubahan atau pengambilan link. Assignment di luar cakupan atau selain OPEN diberi alasan dilewati. Jika status berubah saat proses berjalan, jeda tindakan untuk assignment tersebut dan catat tahap terakhir.

### B. Ubah ke CAWI

1. Jika mode sudah CAWI, lanjutkan ke pengambilan link.
2. Jika CAPI atau PAPI, buka menu baris, lalu Ganti Mode.
3. Tunggu dialog terbuka, pilih CAWI, lalu tunggu kontrol tambahan muncul.
4. Baca kondisi Kirim Email. Jika ON, ubah ke OFF; jika sudah OFF, jangan ditoggle.
5. Pastikan Kirim Pesan OFF agar tidak mengirim WhatsApp. Jika sudah OFF, jangan ditoggle. Kedua toggle pengiriman wajib OFF sesuai keputusan pengguna.
6. Verifikasi pilihan CAWI dan toggle pengiriman sebelum menekan Ubah Mode Pendataan.
7. Simpan tahap bahwa penyimpanan sedang dicoba, lalu klik sekali.
8. Tunggu dialog menutup, temukan ulang assignment, dan pastikan mode pada tabel menjadi CAWI. Notifikasi sukses saja tidak cukup.
9. Simpan mode akhir dan hasil verifikasi.

Status assignment seperti OPEN adalah kolom berbeda dari mode CAWI. Alur ini mengubah mode; status dicatat dan hanya OPEN yang memenuhi aturan kelayakan. Mode selain CAPI, PAPI, atau CAWI dicatat sebagai kasus yang memerlukan pemeriksaan, tanpa perubahan otomatis.

### C. Ambil unique link

1. Setelah CAWI terverifikasi, buka kembali menu assignment yang sama.
2. Pilih Pengaturan Email dan tunggu dialognya siap.
3. Jika URL sudah tersedia, baca URL tersebut. Jika belum tersedia, klik Dapatkan Unique Link sekali dan tunggu URL muncul.
4. Prioritaskan membaca nilai URL lengkap dari input/DOM yang ditampilkan aplikasi. Ini menghasilkan nilai yang sama untuk Excel tanpa tergantung clipboard global.
5. Jika aplikasi hanya mengekspos URL lewat copy, gunakan mekanisme clipboard setelah perilaku dan izin browser diuji.
6. Validasi URL tidak kosong, tidak terpotong, memakai HTTPS, serta sesuai domain/rute survei yang teramati dari aplikasi.
7. Simpan URL bersama ID assignment dan waktu pengambilan. URL identik untuk ID berbeda ditandai sebagai anomali untuk diperiksa.
8. Tutup dialog dan lanjutkan setelah hasil tersimpan.

Jangan menekan Broadcast Email, Broadcast Pesan, atau membuka form responden untuk menguji link. Pemeriksaan hasil dilakukan melalui data dan UI pengaturan.

## 7. Pagination otomatis

Next otomatis menjadi pilihan utama. Mode manual dapat disediakan melalui Jeda/Lanjutkan.

- Simpan hasil seluruh baris target pada halaman sebelum berpindah.
- Proses daftar ID, bukan indeks baris yang berubah setelah penyimpanan.
- Catat tahap halaman dan signature kumpulan ID sebelum/ sesudah Next.
- Tunggu pagination dan kumpulan ID berubah; hentikan bila tombol Next tidak aktif atau halaman yang sama terulang.
- Jika filter, survei, periode, atau urutan berubah di tengah proses, jeda untuk menghindari ketidakcocokan cakupan.
- Halaman terakhir tetap diproses walaupun berisi kurang dari 100 baris.
- Saat melanjutkan, cari target berdasarkan ID; nomor halaman hanyalah petunjuk.

Jika totalnya tepat 1.000 baris, 100 baris per halaman berarti 10 halaman. Jika 1.000 adalah jumlah halaman pada ukuran 10, total barisnya berbeda dan harus diverifikasi terlebih dahulu.

## 8. Penyimpanan, error, dan resume

Tahap per assignment:

`TERCATAT → DATA_TERSIMPAN → MODE_DIVERIFIKASI → LINK_TERSIMPAN → SELESAI`

Simpan juga tahap sebelum tindakan yang menulis perubahan. Jika proses terputus saat save, baca mode aktual dahulu sebelum memutuskan apakah perlu mencoba ulang.

- Simpan progres per tahap penting dan hasil per baris, tidak menunggu 100 baris selesai.
- Perintah Jeda menghentikan langkah berikutnya setelah tindakan yang sedang berjalan mencapai keadaan yang jelas.
- Hentikan tetap mempertahankan hasil dan menyediakan ekspor parsial.
- Resume melewati assignment selesai. Assignment yang sudah CAWI tetapi belum memiliki link dilanjutkan dari pengambilan link.
- Error baca/timeout sementara dapat dicoba ulang secara terbatas dengan jeda bertambah.
- Save mode atau pembuatan link yang timeout harus diperiksa hasilnya sebelum diulang.
- Error lokal dicatat; lanjutkan hanya jika dialog tertutup dan identitas baris berikutnya dapat dipastikan.
- Login kedaluwarsa, perubahan filter, kegagalan selector, atau identitas ambigu menjeda seluruh proses.
- Riwayat mencatat ID, tahap, waktu, percobaan, dan pesan kesalahan. Token link lengkap tidak perlu masuk log debug.
- Data lama dipertahankan sampai pengguna sengaja menghapusnya.

## 9. Struktur Excel

Workbook memiliki tiga sheet:

### DATA

Seluruh kolom sumber mengikuti nama dan urutan header aktual. Kolom yang terlihat pada screenshot:

1. Kode Identitas
2. Nama Keluarga/Bangunan/Usaha
3. Alamat Prelist
4. Nomor Urut Bangunan / IDSBR
5. NIB / No. KK
6. Email
7. Skala Usaha / Jenis Prelist
8. Jumlah Usaha
9. Kode Pos
10. Perubahan SLS
11. IDSBR UMKM SLS Sama
12. Status
13. Mode
14. Petugas Saat Ini
15. Keterangan

Header tersebut perlu dikonfirmasi di halaman. Kolom sumber tambahan tetap disertakan. Kolom tersembunyi dapat diperiksa melalui pengaturan Kolom bila pengguna menginginkan semua kolom yang tersedia di sana.

Tambahan audit: ID Assignment, Mode Awal, Mode Akhir, Unique Link, Hasil Proses, Tahap Terakhir, Waktu Ambil Data, Waktu Verifikasi Mode, Waktu Ambil Link, Halaman Asal, Jumlah Percobaan, dan Pesan Error. Wilayah ditambahkan jika tersedia pada UI atau sebagai metadata filter yang terverifikasi.

### ERROR

Daftar assignment gagal atau dilewati beserta identitas, tahap terakhir, dan alasan agar dapat ditindaklanjuti.

### RINGKASAN

Survei/periode, filter, waktu mulai/selesai, total inventaris, selesai, gagal, dilewati, tertunda, jumlah mode berubah, serta jumlah yang sudah CAWI sejak awal.

Ketentuan format:

- Kode identitas, ID, NIB/KK, kode pos, dan nomor telepon bila tersedia disimpan sebagai teks supaya angka panjang dan nol awal tidak berubah.
- Data teks dari sumber ditulis sebagai sel teks, bukan formula.
- Unique Link berisi URL lengkap dan hyperlink yang bisa diklik.
- Aktifkan filter, bekukan header, dan atur lebar kolom.
- Pertahankan nilai kosong atau tanda `-` sesuai sumber secara konsisten.
- Ekspor dapat dilakukan kapan saja; sediakan unduhan checkpoint setelah setiap halaman selesai.

## 10. Tahapan pembangunan dan pengujian

| Tahap | Hasil yang harus tersedia sebelum lanjut |
|---|---|
| 1. Pemeriksaan | Selector terverifikasi, jumlah/cakupan jelas, sumber ID dan URL lengkap ditemukan |
| 2. Pembacaan | Inventaris dan ekspor data sumber benar tanpa mengubah mode |
| 3. Pilot | Sampel 3–5 assignment OPEN mencakup CAPI, PAPI, dan CAWI jika tersedia; toggle OFF, perubahan benar, link cocok |
| 4. Ketahanan | Resume, timeout setelah save, dialog gagal, halaman berulang, dan filter berubah ditangani |
| 5. Satu halaman | Maksimal 100 assignment dengan rekonsiliasi ID, mode, URL, dan jumlah hasil |
| 6. Seluruh Palu | Semua halaman sesuai filter diproses; hasil gagal/dilewati/tertunda jelas |
| 7. Perluasan | Konfigurasi wilayah diubah untuk Sulawesi Tengah dengan metadata dan inventaris terpisah |

Fixture DOM lokal digunakan untuk menguji pemetaan kolom, pemilihan baris, state toggle, dan dialog tanpa mengubah produksi berulang kali. Excel diverifikasi dengan membaca kembali hasil ekspor, termasuk identifier panjang, karakter khusus, dan URL lengkap.

Waktu total diestimasi dari pilot: waktu inventaris + jumlah assignment × rata-rata durasi per assignment + retry dan ekspor. Belum ada dasar untuk menjanjikan durasi tertentu dari screenshot saja.

## 11. Kriteria selesai

- Jumlah assignment unik sesuai inventaris filter yang terverifikasi.
- Setiap assignment memiliki hasil: selesai, gagal, dilewati, atau tertunda; tidak ada baris hilang diam-diam.
- Assignment selesai memiliki data lengkap, mode akhir CAWI terverifikasi, dan URL lengkap yang terkait dengan ID yang benar.
- Pengiriman email/pesan tidak terjadi sesuai kebijakan yang disepakati.
- Excel dapat dibuka dan identifier panjang tetap utuh.
- Proses yang terputus dapat dilanjutkan tanpa mengulangi assignment selesai.
- Pekerjaan dinyatakan tuntas untuk seluruh target yang memenuhi aturan kelayakan setelah tidak ada target gagal/tertunda yang belum ditangani.

## 12. Keputusan dan informasi berikutnya

Sudah diputuskan: ekstensi Chrome, semua jenis baris, hanya OPEN, pengiriman email dan pesan OFF, serta jumlah target dibaca otomatis. Konfigurasi wilayah harus mendukung Palu dan seluruh Sulawesi Tengah.

URL tabel dan list sudah diterima:

- [Tabel](https://fasih-sm.bps.go.id/app/surveys/a0429e96-51a5-477b-a415-485f9c153004/fd68e454-ba45-4b85-8205-f3bf777ded24/data?page=1&perPage=100&search=-+ec+-&view=table)
- [List](https://fasih-sm.bps.go.id/app/surveys/a0429e96-51a5-477b-a415-485f9c153004/fd68e454-ba45-4b85-8205-f3bf777ded24/data?page=1&perPage=100&search=-+ec+-&view=list)

Survei: `a0429e96-51a5-477b-a415-485f9c153004`. Identitas path kedua: `fd68e454-ba45-4b85-8205-f3bf777ded24`; arti sebagai periode/tahap perlu dicocokkan dengan UI. Parameter awal: `page=1`, `perPage=100`, `search=- ec -`; hanya `view` berbeda antara kedua URL. Filter wilayah tidak tercantum pada URL ini, sehingga tidak boleh menyimpulkan bahwa membuka URL tersebut otomatis menerapkan Kota Palu. Ekstensi mencatat filter UI dan konfigurasi cakupan pengguna sebelum mulai.

Jumlah aktual, kolom tabel, asosiasi label switch, menu/dialog, opsi CAWI, tombol simpan, dan elemen URL setelah pembuatan diperiksa saat diagnostik/pilot. Kolom dari Kode Identitas sampai paling kanan wajib masuk Excel. Jika total hasil tidak ditampilkan secara jelas, inventaris dihitung dari assignment unik sampai Next nonaktif; ketidaktersediaan angka total UI dicatat, bukan diganti dengan badge 11.649.

Keputusan ini menentukan cakupan implementasi. Pemeriksaan halaman dan pilot diperlukan sebelum menjalankan perubahan massal.

## 13. Pemetaan selector berdasarkan HTML pengguna

Status bukti pada tabel berikut berarti cocok dengan HTML yang dikirim; bukan bukti bahwa interaksi sudah diuji pada FASIH aktif.

| Elemen | Selector/aturan pencarian | Bukti dan batas |
|---|---|---|
| Kandidat kartu list | `div[class~="f:overflow-hidden"][class~="f:bg-card"][class~="f:border"]` | Ada pada HTML; kandidat wajib memiliki satu identitas, satu menu, dan grid detail yang valid |
| Kode lengkap di kartu | `button[type="button"][class~="f:underline"]` di kartu target | Baca `textContent` penuh; class truncate hanya memotong tampilan pada contoh |
| Menu tiga titik | `button[aria-haspopup="menu"]` di kartu target | Verifikasi memiliki SVG `.tabler-icon-dots-vertical` dan hanya satu kandidat |
| Status | Badge pada header dengan token class `f:capitalize` | Baca teks tepat OPEN; jangan cari kata OPEN di seluruh halaman |
| Grid detail | `div[class~="f:grid"][class~="f:grid-cols-2"]` di kartu | Ambil anak langsung sebagai kelompok data |
| Label dan nilai | Dua div anak langsung dari setiap kelompok | Petakan berdasarkan nama label; baca `textContent`, jangan berdasarkan posisi field global |
| Mode kartu | Badge di footer kartu yang teksnya tepat CAPI, PAPI, atau CAWI | Jangan tertukar dengan status header atau opsi dropdown |
| Dropdown mode | `button[role="combobox"]` dalam dialog Ganti Mode | Ada pada HTML; harus tepat satu kandidat di dialog yang benar |
| Switch | `button[role="switch"]` dalam dialog | Ada pada HTML; kondisi dibaca dari `aria-checked` |
| Dapatkan Unique Link | Tombol dengan teks tepat `Dapatkan Unique Link` dalam dialog Pengaturan Email | HTML ini adalah tombol mendapatkan link, bukan bukti tombol copy URL |
| Next | `button[aria-label="Go to next page"]` | Ada pada HTML; verifikasi tidak disabled, lalu tunggu halaman/identitas berubah |

### Pemilihan assignment

1. Ambil kode lengkap dari button pada setiap kartu.
2. Pertahankan kode lengkap sebagai teks sumber. Buat kunci pencocokan dari kode lengkap yang hanya dinormalisasi spasinya, beserta survei dan identitas path kedua.
3. Jangan mengambil hanya 16 digit awal: contoh dua kartu pada screenshot mempunyai awalan sama tetapi akhiran kode berbeda.
4. Untuk aksi, cari kembali kartu berdasarkan kunci tersebut. Harus tepat satu kartu; duplikasi atau pencocokan ambigu menghentikan aksi.
5. ID `radix-_r_ii_` dan `_r_164_-form-item` pada contoh tidak dijadikan nilai tetap. Hubungan label-control boleh menggunakan ID aktual yang dibaca dari DOM pada saat itu.

### Menu dan popup yang belum disertakan

Menu Ganti Mode dan Pengaturan Email dicari berdasarkan teks tepat pada menu yang baru dibuka. Jika menu berada di portal di luar kartu, gunakan `aria-controls` yang tersedia atau satu menu terbuka yang terverifikasi setelah klik tombol kartu target. Jangan mencoba mencari item menu hanya sebagai anak kartu.

Dialog diverifikasi lewat judul Ganti Mode atau Pengaturan Email. Role `dialog`, `menuitem`, dan `option` digunakan bila memang tersedia; HTML ketiganya belum disertakan, sehingga role ini bukan selector yang sudah terkonfirmasi. Pencarian berbasis teks di container aktif menjadi cadangan dengan syarat kandidat unik.

Opsi CAWI dipilih berdasarkan teks tepat CAWI di dropdown yang sedang terbuka. Tombol simpan dicari lewat teks tepat Ubah Mode Pendataan dalam dialog Ganti Mode. Tombol penutup harus dipetakan dalam dialog aktif; tidak mengandalkan posisi layar atau sembarang tombol X.

### Memastikan kedua switch OFF

HTML switch yang dikirim menunjukkan `aria-checked="true"`, tetapi tidak menyertakan label atau container yang mengidentifikasi apakah itu Email atau Pesan. Implementasi harus menghubungkan setiap switch dengan label Kirim Email/Kirim Pesan melalui label `for`, `aria-labelledby`, atau container field yang unik. Jangan menebak bahwa switch pertama selalu Email.

Untuk masing-masing kontrol: `true` berarti klik sekali lalu tunggu `false`; `false` berarti tidak diklik. Data-state unchecked menjadi pemeriksaan pendukung. Nilai `value="on"` bukan indikator bahwa switch sedang aktif. Save hanya dijalankan ketika kedua kontrol berhasil diidentifikasi, keduanya OFF, dan pilihan mode CAWI terverifikasi.

### Pembacaan URL dan pemeriksaan kelengkapan

Elemen URL setelah Dapatkan Unique Link belum disertakan. Adapter memeriksa input, anchor, atau teks URL yang benar-benar ditampilkan di bagian Unique Link pada dialog aktif. Hanya URL lengkap yang diterima. Jika clipboard dibutuhkan, uji jalur tersebut pada pilot; keberhasilan klik tombol saja tidak menandai assignment selesai.

Tabel yang belum diberikan HTML-nya tetap harus menghasilkan Petugas Saat Ini dan Keterangan. Jika nilai kedua kolom tidak dapat dibaca, diagnostik menampilkan kekurangan tersebut dan mencegah pekerjaan massal dinyatakan siap. Ekspor diagnostik/parsial membedakan field tidak terbaca dari nilai sumber kosong.

### Source yang tidak dipakai

Bagian View Page Source berisi script `/TSPD/` dan tidak memuat menu/dialog FASIH yang dimaksud. Bagian tersebut tidak dipakai sebagai selector, tidak dijalankan, dan tidak dimasukkan ke ekstensi. DOM kartu dan kontrol yang diberikan secara terpisah menjadi referensi implementasi.

## 14. Urutan implementasi setelah pemetaan ini

1. Buat kerangka ekstensi Chrome serta panel kontrol dan diagnostik baca-saja.
2. Buat adapter list berdasarkan selector HTML pengguna, lalu fixture untuk kartu, label/value, kode lengkap, status, mode, dan tombol menu.
3. Lengkapi pembaca tabel dan rekonsiliasi antartampilan; pastikan 15 kolom sumber yang sudah diketahui terisi dari data aktual.
4. Buat pengendali dialog/menu yang mencari label dalam container aktif dan berhenti pada kandidat ambigu.
5. Buat runner serial, state per assignment, penyimpanan lokal, resume, serta pagination dengan pemeriksaan Next dan deteksi siklus.
6. Buat ekspor Excel dan validasi hasil baca kembali, khususnya identifier panjang dan link lengkap.
7. Jalankan diagnostik dan pilot di tab Chrome pengguna untuk memverifikasi bagian dinamis yang belum tersedia; tidak perlu inspeksi ulang lewat browser Codex.
8. Setelah pilot lolos, uji satu halaman, kemudian jalankan seluruh target wilayah yang sudah diverifikasi.
