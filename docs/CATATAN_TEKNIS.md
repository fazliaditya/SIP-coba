# Catatan teknis V4

Frontend menggunakan WMS GetCapabilities, GetMap, GetLegendGraphic, GetFeatureInfo dan WFS GetFeature (opsional). Style tanah sepenuhnya mengikuti Default Style SLD GeoServer. Tidak ada lagi override SLD_BODY, deteksi kategori maupun form manual. `serve.py` meneruskan /geoserver/ ke 127.0.0.1:8080 pada pengembangan lokal. Akses publik membutuhkan GeoServer HTTPS, CORS/reverse proxy dan pengamanan administrasi.
