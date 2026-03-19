# Implementation Plan: Smart L3

## Overview

Build a lean webhook-to-AI-agent pipeline for the 2-day hackathon. Four source files (`server.ts`, `agent.ts`, `mcp.ts`, `prompt.ts`) wired together with Express + MCP SDK + Amazon Bedrock Converse API. Happy path only — no error handling, no retries, no validation. The AI agent connects to 3 MCP servers simultaneously (2 stdio-based: Jira and Confluence, 1 HTTP-based: GitHub), collects all tools into a unified list, and uses Bedrock's tool-use loop to orchestrate calls across all servers — gathering context, analyzing, and posting results back to Jira.

## Tasks

- [x] 1. Project scaffolding and dependencies
  - [x] 1.1 Initialize Node.js project with TypeScript
    - Run `npm init`, install `typescript`, `ts-node`, `express`, `@types/express`
    - Create `tsconfig.json` with strict mode, ES2020 target, and `src/` as root
    - Create `src/` directory with empty files: `server.ts`, `agent.ts`, `mcp.ts`, `prompt.ts`
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Install MCP SDK and AI dependencies
    - Install `@modelcontextprotocol/sdk` for MCP client connections
    - Install `@aws-sdk/client-bedrock-runtime` for calling Claude via Amazon Bedrock Converse API
    - Install `dotenv` for environment variable management
    - Create `.env.example` with placeholder keys: `AWS_REGION`, `BEDROCK_MODEL_ID`, `PORT`, `MCP_CONFIG_PATH`
    - Note: AWS credentials are resolved via the standard AWS credential chain (AWS CLI profile, env vars, or IAM role) — no explicit API key needed
    - _Requirements: 2.2, 3.2_

  - [x] 1.3 Install test dependencies
    - Install `jest`, `ts-jest`, `@types/jest`, `fast-check`
    - Create `jest.config.ts` with ts-jest preset
    - Create `src/__tests__/` directory
    - _Requirements: 7.1_

- [x] 2. Implement MCP client setup (`src/mcp.ts`)
  - [x] 2.1 Implement MCP config reader and transport factory
    - Read MCP server config from `~/.kiro/settings/mcp.json` (path from env var `MCP_CONFIG_PATH`)
    - Parse the JSON config (strip JSONC comments if needed) to get the `mcpServers` object
    - For each enabled server entry, determine transport type:
      - If entry has `command` field → stdio transport (spawn as child process)
      - If entry has `url` field → HTTP transport (remote connection)
    - Skip entries with `"disabled": true`
    - _Requirements: 2.2, 3.2_

  - [x] 2.2 Implement stdio MCP server connections (Jira + Confluence)
    - Use the MCP SDK's `StdioClientTransport` to spawn stdio-based servers as child processes
    - For `jira`: spawn `npx -y @aashari/mcp-server-atlassian-jira` with env vars (`ATLASSIAN_SITE_NAME`, `ATLASSIAN_USER_EMAIL`, `ATLASSIAN_API_TOKEN`) from the config
    - For `mcp-atlassian` (Confluence): spawn `uvx mcp-atlassian` with env vars (`CONFLUENCE_URL`, `CONFLUENCE_PERSONAL_TOKEN`) from the config
    - Create an MCP `Client` for each, connect via the `StdioClientTransport`, and verify connection
    - _Requirements: 2.2, 3.2_

  - [x] 2.3 Implement HTTP MCP server connection (GitHub)
    - Use the MCP SDK's `SSEClientTransport` or `StreamableHTTPClientTransport` to connect to the HTTP-based GitHub MCP server
    - Connect to `https://api.githubcopilot.com/mcp/` with the `Authorization: Bearer <token>` header from the config's `headers` field
    - Create an MCP `Client`, connect via the HTTP transport, and verify connection
    - _Requirements: 2.2_

  - [x] 2.4 Implement tool collection and routing
    - Call `client.listTools()` on each of the 3 connected MCP servers
    - Combine all tool definitions into a single unified list
    - Build a tool-name-to-server mapping so the agent can route tool calls to the correct MCP server
    - Export `collectAllTools()` that returns the combined tool list with server ownership metadata
    - Export `callTool(toolName, args)` that looks up the owning server and executes the tool on the correct MCP client
    - Convert the combined tool definitions to Bedrock `toolSpec` format (name, description, inputSchema as JSON)
    - _Requirements: 2.2, 3.2_

