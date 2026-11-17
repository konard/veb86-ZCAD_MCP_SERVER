// Run against an existing ZCAD instance; this never launches or modifies ZCAD.
import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'zcad-live-smoke', version: '1.0.0' });
const transport = process.env.MCP_SMOKE_URL
  ? new StreamableHTTPClientTransport(new URL(process.env.MCP_SMOKE_URL))
  : new StdioClientTransport({ command: process.execPath, args: ['dist/cli.js'], env: { ...process.env, MCP_TRANSPORT: 'stdio' } });
try {
  await client.connect(transport, { timeout: 5000 });
  const { tools } = await client.listTools();
  assert(tools.some((tool) => tool.name === 'zcad_health'));
  assert(tools.some((tool) => tool.name === 'zcad_execute'));
  const health = await client.callTool({ name: 'zcad_health', arguments: {} });
  assert(!health.isError, JSON.stringify(health));
  console.log('PASS: MCP connection, tool list, GET /ipc availability');
  if (!process.argv.includes('--health-only')) {
    const ping = await client.callTool({ name: 'zcad_execute', arguments: { command: 'PING', args: [] } }, { timeout: 45000 });
    assert(!ping.isError, JSON.stringify(ping));
    const result = ping.structuredContent ?? JSON.parse(ping.content[0].text);
    assert.equal(result.result, 'pong');
    console.log('PASS: POST /ipc PING traversed ZCAD command execution and returned pong');
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
