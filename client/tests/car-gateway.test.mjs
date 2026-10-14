import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { createGateway } from '../../scripts/car-gateway.mjs';

async function fixture(t, streaming = false) {
    const distDir = await mkdtemp(join(tmpdir(), 'komeno-test-'));
    await writeFile(join(distDir, 'index.html'), '<title>KomenoTV</title>');
    const received = [];
    let closedStreams = 0;
    const upstream = http.createServer((req, res) => {
        received.push({ method: req.method, url: req.url });
        if (streaming && req.url.endsWith('/mpegts')) {
            res.setHeader('Content-Type', 'video/mp2t');
            res.write(Buffer.alloc(188));
            res.once('close', () => { closedStreams++; });
            return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ channels: ['gr011'] }));
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const gateway = createGateway({ distDir, upstream: `http://127.0.0.1:${upstream.address().port}` });
    gateway.listen(0, '127.0.0.1');
    await once(gateway, 'listening');
    t.after(async () => {
        gateway.closeAllConnections();
        upstream.closeAllConnections();
        await Promise.all([new Promise(done => gateway.close(done)), new Promise(done => upstream.close(done))]);
        // This directory was created by this test and must remain inside the OS temporary directory.
        assert.ok(resolve(distDir).startsWith(resolve(tmpdir()) + '\\') || resolve(distDir).startsWith(resolve(tmpdir()) + '/'));
        await rm(distDir, { recursive: true });
    });
    return { base: `http://127.0.0.1:${gateway.address().port}`, received, closedStreams: () => closedStreams };
}

test('serves the car page with a restrictive content policy', async (t) => {
    const { base } = await fixture(t);
    const response = await fetch(`${base}/tv/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /KomenoTV/);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
});

test('proxies only read-only channel and 480p HEVC requests', async (t) => {
    const { base, received } = await fixture(t);
    assert.equal((await fetch(`${base}/api/channels`)).status, 200);
    assert.equal((await fetch(`${base}/api/streams/live/gr011/480p-hevc/mpegts`)).status, 200);
    assert.equal((await fetch(`${base}/api/streams/live/gr011/1080p/mpegts`)).status, 404);
    assert.deepEqual(received.map(req => req.url), ['/api/channels', '/api/streams/live/gr011/480p-hevc/mpegts']);
});

test('cannot write household settings or reach administrative endpoints', async (t) => {
    const { base, received } = await fixture(t);
    assert.equal((await fetch(`${base}/api/settings/client`, { method: 'PUT', body: '{}' })).status, 405);
    assert.equal((await fetch(`${base}/api/maintenance/restart`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${base}/api/users/me`)).status, 404);
    assert.deepEqual(received, []);
});

test('rejects encoded traversal and malformed paths without exposing files', async (t) => {
    const { base } = await fixture(t);
    assert.equal((await fetch(`${base}/assets/%2e%2e%5c%2e%2e%5cserver/config.yaml`)).status, 400);
    assert.equal((await fetch(`${base}/assets/%00`)).status, 400);
    assert.equal((await fetch(`${base}/not-a-car-route`)).status, 404);
});
test('closing the car stream also releases its upstream connection', async (t) => {
    const { base, closedStreams } = await fixture(t, true);
    const response = await fetch(`${base}/api/streams/live/gr011/480p-hevc/mpegts`);
    assert.equal((await (await fetch(`${base}/health`)).json()).activeStreams, 1);
    await response.body.cancel();
    for (let attempt = 0; attempt < 20 && closedStreams() === 0; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(closedStreams(), 1);
    assert.equal((await (await fetch(`${base}/health`)).json()).activeStreams, 0);
});
