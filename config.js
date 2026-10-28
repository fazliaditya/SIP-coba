/* SIP-coba — LizPack WMS langsung di browser (mode uji alternatif)
 * Menyiasati HTTP 403 yang dialami fungsi Vercel saat mengambil WMS LizPack.
 * GetCapabilities memakai katalog statis hasil XML resmi 2026-10-29.
 * WMS GetMap tetap dipanggil dari browser melalui HTTPS LizPack.
 * Jika Cloudflare menolak request gambar, perlu bantuan LizPack (allow WMS).
 */
window.GEOPORTAL_CONFIG = {
  title: 'GeoPortal Magelang',
  workspace: 'ws_fazliaditya17',
  wmsUrl: 'https://gs.lizpack.com/geoserver/ws_fazliaditya17/wms',
  defaultLayer: 'jenis_tanah_magelang',
  allowedLayers: ['jenis_tanah_magelang'],
  directWmsMode: true,
  staticLayers: [{
    name: 'jenis_tanah_magelang',
    title: 'Peta Jenis Tanah Kabupaten Magelang',
    description: 'Layer publik dari LizPack GeoServer Cloud. Style saat ini: polygon (abu-abu standar).',
    bounds: [110.04305893200298, -7.706740638786212, 110.44549842714399, -7.322460340523301]
  }],
  configVersion: 'lizpack-wms-direct-2026-10-v3',
  initialCenter: [110.22, -7.50],
  initialZoom: 10,
  minZoom: 4,
  maxZoom: 18,
  enableWfsExport: false
};
