#!/usr/bin/env python3
"""Development server + read-only GeoServer reverse proxy (Python 3 stdlib).

Run: py -3 serve.py
Open: http://localhost:5500
GeoServer must already be running on http://127.0.0.1:8080

For phones on the same Wi-Fi: py -3 serve.py --host 0.0.0.0
Only intended for local development/LAN testing. Not a production internet server.
"""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from urllib.parse import urlsplit, parse_qs
import json
import re

ROOT = Path(__file__).resolve().parent
HOP_BY_HOP = {"transfer-encoding", "connection", "keep-alive", "proxy-connection", "upgrade", "te", "trailer"}


class WebGISHandler(SimpleHTTPRequestHandler):
    proxy_base = 'http://127.0.0.1:8080'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path.startswith('/geoserver/'):
            self._proxy(head=False)
        else:
            super().do_GET()

    def do_HEAD(self):
        if urlsplit(self.path).path.startswith('/geoserver/'):
            self._proxy(head=True)
        else:
            super().do_HEAD()

    def do_POST(self):
        # Izinkan hanya rendering GetMap WMS dengan style SLD_BODY, tanpa
        # memberi akses ke REST/API admin GeoServer.
        route = urlsplit(self.path)
        if not re.fullmatch(r'/geoserver/(?:[a-zA-Z0-9_.-]+/)?wms/?', route.path, flags=re.I):
            self._json_error(405, 'POST hanya diizinkan untuk WMS GetMap.')
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self._json_error(400, 'Content-Length tidak valid.')
            return
        if length <= 0 or length > 100000:
            self._json_error(413, 'Ukuran style tidak valid atau terlalu besar.')
            return
        if 'application/x-www-form-urlencoded' not in self.headers.get('Content-Type', '').lower():
            self._json_error(415, 'Gunakan application/x-www-form-urlencoded.')
            return
        body = self.rfile.read(length)
        try:
            kv = parse_qs(body.decode('utf-8'), keep_blank_values=True)
        except UnicodeError:
            self._json_error(400, 'Payload harus UTF-8.')
            return
        if kv.get('REQUEST', kv.get('request', ['']))[0].lower() != 'getmap' or kv.get('SERVICE', kv.get('service', ['']))[0].lower() != 'wms':
            self._json_error(403, 'Hanya WMS GetMap yang diizinkan.')
            return
        target = self.proxy_base.rstrip('/') + route.path
        request = Request(target, data=body, method='POST', headers={
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Encoding': 'identity',
            'User-Agent': 'GeoPortal-Magelang/2.0'
        })
        try:
            with urlopen(request, timeout=60) as remote:
                self._send_remote(remote)
        except HTTPError as exc:
            self._send_remote(exc)
        except (URLError, TimeoutError, OSError) as exc:
            self._json_error(502, 'Tidak bisa menghubungi GeoServer saat rendering SLD: ' + str(exc))

    def _json_error(self, code, message):
        body = json.dumps({'error': message}, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _proxy(self, head=False):
        # Restrict the development proxy to OGC service endpoints; never proxy
        # /geoserver/web, /geoserver/rest, or administrative routes.
        if not re.fullmatch(r'/geoserver/(?:[a-zA-Z0-9_.-]+/)?(?:wms|wfs|wcs)/?', urlsplit(self.path).path, flags=re.I):
            self._json_error(403, 'Hanya endpoint WMS/WFS/WCS yang dapat diakses melalui proxy.')
            return
        # Fixed upstream: query parameters from a GetMap/GetFeatureInfo request
        # never determine the upstream host, so the endpoint is not an open proxy.
        target = self.proxy_base.rstrip('/') + self.path
        request = Request(target, method='HEAD' if head else 'GET', headers={'Accept-Encoding': 'identity', 'User-Agent': 'GeoPortal-Magelang/1.0'})
        try:
            with urlopen(request, timeout=45) as remote:
                self._send_remote(remote, head=head)
        except HTTPError as exc:
            self._send_remote(exc, head=head)
        except (URLError, TimeoutError, OSError) as exc:
            self._json_error(502, 'GeoServer tidak bisa diakses di ' + self.proxy_base + '. Pastikan GeoServer aktif. Rincian: ' + str(exc))

    def _send_remote(self, remote, head=False):
        self.send_response(remote.status)
        for name, value in remote.headers.items():
            if name.lower() not in HOP_BY_HOP:
                self.send_header(name, value)
        self.send_header('Connection', 'close')
        self.end_headers()
        self.close_connection = True
        if not head:
            try:
                while True:
                    data = remote.read(65536)
                    if not data:
                        break
                    self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass


def main():
    parser = argparse.ArgumentParser(description='Jalankan GeoPortal Magelang secara lokal.')
    parser.add_argument('--host', default='127.0.0.1', help='Alamat bind, gunakan 0.0.0.0 untuk akses dari HP pada Wi-Fi yang sama')
    parser.add_argument('--port', type=int, default=5500, help='Port website (default 5500)')
    parser.add_argument('--geoserver-url', default='http://127.0.0.1:8080', help='Alamat server GeoServer asli')
    args = parser.parse_args()
    address = urlsplit(args.geoserver_url)
    if address.scheme not in {'http', 'https'} or not address.netloc or address.path not in {'', '/'} or address.query:
        parser.error('--geoserver-url harus berupa alamat dasar host, misalnya http://127.0.0.1:8080')
    WebGISHandler.proxy_base = args.geoserver_url.rstrip('/')
    server = ThreadingHTTPServer((args.host, args.port), WebGISHandler)
    print('\n' + '=' * 56)
    print(' GeoPortal Magelang | WebGIS WMS + GeoServer')
    print('=' * 56)
    print(f' Buka WebGIS  : http://localhost:{args.port}')
    print(f' Proxy GeoServer: {args.geoserver_url}')
    if args.host == '0.0.0.0':
        print(f' Dari HP    : http://IP-KOMPUTER:{args.port}')
    print(' Tekan Ctrl+C untuk menghentikan server.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer dihentikan.')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
