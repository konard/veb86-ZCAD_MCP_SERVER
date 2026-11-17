import { McpServer } from '@modelcontextprotocol/server';
import type { ZcadClient } from './zcad-client.js';
import { registerZcadTools, type ToolRegistrar } from './tools.js';

export function createMcpServer(zcad: ZcadClient, registrars: ToolRegistrar[] = [registerZcadTools]): McpServer {
  const server = new McpServer({ name: 'zcad-mcp-server', version: '0.1.0' });
  for (const register of registrars) register(server, zcad);
  return server;
}
