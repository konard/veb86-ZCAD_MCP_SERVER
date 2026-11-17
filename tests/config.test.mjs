import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../dist/config.js';

test('configuration defaults, file and environment precedence', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'zcad-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'config.json');
  await writeFile(file, JSON.stringify({ zcad: { baseUrl: 'http://localhost:5001', timeoutMs: 4000 }, mcp: { transport: 'streamable-http' } }));
  const defaults = await loadConfig({});
  assert.equal(defaults.mcp.transport, 'stdio');
  assert.equal(defaults.zcad.timeoutMs, 35000);
  assert.equal(defaults.debug, false);
  const config = await loadConfig({ ZCAD_MCP_CONFIG: file, ZCAD_HTTP_URL: 'https://localhost:5002', MCP_HTTP_PORT: '1234', ZCAD_HTTP_TOKEN: 'test', ZCAD_HTTP_HEADERS: '{"x-test":"value"}', ZCAD_MCP_DEBUG: 'true', ZCAD_ALLOWED_COMMANDS: '["PING"]' });
  assert.equal(config.zcad.timeoutMs, 4000);
  assert.equal(config.zcad.baseUrl, 'https://localhost:5002');
  assert.equal(config.mcp.transport, 'streamable-http');
  assert.equal(config.mcp.port, 1234);
  assert.equal(config.zcad.token, 'test');
  assert.deepEqual(config.zcad.allowedCommands, ['PING']);
  assert.deepEqual(config.zcad.headers, { 'x-test': 'value' });
  assert.equal(config.debug, true);
});

test('invalid configurations fail before startup', async (t) => {
  for (const env of [
    { ZCAD_HTTP_URL: 'ftp://example.com' }, { ZCAD_HTTP_URL: 'http://example.com/prefix' },
    { ZCAD_HTTP_URL: 'http://user:password@example.com' }, { ZCAD_HTTP_TIMEOUT_MS: '-1' },
    { ZCAD_HTTP_TIMEOUT_MS: 'Infinity' }, { MCP_HTTP_PORT: '' }, { MCP_HTTP_PORT: '65536' },
    { MCP_TRANSPORT: 'unknown' }, { MCP_HTTP_HOST: '0.0.0.0' },
    { ZCAD_HTTP_HEADERS: 'not-json' }, { ZCAD_HTTP_HEADERS: '{"bad header":"x"}' },
    { ZCAD_MCP_DEBUG: '1' }, { ZCAD_ALLOWED_COMMANDS: '["lowercase"]' },
  ]) await assert.rejects(loadConfig(env));
  const dir = await mkdtemp(join(tmpdir(), 'zcad-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'config.json');
  await writeFile(file, '{"zcad":{"timeotMs":2}}');
  await assert.rejects(loadConfig({ ZCAD_MCP_CONFIG: file }));
  await writeFile(file, '{');
  await assert.rejects(loadConfig({ ZCAD_MCP_CONFIG: file }));
  await assert.rejects(loadConfig({ ZCAD_MCP_CONFIG: join(dir, 'missing') }));
});
