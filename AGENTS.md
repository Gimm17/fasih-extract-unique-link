# Instruksi proyek

- Arahan pengguna terbaru (9 Oktober 2026): hanya ekstraksi unique link dari assignment OPEN yang sudah CAWI di view=list. Langkah perubahan mode CAWI, dropdown, toggle pengiriman, dan save mode sudah dihapus. Kolom opsional yang tidak tampil boleh kosong.

- Setiap pembaruan kode ekstensi yang akan dibagikan harus mempunyai versi baru. Samakan versi di `extension/manifest.json`, `package.json`, dan label versi panel.
- Setelah pemeriksaan yang sesuai selesai, selalu jalankan `node scripts/package.cjs` untuk membuat ZIP siap dibagikan dengan nama `dist/fasih-cawi-link-exporter-v<VERSI>.zip`.
- Pertahankan ZIP versi lama. Jangan menimpa arsip versi yang sama dengan kode berbeda; naikkan versi terlebih dahulu.
- Berikan tautan ZIP versi terbaru pada jawaban akhir setiap pembaruan ekstensi.
