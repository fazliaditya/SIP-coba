/* GeoPortal Magelang — Vercel OGC read-only gateway.
 * GET /geoserver/:workspace/wms|wfs -> this Function -> HTTPS GeoServer endpoint.
 * Configure GEOSERVER_PUBLIC_BASE in Vercel Environment Variables.
 * Never sends user credentials or proxies the GeoServer admin/REST routes.
 */
function fail(message, status) {
  return Response.json({ error: message }, {
    status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  });
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const workspace = requestUrl.searchParams.get('workspace') || '';
  const kind = (requestUrl.searchParams.get('kind') || '').toLowerCase();
  if (!/^[a-zA-Z0-9_.-]{1,100}$/.test(workspace) || !['wms', 'wfs'].includes(kind)) {
    return fail('Endpoint tidak diizinkan. Hanya workspace WMS/WFS yang didukung.', 400);
  }
  const raw = (process.env.GEOSERVER_PUBLIC_BASE || '').trim().replace(/\/$/, '');
  if (!raw) return fail('GEOSERVER_PUBLIC_BASE belum diatur di Vercel → Settings → Environment Variables.', 503);
  let base;
  try { base = new URL(raw); } catch { return fail('GEOSERVER_PUBLIC_BASE bukan URL yang valid.', 503); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    return fail('Gunakan alamat HTTPS dasar tanpa path, mis. https://host-anda.example.com', 503);
  }
  if (['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(base.hostname)) {
    return fail('Vercel tidak dapat mengakses localhost milik komputer pengguna.', 503);
  }
  const upstream = new URL(`/geoserver/${workspace}/${kind}`, base);
  for (const [k, v] of requestUrl.searchParams) {
    if (k !== 'workspace' && k !== 'kind') upstream.searchParams.append(k, v);
  }
  // Only forward known read-only OGC operations, never REST/admin endpoints.
  const operation = (upstream.searchParams.get('REQUEST') || upstream.searchParams.get('request') || '').toLowerCase();
  const allowed = kind === 'wms'
    ? ['getcapabilities', 'getmap', 'getlegendgraphic', 'getfeatureinfo']
    : ['getcapabilities', 'getfeature', 'describefeaturetype'];
  if (!allowed.includes(operation)) return fail('Operasi OGC tidak diizinkan pada proxy publik.', 403);
  let remote;
  try {
    remote = await fetch(upstream, { method: 'GET', headers: { 'Accept': '*/*' }, redirect: 'manual', signal: AbortSignal.timeout(23000) });
  } catch (e) {
    return fail('GeoServer publik tidak dapat dijangkau. Pastikan tunnel/server HTTPS aktif. ' + (e?.name === 'TimeoutError' ? '(timeout)' : ''), 502);
  }
  if (remote.status >= 300 && remote.status < 400) {
    return fail('GeoServer melakukan redirect. Pastikan alamat HTTPS dasar sudah tepat.', 502);
  }
  const headers = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  const contentType = remote.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  return new Response(remote.body, { status: remote.status, headers });
}
