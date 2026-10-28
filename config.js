/*
 * GeoPortal Magelang — LizPack GeoServer Cloud (tanpa laptop lokal).
 * Proxy Vercel tetap menggunakan /geoserver/:workspace/wms.
 * Vercel -> GEOSERVER_PUBLIC_BASE=https://gs.lizpack.com
 * Workspace cloud: ws_fazliaditya17
 *
 * allowedLayers kosong = hanya tampilkan layer yang dikembalikan oleh
 * virtual workspace WMS LizPack (bukan seluruh katalog GeoServer global).
 * Nama layer diambil otomatis dari GetCapabilities, tidak perlu menebak.
 */
window.GEOPORTAL_CONFIG = {
  title: 'GeoPortal Magelang',
  workspace: 'ws_fazliaditya17',
  wmsUrl: '/geoserver/ws_fazliaditya17/wms',
  defaultLayer: '', // Ambil layer pertama dari GetCapabilities.
  allowedLayers: [], // Otomatis layer dalam workspace pengguna saja.
  configVersion: 'lizpack-2026-10-v1', // Reset sekali setting URL lama dari laptop.
  initialCenter: [110.22, -7.50],
  initialZoom: 10,
  minZoom: 4,
  maxZoom: 18,
  enableWfsExport: true
};
