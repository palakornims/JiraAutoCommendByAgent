// Smart L3 — AI Agent

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { ConnectedMcpClients, McpTool, callTool } from './mcp';
import { buildSystemPrompt, formatComment } from './prompt';
import type { TicketDetails } from './server';

/**
 * Posts a comment to a Jira ticket using the Atlassian REST API.
 */
async function postJiraComment(ticketKey: string, commentBody: string): Promise<void> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    console.warn('[Smart L3] Jira credentials not configured — skipping comment post. Set JIRA_BASE_URL, JIRA_USER_EMAIL, JIRA_API_TOKEN in .env');
    return;
  }

  const url = `${baseUrl}/rest/api/3/issue/${ticketKey}/comment`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

  const body = {
    body: {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: commentBody }],
        },
      ],
    },
  };

  console.log(`[Smart L3] Posting comment to Jira ticket ${ticketKey}...`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    console.log(`[Smart L3] Comment posted successfully to ${ticketKey}`);
  } else {
    const errText = await res.text();
    console.error(`[Smart L3] Failed to post comment to ${ticketKey}: ${res.status} ${errText}`);
  }
}

export async function run(
  ticket: TicketDetails,
  clients: ConnectedMcpClients,
  tools: McpTool[],
  bedrockToolSpecs: any[],
): Promise<void> {
  console.log(`[Smart L3] Processing ticket: ${ticket.key}`);

  // 1. Initialize Bedrock client
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing AWS credentials. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.',
    );
  }

  const bedrock = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
  });
  const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-sonnet-4-20250514';
  console.log(`[Smart L3] Using model: ${modelId}`);
  console.log(`[Smart L3] ${tools.length} tools available from ${Object.keys(clients).length} servers.`);

  // 2. Build initial conversation with ticket details from webhook
  const systemPrompt = buildSystemPrompt();
  console.log(`[Smart L3] [LLM] System prompt:\n${systemPrompt}`);
  const ticketContext = [
    `Ticket: ${ticket.key}`,
    `Summary: ${ticket.summary}`,
    `Description: ${ticket.description || '(no description)'}`,
    `Project: ${ticket.project}`,
    `Type: ${ticket.issueType}`,
    `Status: ${ticket.status}`,
    `Priority: ${ticket.priority}`,
    `Reporter: ${ticket.reporter}`,
    `Labels: ${ticket.labels.length ? ticket.labels.join(', ') : '(none)'}`,
  ].join('\n');

  const messages: any[] = [
    {
      role: 'user',
      content: [{ text: `Analyze this PI ticket:\n\n${ticketContext}` }],
    },
  ];

  // 3. Bedrock Converse API tool-use loop
  console.log('[Smart L3] Starting analysis loop...');
  console.log(`[Smart L3] [LLM] Ticket context:\n${ticketContext}`);
  const MAX_ITERATIONS = 15;
  let iteration = 0;
  while (true) {
    iteration++;
    if (iteration > MAX_ITERATIONS) {
      console.error(`[Smart L3] Reached max iterations (${MAX_ITERATIONS}), stopping.`);
      break;
    }

    console.log(`[Smart L3] [Iteration ${iteration}] Sending request to Bedrock LLM (model: ${modelId})...`);
    let response;
    try {
      response = await bedrock.send(new ConverseCommand({
        modelId,
        system: [{ text: systemPrompt }],
        messages,
        toolConfig: { tools: bedrockToolSpecs },
      }));
    } catch (err: any) {
      console.error(`[Smart L3] [Iteration ${iteration}] Bedrock error: ${err.message}`);
      break;
    }

    const output = response.output!.message!;
    console.log(`[Smart L3] [Iteration ${iteration}] LLM responded — stopReason: ${response.stopReason}, usage: ${JSON.stringify(response.usage)}`);
    messages.push(output);

    if (response.stopReason === 'end_turn') {
      const textBlock = output.content?.find((b: any) => b.text);
      const analysisText = textBlock?.text || '';
      console.log('[Smart L3] Analysis complete');
      console.log('[Smart L3] [LLM] Raw output:\n', analysisText);

      if (analysisText) {
        const comment = formatComment(analysisText);
        console.log('[Smart L3] Formatted comment:\n', comment);

        // Post the formatted comment to Jira
        try {
          await postJiraComment(ticket.key, comment);
        } catch (err: any) {
          console.error(`[Smart L3] Error posting Jira comment: ${err.message}`);
        }
      }
      break;
    }

    if (response.stopReason === 'tool_use') {
      const toolUseBlocks = output.content?.filter((b: any) => b.toolUse) || [];
      const toolResults: any[] = [];

      for (const block of toolUseBlocks) {
        const toolUse = block.toolUse!;
        console.log(`[Smart L3] [MCP] Calling tool: ${toolUse.name} | args: ${JSON.stringify(toolUse.input)}`);

        const result = await callTool(clients, tools, toolUse.name!, toolUse.input);
        let resultStr = JSON.stringify(result);
        console.log(`[Smart L3] [MCP] Tool ${toolUse.name} returned (${resultStr.length} chars)`);

        // Truncate large tool results to avoid overwhelming the model
        const MAX_TOOL_RESULT_CHARS = 10000;
        if (resultStr.length > MAX_TOOL_RESULT_CHARS) {
          console.log(`[Smart L3] [MCP] Truncating ${toolUse.name} result from ${resultStr.length} to ${MAX_TOOL_RESULT_CHARS} chars`);
          resultStr = resultStr.slice(0, MAX_TOOL_RESULT_CHARS) + '\n... (truncated)';
        }

        toolResults.push({
          toolResult: {
            toolUseId: toolUse.toolUseId,
            content: [{ text: resultStr }],
          },
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }

  // 4. Cleanup
  console.log('[Smart L3] Done processing ticket:', ticket.key);
}
