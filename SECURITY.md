# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/naingoted/meclaw/security/advisories/new)
— do **not** open a public issue for security problems.

You can expect an acknowledgement within a few days. This is a solo-maintained
project, so fixes ship on a best-effort basis; critical issues take priority.

## Scope

Reports are especially welcome for:

- **Auth bypass** in the admin console (`apps/admin`, Auth.js + scrypt password).
- **Prompt-injection escapes** past the chat guardrails (`apps/chat/lib/ai/guardrails.ts`) that exfiltrate private corpus content.
- **SQL injection / write access** through the read-only MCP server (`packages/mcp`, `run-read-query` guard).
- **PII leakage** through MCP redaction (`MCP_ALLOW_PII=false` paths) or telemetry endpoints.
- **Conversation-history hijack** — forging or bypassing the HMAC resume tokens (`apps/chat/lib/embed/resume.ts`) that gate `GET /api/chat/history` and continuation of existing conversations.
- Rate-limit bypasses that enable abuse of the public chat endpoint.

## Out of scope

- Vulnerabilities in upstream dependencies (report those upstream; a heads-up issue here is still appreciated).
- Issues requiring a maliciously configured deployment (e.g. secrets committed by the operator, `MCP_ALLOW_PII=true`).
- Direct API calls using a valid public embed token (`pk_…`) with a forged `parentOrigin` — a documented limitation of the embed widget; mitigated by per-client rate limits and revocation.

## Supported versions

Only the latest `main` is supported. There are no versioned releases yet.
