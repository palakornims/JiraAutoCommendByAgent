import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadMcpConfig, McpServerConfig, ConnectedMcpClients, McpTool, collectAllTools, callTool } from '../mcp';

// We'll write temp config files to a tmp dir for testing
const tmpDir = path.join(os.tmpdir(), 'smart-l3-test-' + Date.now());

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(filename: string, content: string): string {
  const p = path.join(tmpDir, filename);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

describe('loadMcpConfig', () => {
  it('parses stdio server entries', () => {
    const configPath = writeConfig('stdio.json', JSON.stringify({
      mcpServers: {
        jira: {
          command: 'npx',
          args: ['-y', '@aashari/mcp-server-atlassian-jira'],
          env: { ATLASSIAN_SITE_NAME: '2c2p' },
        },
      },
    }));

    const configs = loadMcpConfig(configPath);
    expect(configs).toHaveLength(1);
    expect(configs[0]).toEqual({
      name: 'jira',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@aashari/mcp-server-atlassian-jira'],
      env: { ATLASSIAN_SITE_NAME: '2c2p' },
    });
  });

  it('parses HTTP server entries', () => {
    const configPath = writeConfig('http.json', JSON.stringify({
      mcpServers: {
        github: {
          type: 'http',
          url: 'https://api.githubcopilot.com/mcp/',
          headers: { Authorization: 'Bearer tok123' },
        },
      },
    }));

    const configs = loadMcpConfig(configPath);
    expect(configs).toHaveLength(1);
    expect(configs[0]).toEqual({
      name: 'github',
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer tok123' },
    });
  });

  it('skips disabled entries', () => {
    const configPath = writeConfig('disabled.json', JSON.stringify({
      mcpServers: {
        active: { command: 'node', args: ['server.js'] },
        inactive: { command: 'node', args: ['old.js'], disabled: true },
      },
    }));

    const configs = loadMcpConfig(configPath);
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe('active');
  });

  it('strips JSONC single-line comments', () => {
    const jsonc = `{
  "mcpServers": {
    // This is a comment
    "srv": {
      "command": "node",
      "args": ["index.js"]
    }
  }
}`;
    const configPath = writeConfig('comments.json', jsonc);
    const configs = loadMcpConfig(configPath);
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe('srv');
  });

  it('strips JSONC block comments', () => {
    const jsonc = `{
  "mcpServers": {
    /* block comment */
    "srv": {
      "command": "echo",
      "args": ["hi"]
    }
  }
}`;
    const configPath = writeConfig('block.json', jsonc);
    const configs = loadMcpConfig(configPath);
    expect(configs).toHaveLength(1);
  });

  it('handles mixed stdio and http entries', () => {
    const configPath = writeConfig('mixed.json', JSON.stringify({
      mcpServers: {
        jira: { command: 'npx', args: ['-y', 'jira-mcp'], env: { KEY: 'val' } },
        github: { url: 'https://example.com/mcp/', headers: { Auth: 'Bearer x' } },
        disabled: { command: 'nope', disabled: true },
      },
    }));

    const configs = loadMcpConfig(configPath);
    expect(configs).toHaveLength(2);

    const stdio = configs.find(c => c.name === 'jira');
    const http = configs.find(c => c.name === 'github');
    expect(stdio?.transport).toBe('stdio');
    expect(http?.transport).toBe('http');
  });

  it('strips commented-out server blocks (real-world JSONC)', () => {
    const jsonc = `{
  "mcpServers": {
    // "commented-out": {
    //   "command": "ghost",
    //   "args": ["boo"]
    // },
    "real": {
      "command": "node",
      "args": ["real.js"]
    }
  }
}`;
    const configPath = writeConfig('real-world.json', jsonc);
    const configs = loadMcpConfig(configPath);
    expect(configs).toHaveLength(1);
    expect(configs[0].name).toBe('real');
  });
});


// --- Tests for tool collection and routing (Task 2.4) ---

// Helper to create a mock MCP Client with listTools and callTool
function mockClient(tools: Array<{ name: string; description: string; inputSchema: any }>, callToolResult?: any) {
  return {
    listTools: jest.fn().mockResolvedValue({ tools }),
    callTool: jest.fn().mockResolvedValue(callToolResult ?? { content: 'ok' }),
  } as any;
}

// connectAllServers is a thin integration function that calls connectStdioServer/connectHttpServer.
// Since those spawn real processes / make real HTTP connections, we test it indirectly
// through collectAllTools and callTool tests which use mock clients directly.

describe('collectAllTools', () => {
  it('combines tools from multiple servers and tags each with serverName', async () => {
    const clients: ConnectedMcpClients = {
      jira: mockClient([
        { name: 'read_issue', description: 'Read a Jira issue', inputSchema: { type: 'object' } },
      ]),
      github: mockClient([
        { name: 'search_code', description: 'Search code', inputSchema: { type: 'object' } },
        { name: 'get_file', description: 'Get file contents', inputSchema: { type: 'object' } },
      ]),
    };

    const { tools, bedrockToolSpecs } = await collectAllTools(clients);

    expect(tools).toHaveLength(3);
    expect(tools[0]).toEqual({
      name: 'read_issue',
      description: 'Read a Jira issue',
      inputSchema: { type: 'object' },
      serverName: 'jira',
    });
    expect(tools[1].serverName).toBe('github');
    expect(tools[2].serverName).toBe('github');

    // Bedrock specs
    expect(bedrockToolSpecs).toHaveLength(3);
    expect(bedrockToolSpecs[0]).toEqual({
      toolSpec: {
        name: 'read_issue',
        description: 'Read a Jira issue',
        inputSchema: { json: { type: 'object' } },
      },
    });
  });

  it('returns empty arrays when no clients are provided', async () => {
    const { tools, bedrockToolSpecs } = await collectAllTools({});
    expect(tools).toEqual([]);
    expect(bedrockToolSpecs).toEqual([]);
  });
});

describe('callTool', () => {
  it('routes the tool call to the correct server', async () => {
    const jiraClient = mockClient([], { content: 'jira-result' });
    const githubClient = mockClient([], { content: 'github-result' });

    const clients: ConnectedMcpClients = { jira: jiraClient, github: githubClient };
    const tools: McpTool[] = [
      { name: 'read_issue', description: '', inputSchema: {}, serverName: 'jira' },
      { name: 'search_code', description: '', inputSchema: {}, serverName: 'github' },
    ];

    const result = await callTool(clients, tools, 'search_code', { query: 'bug' });

    expect(githubClient.callTool).toHaveBeenCalledWith({ name: 'search_code', arguments: { query: 'bug' } });
    expect(jiraClient.callTool).not.toHaveBeenCalled();
    expect(result).toEqual({ content: 'github-result' });
  });
});
