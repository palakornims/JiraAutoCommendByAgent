// Smart L3 — MCP Client Setup

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// --- Types ---

export type TransportType = 'stdio' | 'http';

export interface StdioServerConfig {
  name: string;
  transport: 'stdio';
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface HttpServerConfig {
  name: string;
  transport: 'http';
  url: string;
  headers: Record<string, string>;
}

export type McpServerConfig = StdioServerConfig | HttpServerConfig;

// Raw shape of a single entry in mcpServers
interface RawServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: string;
  url?: string;
  headers?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
}

// --- JSONC stripping ---

function stripJsonComments(text: string): string {
  // Remove single-line comments (// ...) that are not inside strings
  // and block comments (/* ... */)
  let result = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      result += ch;
      escape = false;
      continue;
    }

    if (inString) {
      if (ch === '\\') escape = true;
      if (ch === '"') inString = false;
      result += ch;
      continue;
    }

    // Not in a string
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }

    if (ch === '/' && text[i + 1] === '/') {
      // Skip until end of line
      while (i < text.length && text[i] !== '\n') i++;
      result += '\n';
      continue;
    }

    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; // skip the closing '/'
      continue;
    }

    result += ch;
  }

  return result;
}

// --- Config loader ---

export function loadMcpConfig(configPath?: string): McpServerConfig[] {
  let resolvedPath = configPath
    ?? process.env.MCP_CONFIG_PATH
    ?? path.join(os.homedir(), '.kiro', 'settings', 'mcp.json');

  // Expand ~ to the user's home directory (Node's fs doesn't do this)
  if (resolvedPath.startsWith('~')) {
    resolvedPath = path.join(os.homedir(), resolvedPath.slice(1));
  }

  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const cleaned = stripJsonComments(raw);
  const parsed = JSON.parse(cleaned);

  const mcpServers: Record<string, RawServerEntry> = parsed.mcpServers ?? {};
  const configs: McpServerConfig[] = [];

  for (const [name, entry] of Object.entries(mcpServers)) {
    if (entry.disabled) continue;

    if (entry.command) {
      configs.push({
        name,
        transport: 'stdio',
        command: entry.command,
        args: entry.args ?? [],
        env: entry.env ?? {},
      });
    } else if (entry.url) {
      configs.push({
        name,
        transport: 'http',
        url: entry.url,
        headers: entry.headers ?? {},
      });
    }
  }

  return configs;
}


// --- Stdio MCP server connection ---

export async function connectStdioServer(config: StdioServerConfig): Promise<Client> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env as Record<string, string>, ...config.env },
  });
  const client = new Client({ name: 'smart-l3', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// --- HTTP MCP server connection ---

export async function connectHttpServer(config: HttpServerConfig): Promise<Client> {
  // Lazy import to avoid pulling in pkce-challenge (dynamic import) at module load time,
  // which breaks Jest without --experimental-vm-modules.
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const transport = new StreamableHTTPClientTransport(new URL(config.url), {
    requestInit: {
      headers: config.headers,
    },
  });
  const client = new Client({ name: 'smart-l3', version: '1.0.0' });
  await client.connect(transport);
  return client;
}

// --- Tool collection and routing ---

export type ConnectedMcpClients = Record<string, Client>;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string; // which MCP server owns this tool
}

export async function connectAllServers(configs: McpServerConfig[]): Promise<ConnectedMcpClients> {
  const clients: ConnectedMcpClients = {};
  for (const config of configs) {
    if (config.transport === 'stdio') {
      clients[config.name] = await connectStdioServer(config);
    } else {
      clients[config.name] = await connectHttpServer(config);
    }
  }
  return clients;
}

export async function collectAllTools(clients: ConnectedMcpClients): Promise<{ tools: McpTool[], bedrockToolSpecs: any[] }> {
  const tools: McpTool[] = [];
  const bedrockToolSpecs: any[] = [];

  for (const [serverName, client] of Object.entries(clients)) {
    const result = await client.listTools();
    for (const tool of result.tools) {
      tools.push({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema,
        serverName,
      });
      bedrockToolSpecs.push({
        toolSpec: {
          name: tool.name,
          description: tool.description ?? '',
          inputSchema: { json: tool.inputSchema },
        },
      });
    }
  }

  return { tools, bedrockToolSpecs };
}

export async function callTool(clients: ConnectedMcpClients, tools: McpTool[], toolName: string, args: any): Promise<any> {
  const tool = tools.find(t => t.name === toolName)!;
  const client = clients[tool.serverName];
  return client.callTool({ name: toolName, arguments: args });
}
