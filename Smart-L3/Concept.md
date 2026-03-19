## Evnet
I've join Hackathon event, we have 2 days duration.

## Idea
Our idea is we want to create the automation application (or whatever to call) to suggest potential root cause and solution the product support level 3. It's called Smart L3

Let me explain to you about product support team, so we have 3 tier: P1, P2, and P3
L1: Operation Support / Incident Management
L2: Technical Product Support Engineer
L3: Developer, Technical Team.

So as normal days, L1 and L2 will handle production issues and support customer. But sometimes if it's too technical. So L3 will come to help that have to dedicated 1 days/sprint to support production issues as an L3.

So we come up with the idea where we want to use AI to read the description in the ticket and let it go through the code, spec to analyze the issue and give potential root cause and solution on the ticket to product support for further investigation. So this will help developer have more time to focused on their own tasks and product support team in term of reducing their investigating time.

## Tools
Jira: for issuing the ticket, put the issue's details
Confluence: Where the spec is placed on.
Github: Where the code stored in.
AI Agentic: Who gather issue details, spec, code to analyze together and give root cause and possible solutions.

You can use MCP Servers defined on 'C:\Users\nachapos.san\.kiro\settings\mcp.json' for Jira, Confluence, and Github.


## Deployment
Please provide CI/CD solution for prototyep to production Deployment