- [x] 3. Implement prompt templates (`src/prompt.ts`)
  - [x] 3.1 Implement system prompt builder
    - Create `buildSystemPrompt()` that defines the agent's role as an L3 support analyst
    - Include instructions for the agent to use MCP tools for Jira, GitHub, and Confluence
    - Include instructions to write analysis in plain, non-technical language for L2 engineers
    - _Requirements: 4.1, 5.3_

  - [x] 3.2 Implement analysis prompt builder
    - Create `buildAnalysisPrompt(ticketDetails, codeContext, specContext)` that assembles all gathered context into a single analysis prompt
    - The prompt must instruct the LLM to produce: Issue Summary, Potential Root Cause(s), Recommended Solutions, and References
    - The prompt must instruct the LLM to write in plain language understandable by L2 engineers
    - _Requirements: 4.1, 4.2, 5.2, 5.3_

  - [ ]* 3.3 Write property test for analysis prompt builder (Property 5)
    - **Property 5: Analysis prompt includes all provided context**
    - Generate random ticket details (summary, description, labels), code snippets, and spec content using fast-check
    - Verify the resulting prompt string contains all provided ticket details, all code snippet contents, and all spec page contents
    - **Validates: Requirements 4.1**

  - [x] 3.4 Implement comment formatter
    - Create `formatComment(analysisOutput: string)` that wraps the agent's analysis into a structured Jira comment
    - Ensure the formatted comment contains section headers: "Issue Summary", "Potential Root Cause(s)", "Recommended Solutions", "References"
    - Use Jira wiki markup or markdown for formatting
    - _Requirements: 5.2, 5.3_

  - [ ]* 3.5 Write property test for comment formatter (Property 6)
    - **Property 6: Formatted comment contains all required section headers**
    - Generate random analysis output strings using fast-check
    - Verify the formatted comment always contains "Issue Summary", "Potential Root Cause(s)", "Recommended Solutions", and "References"
    - **Validates: Requirements 5.2**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement webhook server (`src/server.ts`)
  - [x] 5.1 Implement Express webhook endpoint
    - Create Express app with `POST /webhook/pi-ticket` route
    - Extract ticket key from the Jira webhook payload (`req.body.issue.key`)
    - Respond with HTTP 202 immediately, then call `agent.run(ticketKey)` asynchronously
    - Start the server on the port from env var (default 3000)
    - _Requirements: 1.1, 1.2_

  - [ ]* 5.2 Write property test for ticket key extraction (Property 1)
    - **Property 1: Webhook payload yields correct ticket key**
    - Generate random valid Jira webhook payloads with `issue.key` fields using fast-check
    - Verify the extracted ticket key matches the original payload value
    - **Validates: Requirements 1.2**

- [x] 6. Implement AI agent (`src/agent.ts`)
  - [x] 6.1 Implement agent orchestration loop
    - Create `agent.run(ticketKey: string)` as the main entry point
    - Initialize the Bedrock client using `@aws-sdk/client-bedrock-runtime` with region from env (`AWS_REGION`)
    - Load MCP clients from `mcp.ts` — connects to all 3 servers (2 stdio + 1 HTTP)
    - Collect combined tool definitions from all 3 MCP servers via `collectAllTools()`
    - Convert combined MCP tool definitions to Bedrock's `toolSpec` format
    - Implement the Bedrock Converse API tool-use loop:
      1. Send messages to Bedrock with combined tool definitions and system prompt (model ID from env `BEDROCK_MODEL_ID`, e.g. `anthropic.claude-sonnet-4-20250514`)
      2. If Bedrock responds with `stopReason="tool_use"`: extract tool name and input, route to the correct MCP server via `callTool()` (which uses the tool-name-to-server mapping), append tool result to conversation, send back to Bedrock
      3. If Bedrock responds with `stopReason="end_turn"`: extract the final analysis text
      4. Loop until `stopReason="end_turn"`
    - Format the final analysis using `formatComment()` from `prompt.ts`
    - Call Jira MCP tool to post the formatted comment on the ticket
    - Call Jira MCP tool to add `smart-l3-analyzed` label to the ticket
    - _Requirements: 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2, 5.1, 5.2, 5.3, 5.5_

- [x] 7. Wire everything together and add entry point
  - [x] 7.1 Create main entry point
    - Ensure `server.ts` imports and initializes all 3 MCP server connections on startup (spawns 2 stdio child processes, connects 1 HTTP remote)
    - Ensure the webhook handler passes the MCP clients (with tool routing) and Bedrock client to `agent.run()`
    - Add a `start` script in `package.json`: `ts-node src/server.ts`
    - Verify the full pipeline compiles with `tsc --noEmit`
    - _Requirements: 1.1, 1.2, 7.2_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The hackathon scope is happy path only — no error handling, retries, or validation guards
- MCP server config is read from `~/.kiro/settings/mcp.json` (already configured)
- Local deployment uses `ngrok http 3000` to expose the webhook to Jira automation
