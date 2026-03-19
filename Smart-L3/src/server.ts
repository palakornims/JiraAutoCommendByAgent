// Smart L3 — Webhook Server
import { config } from "dotenv";
config();

import express from "express";
import { loadMcpConfig, connectAllServers, collectAllTools, ConnectedMcpClients, McpTool } from "./mcp";
import { run } from "./agent";

const app = express();
app.use(express.json());

// Shared MCP state — initialized once on startup
let mcpClients: ConnectedMcpClients;
let mcpTools: McpTool[];
let bedrockSpecs: any[];

/** Ticket details extracted from Jira automation webhook payload. */
export interface TicketDetails {
  key: string;
  summary: string;
  description: string;
  project: string;
  issueType: string;
  status: string;
  priority: string;
  reporter: string;
  labels: string[];
}

/** Extracts ticket details from a Jira automation webhook payload. */
export function extractTicketDetails(body: any): TicketDetails {
  return {
    key: body.key ?? body.issue?.key ?? 'UNKNOWN',
    summary: body.summary ?? '',
    description: body.description ?? '',
    project: body.project?.name ?? '',
    issueType: body.issueType?.name ?? '',
    status: body.status?.name ?? '',
    priority: body.priority?.name ?? '',
    reporter: body.reporter?.displayName ?? '',
    labels: body.labels ?? [],
  };
}

app.post("/webhook/pi-ticket", (req, res) => {
  const ticket = extractTicketDetails(req.body);
  console.log(`[Smart L3] Received ticket: ${ticket.key} — ${ticket.summary}`);
  res.sendStatus(202);
  run(ticket, mcpClients, mcpTools, bedrockSpecs).catch((err) =>
    console.error(`[Smart L3] Agent error for ${ticket.key}:`, err)
  );
});

async function main() {
  // 1. Connect to all MCP servers on startup
  console.log("[Smart L3] Loading MCP config...");
  const configs = loadMcpConfig();
  console.log(`[Smart L3] Found ${configs.length} MCP server(s). Connecting...`);

  mcpClients = await connectAllServers(configs);
  const collected = await collectAllTools(mcpClients);
  mcpTools = collected.tools;
  bedrockSpecs = collected.bedrockToolSpecs;

  console.log(`[Smart L3] Connected to ${Object.keys(mcpClients).length} server(s), ${mcpTools.length} tools available.`);

  // 2. Start Express server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`[Smart L3] Webhook server listening on port ${port}`);
    console.log(`[Smart L3] Ready! POST /webhook/pi-ticket to analyze a ticket.`);
  });
}

main().catch((err) => {
  console.error("[Smart L3] Startup failed:", err);
  process.exit(1);
});

export { app };
