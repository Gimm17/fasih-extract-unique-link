# Deploy FULX lewat Git dan Terminal cPanel

> **Rilis v0.3.5:** untuk pembaruan proyek yang sudah terpasang, ikuti [UPDATE_WILAYAH.md](UPDATE_WILAYAH.md). Migrasi wilayah mempertahankan database, link, dan token; installer tidak perlu dijalankan ulang. Scope awal Kota Palu, prefix 7271, target 11649.

Domain: **https://fulx.pinnhost.my.id**
Repository: **https://github.com/Gimm17/fasih-extract-unique-link.git**
Branch deployment: **main**.

Panduan ini memakai `git clone` untuk pemasangan pertama dan `git pull` untuk pembaruan. Hosting menjalankan backend PHP serta dashboard; ekstensi tetap dipasang pada Chrome masing-masing komputer. Node.js, Composer, dan proses PHP permanen tidak diperlukan.

## 1. Siapkan PHP, domain, dan Terminal

Di cPanel, pilih **PHP 8.3** untuk `fulx.pinnhost.my.id` melalui MultiPHP Manager atau Select PHP Version. Aktifkan **PDO/pdo_mysql**, SSL/AutoSSL, dan pengalihan HTTPS. Buka **Advanced → Terminal**. Nama menu dapat berbeda menurut tema/penyedia hosting.

Jalankan:

```bash
whoami
pwd
git --version
```

Perintah berikut menggunakan `$HOME`, yaitu folder akun hosting Anda. Contoh akun `akunhosting` berarti `$HOME` adalah `/home/akunhosting`.

## 2. Clone repository

Untuk pemasangan baru, jalankan:

```bash
git clone --branch main --single-branch https://github.com/Gimm17/fasih-extract-unique-link.git "$HOME/fulx"
cd "$HOME/fulx"
git status --short
git log -1 --oneline
```

Folder `$HOME/fulx` harus belum ada atau kosong. Jika sudah berisi pemasangan ZIP, jangan hapus/timpa folder tersebut. Clone ke folder baru, misalnya `$HOME/fulx-git`, lalu gunakan folder baru itu untuk semua perintah dan document root di panduan ini. Salin konfigurasi pemasangan lama ke `server/private/config.php` pada clone baru dan gunakan database lama; installer tidak perlu dijalankan kembali.

