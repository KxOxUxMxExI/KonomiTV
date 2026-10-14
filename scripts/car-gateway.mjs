import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
const contentPolicy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' blob:; media-src 'self' blob:; " +
    "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

/** Serve only the car build and a read-only allowlist; never expose household settings/admin APIs. */
export function createGateway({ distDir, upstream }) {
    const root = resolve(distDir);
    const target = new URL(upstream);
    if (target.protocol !== 'http:' || !['127.0.0.1', '127.0.0.77', 'localhost'].includes(target.hostname) || target.username || target.password) {
        throw new Error('The upstream must be an unauthenticated loopback HTTP endpoint');
    }
    let activeStreams = 0;
    return http.createServer(async (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', contentPolicy);
        const fail = (status) => {
            res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ error: http.STATUS_CODES[status] }));
        };
        // Reject write methods before any request is forwarded to the existing service.
        if (!['GET', 'HEAD'].includes(req.method)) { fail(405); return; }
        let path;
        try {
            path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        } catch { fail(400); return; }
        if (path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) { fail(400); return; }
        if (path === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            res.end(JSON.stringify({ service: 'KomenoTV', activeStreams }));
            return;
        }
        if (path.startsWith('/api/')) {
            const allowed = /^\/api\/(channels(?:\/[a-z0-9-]+\/logo)?|version)$/.test(path) ||
                /^\/api\/streams\/live\/[a-z0-9-]+\/480p-hevc(?:\/(mpegts|events))?$/.test(path);
            if (!allowed) { fail(404); return; }
            if (req.method !== 'GET') { fail(405); return; }
            const isStream = path.endsWith('/mpegts');
            if (isStream) activeStreams++;
            const proxy = http.request(new URL(path, target), { method: 'GET', headers: { Accept: req.headers.accept ?? '*/*' } }, response => {
                const headers = {};
                // Do not forward cookies, authentication, redirects or upstream policy headers.
                for (const name of ['content-type', 'content-length', 'content-encoding', 'cache-control', 'etag', 'last-modified']) {
                    if (response.headers[name] !== undefined) headers[name] = response.headers[name];
                }
                res.writeHead(response.statusCode ?? 502, headers);
                response.on('error', () => res.destroy());
                response.pipe(res);
            });
            proxy.setTimeout(30_000, () => proxy.destroy(new Error('Upstream timeout')));
            proxy.on('error', () => {
                if (!res.destroyed && !res.headersSent) fail(502);
                else res.destroy();
            });
            // A closed browser response must close the old tuner connection immediately.
            res.once('close', () => {
                if (isStream) activeStreams--;
                proxy.destroy();
            });
            proxy.end();
            return;
        }
        const filePath = path === '/' || path === '/tv' || path === '/tv/' ? resolve(root, 'index.html') :
            resolve(root, '.' + path);
        if (!filePath.startsWith(root + sep)) { fail(400); return; }
        try {
            const info = await stat(filePath);
            if (!info.isFile()) { fail(404); return; }
            res.writeHead(200, {
                'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
                'Content-Length': info.size,
                'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600',
            });
            if (req.method === 'HEAD') { res.end(); return; }
            createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
        } catch { fail(404); }
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const server = createGateway({
        distDir: fileURLToPath(new URL('../client/dist-car/', import.meta.url)),
        upstream: process.env.KOMENO_UPSTREAM ?? 'http://127.0.0.77:7010',
    });
    server.listen(Number(process.env.KOMENO_PORT ?? 7110), '127.0.0.77', () => {
        console.log('[KomenoTV] Read-only gateway listening on loopback port', server.address().port);
    });
    server.on('error', error => { console.error('[KomenoTV] Gateway failed:', error.message); process.exitCode = 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}