/*
 * Konfigurasi utama GeoPortal Magelang.
 * Mode lokal: jalankan `py -3 serve.py` untuk mengakses GeoServer lewat proxy
 * pada /geoserver/ dan terhindar dari kendala CORS pada port berbeda.
 *
 * Mode hosting statis: ubah wmsUrl ke URL HTTPS GeoServer publik, dan atur CORS
 * pada GeoServer/reverse proxy. URL localhost TIDAK berfungsi untuk pengunjung.
 */
window.GEOPORTAL_CONFIG = {
  title: 'GeoPortal Magelang',
  workspace: 'webgis',
  wmsUrl: '/geoserver/webgis/wms',
  defaultLayer: 'webgis:jenis_tanah_magelang',
  initialCenter: [110.22, -7.50],
  initialZoom: 10,
  minZoom: 4,
  maxZoom: 18,
  enableWfsExport: true
};