Jika repository private, gunakan akses GitHub melalui SSH/deploy key yang mempunyai izin membaca repository. Jangan menaruh token atau password dalam URL Git. Panduan autentikasi: [GitHub deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

Struktur hasil clone:

```text
/home/akunhosting/fulx/
  .git/
  extension/
  dist/
  server/
    public/               <- document root domain
      index.html
      api.php
      bootstrap.php
      install.php
      .htaccess
    private/              <- di luar document root
      config.example.php
      config.php          <- dibuat pada langkah 5, diabaikan Git
      Service.php
      schema.sql
```

**Perhatikan:** root deployment dari Git adalah `server/public`, berbeda dari ZIP server yang langsung berisi folder `public` dan `private`.

## 3. Atur document root

Tampilkan path yang perlu dipakai:

```bash
cd "$HOME/fulx"
printf '%s\n' "$PWD/server/public"
```

Di **cPanel → Domains → Manage → fulx.pinnhost.my.id**, atur document root ke hasil perintah tersebut. Contoh:

```text
/home/akunhosting/fulx/server/public
```

Beberapa tampilan cPanel meminta path relatif terhadap home, yaitu `fulx/server/public`. Sesuaikan format yang diminta cPanel. Jangan memilih root repository atau folder `server`; folder `.git`, konfigurasi private, dan file lain harus berada di luar root web.

Jika penyedia membatasi root domain ke dalam `public_html`, minta dukungan hosting mengizinkan path di atas. Perubahan document root tidak memindahkan file otomatis. Jangan memindahkan seluruh repository ke folder web hanya untuk mengatasi pembatasan ini.

## 4. Buat database

Melalui **MySQL Database Wizard** atau **Manage My Databases**:

1. Buat database kosong khusus FULX, misalnya `akunhosting_fulx`.
2. Buat pengguna database, misalnya `akunhosting_fulx`.
3. Hubungkan pengguna ke database tersebut dan beri **ALL PRIVILEGES pada database FULX**.
4. Simpan password database. Nama sebenarnya biasanya memakai awalan akun cPanel.

Gunakan MySQL/MariaDB dengan InnoDB dan utf8mb4. Jika memindahkan pemasangan lama, gunakan database lama sehingga proyek, token komputer, dan hasil tetap tersedia.

## 5. Buat konfigurasi lokal

Perintah ini hanya menyalin contoh jika file konfigurasi belum ada:

```bash
cd "$HOME/fulx"
if [ ! -f server/private/config.php ]; then
  cp server/private/config.example.php server/private/config.php
fi
chmod 600 server/private/config.php
nano server/private/config.php
```

Jika `nano` tidak tersedia, gunakan editor File Manager cPanel untuk file yang sama. Sesuaikan isinya:

```php
<?php
return [
    'dsn' => 'mysql:host=localhost;dbname=akunhosting_fulx;charset=utf8mb4',
    'db_user' => 'akunhosting_fulx',
    'db_password' => 'PASSWORD_DATABASE_ANDA',
    'setup_key' => 'SECRET_ACAK_ANDA_MINIMAL_32_KARAKTER',
    'allow_http' => false,
    'lease_seconds' => 300,
];
```

Ganti password/setup key contoh dengan nilai sendiri. Setup key bisa dibuat melalui password manager atau Terminal:

```bash
openssl rand -hex 32
```

Simpan hasilnya ke `setup_key`. Nilai akan terlihat pada terminal Anda; jangan membagikannya. Jika password mengandung apostrof atau backslash, escape sesuai string PHP, misalnya `\'` dan `\\`. Sesuaikan host database jika penyedia memakai host selain localhost.

`config.php` sudah masuk `.gitignore`; `git pull` normal tidak menimpa file tersebut. Jangan menjalankan perintah pembersihan yang menghapus file ignored. Permission 600 cocok jika PHP berjalan sebagai akun Anda; bila hosting memerlukan pembacaan oleh group, gunakan 640 sesuai arahan hosting, bukan 777.

## 6. Periksa PHP dan koneksi database

Pada server EasyApache cPanel yang menyediakan PHP 8.3 di path standar:

```bash
task_php='/opt/cpanel/ea-php83/root/usr/bin/php'
"$task_php" -v
"$task_php" -r 'echo "PDO MySQL: ", extension_loaded("pdo_mysql") ? "OK" : "TIDAK AKTIF", PHP_EOL;'
```

Jika path tersebut tidak ada, jalankan `command -v php` dan `php -v`, lalu gunakan path PHP CLI yang disediakan hosting, misalnya dari CloudLinux. Pastikan versi CLI yang dipilih mendukung PHP 8.3 atau lebih baru dan mempunyai pdo_mysql. Pemilihan PHP CLI tidak mengubah versi PHP domain; keduanya perlu diperiksa.

Sesudah `task_php` berisi path yang benar:

```bash
cd "$HOME/fulx"
"$task_php" -l server/private/config.php
"$task_php" -l server/private/Service.php
"$task_php" -l server/public/api.php
"$task_php" -l server/public/install.php
"$task_php" -r '$c=require "server/private/config.php"; try { $d=new PDO($c["dsn"],$c["db_user"],$c["db_password"],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]); echo "Koneksi database OK", PHP_EOL; } catch(Throwable $e) { fwrite(STDERR,"Koneksi database gagal; periksa host, nama database, pengguna, password dan izin.\n"); exit(1); }'
git check-ignore server/private/config.php
git status --short
```

Hasil yang diharapkan: sintaks valid, `Koneksi database OK`, konfigurasi terdeteksi ignored, dan `git status --short` kosong. Pemeriksaan koneksi tidak membuat/menghapus tabel atau menampilkan password. File konfigurasi asli hanya disimpan pada hosting.

## 7. Pasang admin dan hubungkan 5 komputer

Untuk **database baru**, buka [installer FULX](https://fulx.pinnhost.my.id/install.php), masukkan setup key, username, dan password admin minimal 12 karakter. Installer membuat tabel dan terkunci setelah admin terbentuk.

Kemudian buka [dashboard FULX](https://fulx.pinnhost.my.id/index.html):

1. Login admin dan buat proyek dengan URL Data FASIH, target **11649**, prefix **72** untuk Sulawesi Tengah, dan domain link **esurvey.bps.go.id**. Filter FASIH harus sesuai; untuk Palu gunakan cakupan/prefix yang benar.
2. Buat 5 token berbeda, satu **Koordinator inventaris** dan empat **Pelaksana**.
3. Pasang ekstensi dari ZIP terbaru di folder `dist` repository pada Chrome tiap komputer.
4. Pada **Pengaturan server** ekstensi, isi `https://fulx.pinnhost.my.id/api.php` dan token komputer tersebut.
5. Koordinator klik **Inventaris ke server**, tunggu jumlah benar dan status Siap.
6. Kelima komputer klik **Mulai tugas server**. Pantau dashboard dan unduh Excel gabungan setelah selesai.

Alur penggunaan, retry, Review, dan reset dijelaskan di [INSTALL.md](INSTALL.md). Untuk database lama, login ke dashboard langsung; jangan membuat ulang database atau menjalankan reset.

## 8. Memperbarui dengan git pull

Sebelum pembaruan server, klik **Jeda pusat**, jeda semua ekstensi, dan sinkronkan hasil yang tertunda. Backup database melalui cPanel atau phpMyAdmin. Backup JSON/Excel berguna untuk hasil, tetapi tidak menggantikan backup database penuh.

Masuk ke folder repository dan periksa status:

```bash
cd "$HOME/fulx"
git branch --show-current
git status --short
git log -1 --oneline
```

Branch harus `main` dan status harus kosong. Jika ada perubahan file tracked, simpan/periksa perubahan itu dahulu; jangan memaksa reset atau menghapusnya.

Backup konfigurasi dan catat commit sebelum update, di luar document root:

```bash
task_backup="$HOME/fulx-backups/$(date +%Y%m%d-%H%M%S)"
(umask 077; mkdir -p "$task_backup")
chmod 700 "$HOME/fulx-backups" "$task_backup"
cp server/private/config.php "$task_backup/config.php"
chmod 600 "$task_backup/config.php"
git rev-parse HEAD > "$task_backup/previous-commit.txt"
```

Ambil informasi perubahan, baca panduan/rilis, lalu update:

```bash
git fetch origin main
git diff --stat HEAD origin/main
git pull --ff-only origin main
git log -1 --oneline
git status --short
git check-ignore server/private/config.php
```

`--ff-only` menolak pembaruan jika riwayat lokal menyimpang; tidak membuat merge otomatis di hosting. Jika perintah gagal, hentikan langkah update dan tangani pesannya, bukan memaksa overwrite.

Sesudah pull, ulangi pemeriksaan sintaks dan koneksi pada langkah 6, kemudian buka dashboard, login, dan cocokkan progres/data. **Jangan menjalankan installer, reset pusat, atau mengimpor schema.sql untuk pembaruan biasa.** Rilis berikutnya yang mengubah skema database perlu petunjuk migrasi khusus; `git pull` hanya memperbarui file, tidak menjalankan migrasi database.

Jika ada versi ekstensi baru, ambil ZIP berversi dari `dist` di GitHub, perbarui folder ekstensi yang sama pada masing-masing komputer, klik Reload di `chrome://extensions`, lalu refresh tab FASIH. `git pull` di hosting tidak memperbarui ekstensi Chrome otomatis.

Setelah pemeriksaan sesuai, klik **Lanjutkan pusat** dan **Lanjutkan** pada setiap komputer yang dijeda.

## 9. Rollback kode bila pembaruan bermasalah

Jeda pusat dan semua komputer terlebih dahulu. Gunakan commit lama dari `previous-commit.txt`, setelah memastikan versi kode lama masih cocok dengan skema database saat ini.

```bash
cd "$HOME/fulx"
git status --short
git log --oneline -10
```

Jika status kosong, ganti placeholder berikut dengan hash commit yang ingin dipakai:

```bash
git switch --detach HASH_COMMIT_LAMA
```

Konfigurasi ignored tetap tersedia. Rollback Git tidak mengembalikan database; jika rilis mengubah skema, ikuti petunjuk migrasi/restore sebelum memakai kode lama. Sesudah pemeriksaan berhasil, layanan dapat dilanjutkan sesuai versi yang dipakai.

Untuk kembali ke branch deployment dan memperbaruinya nanti:

```bash
git switch main
git pull --ff-only origin main
```

## 10. Kendala yang umum

| Pesan/kondisi | Tindakan |
|---|---|
| `git: command not found` | Minta hosting menyediakan Git pada akses Terminal akun. |
| Folder tujuan clone sudah berisi file | Gunakan folder baru dan sesuaikan document root; jangan menghapus pemasangan lama. |
| Tidak bisa mengubah document root | Minta dukungan hosting mengatur ke `server/public`; jangan mengekspos root repository. |
| PHP CLI salah versi/pdo_mysql tidak ada | Pilih binary yang benar; cek juga PHP domain di cPanel. |
| Database belum terhubung | Cek DSN, awalan nama database/pengguna, password, dan izin database. |
| API mengembalikan 403/HTML | Cek endpoint, PHP, ModSecurity, dan penerusan Authorization di `.htaccess` dengan bantuan hosting. |
| `git pull --ff-only` gagal | Periksa branch, status lokal, dan perbedaan riwayat; jangan memaksa reset file. |
| Dashboard belum berubah setelah update | Refresh browser; jika PHP memakai cache lama, minta hosting memperbarui cache OPcache. |

Panduan mengikuti struktur repository FULX saat ini; perintah belum dijalankan pada akun cPanel Anda. Penamaan menu, path PHP, dan izin document root bergantung pada penyedia hosting.

Rujukan: [Terminal/Git cPanel](https://docs.cpanel.net/cpanel/files/git-version-control/), [mengubah document root](https://support.cpanel.net/hc/en-us/articles/360057802373-How-do-I-change-the-document-root-for-an-Addon-Domain-or-Subdomain), [PHP CLI cPanel](https://support.cpanel.net/hc/en-us/articles/360050224413-How-to-run-PHP-commands-as-a-cPanel-user-via-Terminal), [git pull --ff-only](https://git-scm.com/docs/git-pull).
