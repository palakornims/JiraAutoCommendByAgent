# Requirements Document

## Introduction

Smart L3 is an AI-powered automation application designed to assist product support teams by automatically analyzing Jira support tickets, retrieving relevant code from GitHub and documentation from Confluence, and providing potential root cause analysis and solution recommendations. The goal is to reduce the time L3 developers spend on production support (currently 1 day/sprint) and accelerate investigation for L1/L2 support engineers.

> **Scope Note:** This project is being built during a 2-day hackathon. Requirements are split into two categories:
> - **🟢 HACKATHON SCOPE** — Lean, demo-focused requirements for the hackathon deliverable.
> - **🔮 FUTURE (Production)** — Production-grade requirements deferred for post-hackathon. Kept here as a roadmap.

## Glossary

- **Smart_L3_Agent**: The AI agentic system that orchestrates the analysis of support tickets by gathering data from multiple sources and producing root cause and solution recommendations.
- **Ticket_Ingestion_Service**: The component responsible for detecting and reading new or updated Jira support tickets that require L3 analysis.
- **Code_Analyzer**: The component that retrieves and analyzes relevant source code from GitHub repositories to identify potential root causes.
- **Spec_Analyzer**: The component that retrieves and analyzes relevant documentation and specifications from Confluence to provide context for the issue.
- **Analysis_Engine**: The AI component that combines ticket details, code context, and specification context to produce root cause analysis and solution recommendations.
- **Result_Publisher**: The component that posts the analysis results (root cause and solutions) back to the originating Jira ticket.
- **PI_Ticket**: A Parallel Investigation (PI) Jira ticket created by an L2_Engineer to request L3 assistance on a technical issue that requires deeper code-level investigation.
- **Support_Ticket**: A Jira issue containing details about a production problem that requires investigation.
- **L1_Engineer**: Operation Support / Incident Management team member.
- **L2_Engineer**: Technical Product Support Engineer.
- **L3_Developer**: Developer or Technical Team member who handles escalated technical issues.
- **CI_CD_Pipeline**: The continuous integration and continuous deployment pipeline that automates building, testing, and deploying the Smart L3 application.

---

## 🟢 HACKATHON SCOPE Requirements

### Requirement 1: PI Ticket Detection and Ingestion 🟢

**User Story:** As an L3 Developer, I want the system to automatically detect PI (Parallel Investigation) tickets created by L2 Engineers, so that I can receive AI-assisted analysis without manually monitoring the ticket queue.

#### Acceptance Criteria

1. WHEN an L2_Engineer creates a PI_Ticket in Jira, THE Jira automation workflow SHALL trigger a webhook to the Ticket_Ingestion_Service with the PI_Ticket details.
2. WHEN the Ticket_Ingestion_Service receives a webhook event for a PI_Ticket, THE Ticket_Ingestion_Service SHALL extract the ticket summary, description, priority, labels, and any attached logs from the webhook payload or via a follow-up Jira API call.
3. IF the Ticket_Ingestion_Service receives a malformed or unauthorized webhook request, THEN THE Ticket_Ingestion_Service SHALL reject the request, return an appropriate HTTP error status, and log the failure.
4. IF the Ticket_Ingestion_Service fails to retrieve additional ticket details from Jira after receiving a webhook event, THEN THE Ticket_Ingestion_Service SHALL retry the retrieval up to 3 times with exponential backoff and log the failure.
5. IF a PI_Ticket contains insufficient description (fewer than 20 characters), THEN THE Ticket_Ingestion_Service SHALL add a comment on the PI_Ticket requesting more details and skip analysis until updated.

### Requirement 2: Code Retrieval and Analysis 🟢

**User Story:** As an L2 Engineer, I want the system to automatically search relevant code for the reported issue, so that potential code-level root causes are identified without developer involvement.

#### Acceptance Criteria

1. WHEN the Ticket_Ingestion_Service provides ticket details, THE Code_Analyzer SHALL identify relevant GitHub repositories based on ticket labels, components, or keywords.
2. WHEN relevant repositories are identified, THE Code_Analyzer SHALL retrieve related source files, recent commits, and pull requests from GitHub using the configured MCP server.
3. THE Code_Analyzer SHALL limit code retrieval to the 20 most relevant files per repository to keep analysis focused.
4. IF the Code_Analyzer fails to access a GitHub repository, THEN THE Code_Analyzer SHALL log the error and continue analysis with available data from other sources.

### Requirement 3: Specification and Documentation Retrieval 🟢

**User Story:** As an L2 Engineer, I want the system to automatically search relevant specs and documentation, so that the analysis includes business context and expected behavior.

#### Acceptance Criteria

1. WHEN the Ticket_Ingestion_Service provides ticket details, THE Spec_Analyzer SHALL search Confluence for relevant specification pages using ticket keywords and component names.
2. WHEN relevant Confluence pages are found, THE Spec_Analyzer SHALL retrieve the page content using the configured MCP server.
3. THE Spec_Analyzer SHALL limit retrieval to the 10 most relevant Confluence pages per ticket to keep analysis focused.
4. IF the Spec_Analyzer fails to access Confluence, THEN THE Spec_Analyzer SHALL log the error and continue analysis with available data from other sources.

### Requirement 4: AI-Powered Root Cause Analysis 🟢

**User Story:** As an L2 Engineer, I want the system to analyze all gathered information and suggest a root cause and solution, so that I can resolve issues faster without waiting for L3 developers.

