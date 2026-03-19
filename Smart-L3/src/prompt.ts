// Smart L3 — Prompt Templates

/**
 * Builds the system prompt for the Smart L3 AI agent.
 * Defines the agent's role, available MCP tools, and behavior rules.
 */
export function buildSystemPrompt(): string {
  return `You are Smart L3, an AI assistant that helps analyze PI (Parallel Investigation) tickets for product support teams.

The ticket details (summary, description, priority, labels, etc.) are provided directly in the user message. You do NOT need to fetch them from Jira.

You have access to the following MCP tools:

- Jira: Post comments or update labels on tickets.
- GitHub: Search source code and repositories to find code relevant to the reported issue. IMPORTANT: Always include "user:palakornims" in your search queries to restrict results to the correct GitHub account.
  Follow this workflow to find code:
  Step A: Use search_repositories with query "KEYWORD user:palakornims" to find matching repositories.
  Step B: For each matching repo, use get_file_contents with owner="palakornims" and repo=REPO_NAME (no path, or path="/") to list all files in the root directory.
  Step C: Use get_file_contents with owner="palakornims", repo=REPO_NAME, and path="FILENAME" to read the actual file content.
  You may also use search_code with "KEYWORD user:palakornims" to search within file contents, but note that small repos may not be indexed by GitHub code search. Always prefer the get_file_contents approach above for reliability.
- Confluence: Search specification and documentation pages to gather business context and expected behavior. IMPORTANT: Always pass spaces_filter="~palakorn.ims@2c2p.com" when calling confluence_search to restrict results to the correct space.

IMPORTANT: You MUST follow ALL steps below in order. Do NOT skip any step. Do NOT write your analysis until you have completed steps 1-4.

Step 1: Read the ticket details provided in the user message. Extract key terms (product names, component names, API names, feature names) to use as search keywords.

Step 2 (MANDATORY — GitHub code analysis): You MUST search GitHub and read source code. Do NOT skip this step.
  2a. Call search_repositories with query "<keyword> user:palakornims" for each key term from the ticket. Try multiple keywords if the first search returns no results.
  2b. For EVERY matching repo, call get_file_contents with owner="palakornims" and repo=<REPO_NAME> (no path) to list all files.
  2c. Call get_file_contents with owner="palakornims", repo=<REPO_NAME>, and path=<FILENAME> to read the FULL source code of every relevant file (especially .cs, .js, .ts, .py, .java files).
  2d. Carefully study the code: look at the logic, calculations, conditions, error handling, and data flow. Identify any bugs, off-by-one errors, wrong operators, or incorrect logic that could cause the reported issue.

Step 3 (Confluence docs): Search Confluence for relevant documentation using confluence_search with spaces_filter="~palakorn.ims@2c2p.com".

Step 4 (Cross-reference): Compare the actual code behavior (from Step 2) with the expected behavior described in the ticket and Confluence docs. Pinpoint the exact code logic that causes the issue.

Step 5: Write your analysis. You MUST reference specific code findings from Step 2 in your root cause analysis. Write in plain language for L2 Product Support Engineers. Structure your response with these sections:
   - Issue Summary
   - Potential Root Cause(s) — MUST include references to actual code you read
   - Recommended Solutions — MUST include specific code fixes when applicable
   - References — include repo names and file paths you examined`;
// 7. Post your analysis as a comment on the Jira ticket.
// 8. Add the label "smart-l3-analyzed" to the ticket when done.
}

/**
 * Assembles all gathered context into a single analysis prompt for the LLM.
 * The prompt includes ticket details, code context, and spec context,
 * and instructs the LLM to produce a structured analysis in plain language.
 */
export function buildAnalysisPrompt(
  ticketDetails: string,
  codeContext: string,
  specContext: string
): string {
  return `Analyze the following PI ticket and provide your findings.

## Ticket Details
${ticketDetails}

## Relevant Code
${codeContext}

## Relevant Specifications
${specContext}

Based on the above context, provide your analysis with the following sections:
- Issue Summary: A brief overview of the reported problem.
- Potential Root Cause(s): The most likely reasons for the issue, ranked by confidence.
- Recommended Solutions: Actionable steps to resolve the issue.
- References: Links or references to relevant code files, commits, and documentation pages.

Write in plain, non-technical language that L2 Product Support Engineers can understand. Avoid developer jargon and code-level details. Explain concepts in simple, accessible terms.`;
}

const REQUIRED_SECTIONS = [
  "Issue Summary",
  "Potential Root Cause(s)",
  "Recommended Solutions",
  "References",
] as const;

const SMART_L3_HEADER = "🤖 Smart L3 Analysis";
const SMART_L3_FOOTER =
  "---\nThis analysis was generated by Smart L3. For questions, please consult your L3 team.";

/**
 * Wraps the agent's raw analysis output into a structured Jira comment
 * with Smart L3 branding and guaranteed section headers.
 */
export function formatComment(analysisOutput: string): string {
  const hasAllSections = REQUIRED_SECTIONS.every((section) =>
    analysisOutput.includes(section)
  );

  if (hasAllSections) {
    return `${SMART_L3_HEADER}\n\n${analysisOutput.trim()}\n\n${SMART_L3_FOOTER}`;
  }

  // Even if headers are missing, use the raw analysis if it has content
  if (analysisOutput.trim().length > 50) {
    return `${SMART_L3_HEADER}\n\n${analysisOutput.trim()}\n\n${SMART_L3_FOOTER}`;
  }

  // Analysis is too short or empty — build a template with placeholders
  const sections = REQUIRED_SECTIONS.map(
    (section) => `## ${section}\n{${section} not provided}`
  ).join("\n\n");

  return `${SMART_L3_HEADER}\n\n${sections}\n\n${SMART_L3_FOOTER}`;
}
