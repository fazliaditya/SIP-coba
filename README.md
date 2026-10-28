# GeoPortal Magelang — WebGIS Ringkas (V4)

Website responsif dengan halaman pembuka tanpa foto, dashboard peta WMS, katalog layer, legenda dari GeoServer, popup informasi tanah, dan opsi unduh. Tidak memuat salinan SHP.

## Menjalankan lokal (Windows)

1. Pastikan GeoServer sudah aktif di `http://localhost:8080/geoserver` dan layer `webgis:jenis_tanah_magelang` sudah dipublikasikan.
2. Ekstrak ZIP, buka PowerShell di folder `GeoPortal_Magelang_WMS_RAPI_FINAL`.
3. Jalankan `py -3 serve.py` (atau klik `START-WEBGIS.bat`).
4. Kunjungi `http://localhost:5500`, lalu klik **Jelajahi Peta**.
5. Pastikan style `jenis_tanah_magelang_kategorikal` sudah ditetapkan sebagai **Default Style** di GeoServer pada layer jenis tanah.

Jika versi lama masih terbuka, hentikan server lama dengan `Ctrl+C` dan pakai `Ctrl+Shift+R` di browser.

## Isi dashboard

- **Kiri:** katalog layer dengan tombol tampil/sembunyikan, legenda otomatis melalui WMS `GetLegendGraphic`. Pencarian hanya muncul jika layer tersedia lima atau lebih.
- **Tengah:** peta WMS sesuai style default GeoServer, basemap Peta/Satelit, zoom, dan klik untuk informasi objek.
- **Kanan:** kelas/jenis tanah terpilih, koordinat, atribut tambahan yang dapat diperluas, tombol salin URL WMS dan unduh PNG. Opsi GeoJSON (WFS, maksimum 5.000 fitur) serta metadata layanan ditempatkan dalam bagian **Opsi unduhan lain**.
- **Halaman awal:** pengantar editorial dengan ringkasan layanan tanpa foto dan tanpa tautan gambar eksternal.

**Catatan:** WMS adalah layanan tampilan peta. Unduh PNG berasal dari WMS, sedangkan unduh GeoJSON berasal dari WFS. Warna/kategori tanah ditentukan di GeoServer agar konsisten dengan QGIS.

## Akses HP (Wi-Fi yang sama)

Gunakan `START-MOBILE.bat` atau `py -3 serve.py --host 0.0.0.0`, cari IP PC melalui `ipconfig` lalu buka `http://IP-PC:5500` di HP. Firewall Windows mungkin perlu mengizinkan port 5500 pada jaringan privat. Browser HP tetap mengakses GeoServer lewat proxy pada komputer.

## Konfigurasi dan publikasi

Ubah `config.js` untuk workspace, nama layer dan alamat WMS. Konfigurasi lokal menggunakan `/geoserver/webgis/wms` dan proxy Python ke `http://127.0.0.1:8080`. `localhost` tidak berfungsi untuk pengunjung dari internet. Untuk hosting publik, diperlukan GeoServer yang dapat diakses via HTTPS (dengan CORS atau reverse proxy). Jangan membuka konsol admin GeoServer tanpa pembatasan akses.

Daftar layer dimuat otomatis dari WMS GetCapabilities. GeoServer harus diaktifkan untuk GetMap, GetCapabilities, GetLegendGraphic dan GetFeatureInfo. Unduh GeoJSON membutuhkan WFS `GetFeature`.

## Pemecahan masalah

| Gejala | Solusi |
|---|---|
| Peta hanya satu warna | Set Default Style kategorikal di GeoServer, lalu segarkan website. |
| Layer tidak tampil | Pastikan GeoServer aktif; periksa alamat WMS di pengaturan gear. |
| Legenda kosong | Periksa GetLegendGraphic dan style layer di GeoServer. |
| Klik poligon tak menampilkan atribut | Periksa GetFeatureInfo dan akses layer. |
| URL lokal gagal di HP | Jalankan mode Mobile dengan `--host 0.0.0.0`, jaringan Wi-Fi sama, buka firewall port 5500. |
