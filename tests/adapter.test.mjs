import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpAdapter } from '../dist/http-adapter.js';
import { config, fixture, json, body } from './helpers.mjs';

test('adapter forwards method, JSON, query and configured headers', { timeout: 3000 }, async (t) => {
  const url = await fixture(t, async (req, res) => {
    assert.equal(req.method, 'PATCH');
    assert.equal(req.url, '/any?name=%D0%A2%D0%B5%D1%81%D1%82');
    assert.equal(req.headers.authorization, 'Bearer test');
    assert.match(req.headers['content-type'], /application\/json/);
    json(res, { received: await body(req) });
  });
  const adapter = new HttpAdapter(config(url, { zcad: { headers: { authorization: 'Bearer test' } } }).zcad);
  assert.deepEqual(await adapter.request('/any', { method: 'PATCH', query: { name: 'Тест' }, body: { x: [1, '🙂'] } }), { received: { x: [1, '🙂'] } });
});

test('adapter accepts bounded chunked JSON larger than one network chunk', { timeout: 3000 }, async (t) => {
  const expected = 'Ж🙂'.repeat(20_000);
  const url = await fixture(t, (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    const payload = Buffer.from(JSON.stringify({ result: expected }));
    // Slice bytes inside multibyte characters; decoding must span chunks.
    for (let i = 0; i < payload.length; i += 997) res.write(payload.subarray(i, i + 997));
    res.end();
  });
  assert.deepEqual(await new HttpAdapter(config(url).zcad).request('/ipc'), { result: expected });
});

for (const [name, responder, code] of [
  ['HTTP status', (_req, res) => json(res, { secret: 'not exposed' }, 503), 'HTTP_ERROR'],
  ['invalid JSON', (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end('{bad'), 'INVALID_RESPONSE'],
  ['empty body', (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(), 'INVALID_RESPONSE'],
  ['HTML response', (_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end('<html>'), 'INVALID_RESPONSE'],
  ['invalid UTF-8', (_req, res) => res.writeHead(200, { 'content-type': 'application/json' }).end(Buffer.from([0x22, 0xff, 0x22])), 'INVALID_RESPONSE'],
  ['oversize content-length', (_req, res) => res.writeHead(200, { 'content-type': 'application/json', 'content-length': '1000' }).end('x'.repeat(1000)), 'RESPONSE_TOO_LARGE'],
  ['oversize chunked body', (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write(' '.repeat(300)); res.end(' '.repeat(300)); }, 'RESPONSE_TOO_LARGE'],
  ['redirect', (_req, res) => res.writeHead(302, { location: 'http://127.0.0.1:1/secret' }).end(), 'CONNECTION_ERROR'],
]) {
  test(`adapter rejects ${name}`, { timeout: 3000 }, async (t) => {
    const url = await fixture(t, responder);
    await assert.rejects(new HttpAdapter(config(url, { zcad: { maxResponseBytes: 256 } }).zcad).request('/ipc'), { code });
  });
}

test('adapter enforces the deadline while waiting for headers and body', { timeout: 3000 }, async (t) => {
  for (const sendHeaders of [false, true]) {
    const url = await fixture(t, (_req, res) => {
      if (sendHeaders) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{');
      }
    });
    await assert.rejects(new HttpAdapter(config(url, { zcad: { timeoutMs: 50 } }).zcad).request('/ipc'), { code: 'TIMEOUT' });
  }
});

test('adapter handles refusal, caller cancellation, shutdown and request bounds', { timeout: 3000 }, async (t) => {
  const closed = await fixture(t);
  // Reserve then close an ephemeral port to produce an actual connection refusal.
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const unavailable = `http://127.0.0.1:${server.address().port}`;
  await new Promise((resolve) => server.close(resolve));
  await assert.rejects(new HttpAdapter(config(unavailable).zcad).request('/ipc'), { code: 'CONNECTION_ERROR' });
  const adapter = new HttpAdapter(config(closed).zcad);
  await assert.rejects(adapter.request('/ipc', { signal: AbortSignal.abort() }), { code: 'CANCELLED' });
  await assert.rejects(adapter.request('//other-host/ipc'), { code: 'INVALID_REQUEST' });
  await assert.rejects(new HttpAdapter(config(closed, { zcad: { maxRequestBytes: 10 } }).zcad).request('/ipc', { body: 'too large for limit' }), { code: 'REQUEST_TOO_LARGE' });
  const hanging = await fixture(t, () => {});
  const stopping = new HttpAdapter(config(hanging).zcad);
  const pending = stopping.request('/ipc');
  stopping.close();
  await assert.rejects(pending, { code: 'CANCELLED' });
  adapter.close();
  await assert.rejects(adapter.request('/ipc'), { code: 'SHUTTING_DOWN' });
});

test('debug output contains metadata without credentials or payloads', { timeout: 3000 }, async (t) => {
  const url = await fixture(t, (_req, res) => json(res, { result: 'response-secret' }));
  const logs = [];
  const adapter = new HttpAdapter(config(url, { zcad: { headers: { authorization: 'header-secret' } } }).zcad, (message) => logs.push(message));
  await adapter.request('/ipc', { body: { token: 'body-secret' }, query: { token: 'query-secret' } });
  assert.match(logs.join('\n'), /HTTP POST \/ipc 200/);
  assert.doesNotMatch(logs.join('\n'), /secret/);
});
