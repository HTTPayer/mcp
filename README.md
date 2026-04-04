# @httpayer/mcp

MCP (Model Context Protocol) server for HTTPayer. Lets AI agents call x402-enabled APIs using credit balance — no wallets, no blockchain, no Web3 knowledge required.

- Dashboard & API keys: [app.httpayer.com](https://app.httpayer.com)
- npm: [@httpayer/mcp](https://www.npmjs.com/package/@httpayer/mcp)
- GitHub: [httpayer/mcp](https://github.com/httpayer/mcp)

---

## Quickstart

### With an AI agent (recommended)

Paste this into any MCP-compatible agent (Claude Code, Cursor, Windsurf, OpenCode...):

```
Set up https://httpayer.com/skill.md
```

The agent detects your environment and handles everything automatically.

### Without an agent (manual)

**1. Run setup:**
```bash
npx @httpayer/mcp setup
```

Get your API key at [app.httpayer.com](https://app.httpayer.com) when prompted.

Flags:

| Flag | Description |
|------|-------------|
| `--key sk-live-...` | Provide key non-interactively |
| `--client <name>` | Target client: `claude-code`, `claude-desktop`, `cursor`, `windsurf`, `opencode`, `zed`, `cline`, `warp`, `codex` |
| `--scope user\|project` | Claude Code scope (default: `user`) |
| `--yes` / `-y` | Skip all prompts |
| `--update-key` | Replace existing key |

**2. Add to your client:**

**Claude Code:**
```bash
claude mcp add httpayer --scope user -- npx -y @httpayer/mcp@latest
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):
```json
{
  "mcpServers": {
    "httpayer": {
      "command": "npx",
      "args": ["-y", "@httpayer/mcp@latest"]
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`), **Windsurf** (`.windsurf/mcp.json`), **Cline** (`.cline/mcp_settings.json`):
```json
{
  "mcpServers": {
    "httpayer": {
      "command": "npx",
      "args": ["-y", "@httpayer/mcp@latest"]
    }
  }
}
```

**OpenCode** (`opencode.json` or `~/.config/opencode/config.json`):
```json
{
  "mcp": {
    "httpayer": {
      "type": "local",
      "command": ["npx", "-y", "@httpayer/mcp@latest"],
      "enabled": true
    }
  }
}
```

**Zed:**
```json
{
  "context_servers": {
    "httpayer": {
      "command": {
        "path": "npx",
        "args": ["-y", "@httpayer/mcp@latest"]
      }
    }
  }
}
```

**3. Restart your client and verify:**

Ask your agent: *"fetch https://api.httpayer.com/demo/v1/base-weather"*

A weather response means HTTPayer is working.

---

## How it works

```
User prompt
    │
    ▼
AI agent (Claude Code, Cursor, Windsurf...)
    │  uses MCP tools + prompts + resources
    ▼
@httpayer/mcp (local MCP server via npx)
    │  REST calls with x-api-key header
    ▼
api.httpayer.com
    │  proxy handles x402 payment to target
    ▼
Target x402-gated API
```

### Runtime flow

1. Your client launches the MCP server via `npx -y @httpayer/mcp@latest` on startup (stdio transport).
2. The server reads the API key from `~/.httpayer/mcp-config.json`.
3. The agent receives the tool list, system instructions, prompts, and resources in its context.
4. When the agent calls `fetch`, the MCP server forwards the request to `POST https://api.httpayer.com/proxy`.
5. HTTPayer's proxy detects a 402, pays using your credits, retries, and returns the final response.
6. The result (status, body, headers) comes back to the agent.

---

## MCP capabilities

This server exposes three MCP primitives so agents get context automatically — without the user having to ask.

### Tools

Six tools (see full reference below).

### Prompts

| Name | Description |
|------|-------------|
| `httpayer-context` | Injects full HTTPayer payment context into the agent. Clients that support prompts will load this automatically at session start. |

Compatible clients (Claude Desktop, Cursor, and others) call `prompts/list` on connection and inject these into the agent's context proactively.

### Resources

| URI | Description |
|-----|-------------|
| `httpayer://skill.md` | Full setup guide, trigger patterns, available endpoints, and workflow. Clients can pull this on demand as grounding context. |

---

## MCP tools reference

### `get_balance`

Check credit balance and daily usage.

**Input:** none

**Example response:**
```json
{
  "account_id": "account_123",
  "mainnet": {
    "credits_balance": 50000,
    "daily_limit": 100000,
    "daily_spend": 15500,
    "daily_remaining": 84500
  }
}
```

---

### `fetch`

Make an HTTP request to any x402-enabled endpoint. Payment is handled automatically.

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | yes | Target URL |
| `method` | string | no | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` — default `GET` |
| `body` | object | no | JSON request body |
| `params` | object | no | Query string parameters |
| `headers` | object | no | Additional request headers |
| `timeout` | number | no | Timeout in seconds, max 120 |

**Example response:**
```json
{
  "status": 200,
  "body": { "data": "..." },
  "headers": { "content-type": "application/json" }
}
```

On 502, the response includes `webhook_id` for async polling.

---

### `simulate`

Dry-run a fetch. Returns cost estimate without spending credits.

**Input:** Same as `fetch` (except `timeout`).

**Example response:**
```json
{
  "requiresPayment": true,
  "proxyFeeBreakdown": {
    "targetAmount": 0.01,
    "proxyFee": 0.0003,
    "totalCreditsCharged": 10.3
  }
}
```

---

### `get_topup_link`

Returns the dashboard URL to add credits. Show to user when balance is low.

**Input:** none

---

### `check_limits`

Check global HTTPayer system daily limits and remaining capacity.

**Input:** none

---

### `get_webhook_status`

Poll the status of an async operation. Use when `fetch` returns a 502 with `webhook_id`.

**Input:** `webhook_id` (string, required)

**Status values:** `pending`, `success`, `success_refunded`, `payment_failed`, `upstream_error`, `internal_error`, `rate_limited`

---

## HTTPayer API reference

Authentication: `x-api-key: sk-live-...` header on all requests.

| Method | Path | Tool |
|--------|------|------|
| `GET` | `/v1/credits/balance` | `get_balance` |
| `POST` | `/proxy` | `fetch` |
| `POST` | `/proxy/sim` | `simulate` |
| `GET` | `/limits` | `check_limits` |
| `GET` | `/webhooks/{id}` | `get_webhook_status` |

### Proxy endpoint

`POST https://api.httpayer.com/proxy`

```json
{
  "api_url": "https://target.example.com/endpoint",
  "method": "GET",
  "json": { "key": "value" },
  "params": { "query": "param" },
  "headers": { "Custom-Header": "value" },
  "timeout": 30
}
```

Only `api_url` and `method` are required.

**Status codes:**

| Code | Meaning |
|------|---------|
| `200` | Success |
| `402` | Insufficient credits |
| `429` | Rate limited |
| `500` | Proxy error |
| `502` | Target refused payment — includes `webhook_id` |

---

## Configuration

API key stored at: `~/.httpayer/mcp-config.json`

```json
{ "apiKey": "sk-live-..." }
```

To update: `npx @httpayer/mcp setup --update-key`

---

## x402 protocol overview

x402 is an HTTP-native micropayment protocol using the `402 Payment Required` status code.

**Without HTTPayer:**
1. Client hits endpoint → gets `402` + payment requirements
2. Client pays on-chain (requires wallet + USDC)
3. Client retries with payment proof

**With HTTPayer:**
1. Client calls `POST /proxy { api_url, method, ... }`
2. HTTPayer detects `402`, pays using your credits
3. HTTPayer retries and returns the final response

All blockchain interaction happens on HTTPayer's side.

---

## Credit system

| Unit | Value |
|------|-------|
| 1 credit | 0.001 USDC |
| 1 USDC | 1,000 credits |
| Proxy fee | 3% of target payment |

Top up at [app.httpayer.com](https://app.httpayer.com). Below 100 credits, the agent will prompt you to top up.

---

## Error handling

### Setup errors

| Situation | Behavior |
|-----------|----------|
| Key format invalid | Print error, exit 1 |
| Key rejected (401) | Print "API key rejected", exit 1 |
| Network unreachable | Print reason, exit 1 |

### MCP tool errors

All errors return `isError: true` — the server stays alive and the agent gets a readable message.

| Situation | Message |
|-----------|---------|
| No config | `"No HTTPayer API key configured. Run: npx @httpayer/mcp setup"` |
| API non-2xx | `"HTTPayer {status}: {body}"` |
| Unknown tool | `"Unknown tool: {name}"` |

---

© 2026 HTTPayer Inc.