#### Acceptance Criteria

1. WHEN the Code_Analyzer and Spec_Analyzer complete data retrieval, THE Analysis_Engine SHALL combine ticket details, code context, and specification context into a unified analysis prompt.
2. THE Analysis_Engine SHALL produce a structured analysis containing: a summary of the issue, potential root cause(s) ranked by confidence, recommended solution steps, and references to relevant code files and documentation pages.
3. IF the Analysis_Engine cannot determine a root cause with reasonable confidence, THEN THE Analysis_Engine SHALL state that manual L3 investigation is recommended and provide the gathered context as a starting point.

### Requirement 5: Result Publishing to Jira 🟢

**User Story:** As an L2 Engineer, I want the analysis results posted directly on the Jira ticket, so that I can immediately see the suggested root cause and solution without switching tools.

#### Acceptance Criteria

1. WHEN the Analysis_Engine completes its analysis, THE Result_Publisher SHALL post the analysis as a formatted comment on the originating Jira ticket.
2. THE Result_Publisher SHALL format the comment with clear sections: Issue Summary, Potential Root Cause(s), Recommended Solutions, and References.
3. THE Result_Publisher SHALL write the comment in plain, non-technical language understandable by L2_Engineers who do not have deep code-level knowledge, avoiding developer-specific jargon and instead explaining concepts in accessible terms.
4. IF the Result_Publisher fails to post the comment to Jira, THEN THE Result_Publisher SHALL retry up to 3 times and log the failure if all retries are exhausted.
5. WHEN the analysis comment is posted, THE Result_Publisher SHALL update the ticket with a label indicating that Smart L3 analysis is complete.

### Requirement 7: Hackathon Validation (UAT / Live Demo) 🟢

**User Story:** As an L3 Developer, I want to validate the Smart L3 application through a live UAT demo, so that the hackathon deliverable is verified end-to-end with real tickets.

#### Acceptance Criteria

1. THE Smart_L3_Agent SHALL be validated through a User Acceptance Test (UAT) performed as a live demo using real or representative PI_Tickets.
2. WHEN the UAT demo is performed, THE Smart_L3_Agent SHALL demonstrate the full pipeline: ticket detection, code retrieval, spec retrieval, analysis, and result publishing to Jira.
3. IF the UAT demo reveals a defect, THEN THE L3_Developer SHALL fix the defect and re-run the demo scenario to confirm resolution.

---

## 🔮 FUTURE (Production) Requirements

> The following requirements are deferred for post-hackathon production readiness. They are kept here as a roadmap.

### Requirement 6: Observability and Logging 🔮 FUTURE

**User Story:** As an L3 Developer, I want to see logs and metrics of the Smart L3 system, so that I can monitor its effectiveness and troubleshoot issues with the tool itself.

> **Hackathon Note:** Not needed for the hackathon. When analysis finishes, the comment is posted directly on the Jira ticket. If an L2 Engineer does not understand the comment, they escalate to L3 who can check the ticket and see the AI comment directly. Separate observability will be addressed for production.

#### Acceptance Criteria

1. THE Smart_L3_Agent SHALL log each step of the analysis pipeline (ticket detection, code retrieval, spec retrieval, analysis, publishing) with timestamps and status.
2. THE Smart_L3_Agent SHALL expose metrics for: total tickets processed, average analysis duration, success rate, and failure rate.
3. IF any pipeline step fails, THEN THE Smart_L3_Agent SHALL log the error with sufficient detail to enable troubleshooting.

### Requirement 7 (Production): CI/CD Pipeline for Deployment 🔮 FUTURE

**User Story:** As an L3 Developer, I want an automated CI/CD pipeline, so that the Smart L3 application can be reliably deployed from prototype to production.

> **Hackathon Note:** For the hackathon, validation is done via UAT/live demo (see Requirement 7 Hackathon above). The full CI/CD pipeline below is the production roadmap.

#### Acceptance Criteria

1. WHEN code is pushed to the main branch, THE CI_CD_Pipeline SHALL run automated tests and build the application.
2. WHEN the build and tests succeed, THE CI_CD_Pipeline SHALL deploy the application to a staging environment for validation.
3. WHEN staging validation is approved, THE CI_CD_Pipeline SHALL deploy the application to the production environment.
4. IF the build or tests fail, THEN THE CI_CD_Pipeline SHALL notify the development team and halt the deployment.
5. THE CI_CD_Pipeline SHALL support rollback to the previous stable version within 5 minutes of a failed production deployment.

### Requirement 8: Security and Access Control 🔮 FUTURE

**User Story:** As an L3 Developer, I want the system to securely handle credentials and access tokens, so that integrations with Jira, Confluence, and GitHub are protected.

> **Hackathon Note:** For the hackathon, credentials are stored in the MCP server configuration file (`C:\Users\nachapos.san\.kiro\settings\mcp.json`). Full secrets management and security hardening will be addressed when moving to production.

#### Acceptance Criteria

1. THE Smart_L3_Agent SHALL store all API tokens and credentials in a secure secrets manager and not in source code or configuration files.
2. THE Smart_L3_Agent SHALL use the minimum required permissions (read-only where applicable) for Jira, Confluence, and GitHub integrations.
3. THE Smart_L3_Agent SHALL authenticate all API calls using the configured MCP server credentials.
4. IF an API token expires or is revoked, THEN THE Smart_L3_Agent SHALL log the authentication failure and halt processing until credentials are refreshed.
