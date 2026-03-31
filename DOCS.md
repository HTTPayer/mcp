# @httpayer/mcp — Complete Documentation

MCP (Model Context Protocol) server for HTTPayer. Lets AI agents call x402-enabled APIs using API key credits — no wallets, no blockchain, no Web3 knowledge required.

---

## Table of Contents

1. [What this is](#what-this-is)
2. [How it works](#how-it-works)
3. [Project structure](#project-structure)
4. [Installation and setup](#installation-and-setup)
5. [MCP tools reference](#mcp-tools-reference)
6. [HTTPayer API reference](#httpayer-api-reference)
7. [Source files](#source-files)
8. [Configuration files](#configuration-files)
9. [Publishing to npm](#publishing-to-npm)
10. [Architecture decisions](#architecture-decisions)
11. [x402 protocol overview](#x402-protocol-overview)
12. [Credit system](#credit-system)
13. [Error handling](#error-handling)
14. [Future work](#future-work)

---

## What this is

`@httpayer/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that wraps the HTTPayer payment infrastructure API. When installed in Claude Code (or any MCP-compatible AI client), it exposes a set of tools that let the AI agent:

- Check account credit balance
- Make HTTP requests to x402-gated APIs with automatic payment handling
- Simulate requests to preview cost before spending
- Monitor async payment operations via webhooks
- Get top-up links when balance is low

The key value proposition over dealing with x402 directly: **no wallet management, no blockchain interaction, no private keys**. The user tops up credits on the HTTPayer dashboard and the MCP server handles all payment logic using those credits.

This is analogous to what `agentcash` does for the x402/SIWX space, but HTTPayer targets web2 users and data professionals who want to consume paid APIs without any crypto complexity.

---

## How it works

### Big picture

```
User prompt
    │
    ▼
Claude Code (AI agent)
    │  uses MCP tools
    ▼
@httpayer/mcp (this package, running as local MCP server via npx)
    │  REST calls with x-api-key header
    ▼
api.httpayer.com/v1
    │  proxy handles x402 payment to target
    ▼
Target x402-gated API
```

### Runtime flow

1. Claude Code launches the MCP server via `npx -y @httpayer/mcp` on startup (stdio transport).
2. The server reads the API key from `~/.httpayer/config.json`.
3. Claude receives the server's tool list and system instructions embedded in its context.
4. When the agent needs to call a paid API, it invokes the `fetch` tool.
5. The MCP server forwards the request to `POST https://api.httpayer.com/v1/proxy`.
6. HTTPayer's proxy detects if the target returns 402, pays using the account's credits, retries, and returns the final response.
7. The result (status, body, headers) comes back to Claude.

### Setup flow

```
npx @httpayer/mcp setup
    │
    ├─ prompts for API key (sk-live-...)
    ├─ validates key against GET /v1/credits/balance
    ├─ saves to ~/.httpayer/config.json
    └─ asks to patch ~/.claude.json with MCP server entry
           └─ if yes: adds "httpayer" under mcpServers
              if no: prints the JSON block to copy manually
```

---

## Project structure

```
httpayer-mcp/
├── package.json          npm package manifest
├── tsconfig.json         TypeScript compiler config
├── .gitignore
├── SKILL.md              Local Claude Code skill file (optional install)
├── DOCS.md               This file
└── src/
    ├── index.ts          Entry point — routes to setup or server mode
    ├── config.ts         Config I/O (~/.httpayer/config.json)
    ├── api.ts            HTTPayer REST API client
    ├── setup.ts          Interactive setup wizard
    └── server.ts         MCP server definition with all tools
```

After build:

```
dist/
├── index.js              Compiled entry (used as bin)
├── config.js
├── api.js
├── setup.js
└── server.js
```

---

## Installation and setup

### Prerequisites

- Node.js 18 or later
- Claude Code (or any MCP-compatible client)
- An HTTPayer account with an API key — get one at https://httpayer.com/dashboard

### One-time setup

```bash
npx @httpayer/mcp setup
```

This runs interactively:

```
HTTPayer MCP Setup
==================
Get your API key at: https://httpayer.com/dashboard

Paste your API key (sk-live-...): sk-live-c1f7b741...
Validating key... ok
Config saved to ~/.httpayer/config.json

Add HTTPayer to Claude Code? This patches ~/.claude.json (y/n): y
Added "httpayer" to ~/.claude.json

Restart Claude Code to activate HTTPayer.
```

The setup wizard:
- Validates the key format (must start with `sk-live-`)
- Makes a live call to `GET /v1/credits/balance` to confirm the key works
- Writes `~/.httpayer/config.json` with the key
- Optionally patches `~/.claude.json` to register the MCP server

### Manual Claude Code registration

If you skip the auto-patch or need to add it manually, add this to `~/.claude.json`:

```json
{
  "mcpServers": {
    "httpayer": {
      "command": "npx",
      "args": ["-y", "@httpayer/mcp"]
    }
  }
}
```

Then restart Claude Code.

### Config file location

The API key is stored at:

```
~/.httpayer/config.json
```

Contents:

```json
{
  "apiKey": "sk-live-c1f7b741..."
}
```

This file is created by the setup wizard and read on every MCP server startup.

### Updating the API key

Edit `~/.httpayer/config.json` directly, or re-run `npx @httpayer/mcp setup` (it overwrites the existing config).

---

## MCP tools reference

When connected, the server exposes six tools. Claude Code loads these automatically and uses them based on the injected system instructions.

---

### `get_balance`

Check credit balance and daily usage.

**Input:** none

**HTTPayer endpoint:** `GET https://api.httpayer.com/v1/credits/balance`

**Example response:**
```json
{
  "account_id": "account_123",
  "mainnet": {
    "credits_balance": 50000,
    "daily_limit": 100000,
    "daily_spend": 15500,
    "daily_remaining": 84500
  },
  "testnet": {
    "daily_limit_usd": 500,
    "today_spent_usd": 12.5,
    "remaining_usd": 487.5
  }
}
```

**When Claude uses it:** Before making expensive calls if balance is uncertain, or when the user explicitly asks about their balance.

---

### `fetch`

Make an HTTP request to any x402-enabled endpoint. Payment is handled automatically using the account's credits.

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | yes | Target URL |
| `method` | string | no | `GET`, `POST`, `PUT`, `DELETE`, `PATCH` — default `GET` |
| `body` | object | no | JSON request body |
| `params` | object | no | Query string parameters (string values) |
| `headers` | object | no | Additional request headers |
| `timeout` | number | no | Timeout in seconds, max 120 |

**HTTPayer endpoint:** `POST https://api.httpayer.com/v1/proxy`

**Proxy request body built internally:**
```json
{
  "api_url": "<url>",
  "method": "GET",
  "json": { },
  "params": { },
  "headers": { },
  "timeout": 30
}
```

**Example response (success):**
```json
{
  "status": 200,
  "body": { "data": "..." },
  "headers": { "content-type": "application/json" }
}
```

**Example response (payment refused after retries):**
```json
{
  "status": 502,
  "body": {
    "error": "Bad Gateway",
    "message": "Upstream API refused payment after N attempts",
    "webhook_id": "550e8400-e29b-41d4-a716-446655440000"
  },
  "headers": { },
  "webhook_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

Note: when a 502 body contains a `webhook_id`, it is also bubbled up to the top level of the result for easy access.

**When Claude uses it:** Any time a task requires calling a paid or x402-gated HTTP endpoint.

---

### `simulate`

Dry-run a fetch request. Returns whether payment would be required and the estimated credit cost, without spending any credits.

**Input:** Same as `fetch`, except `timeout` is not supported (not needed for simulation).

**HTTPayer endpoint:** `POST https://api.httpayer.com/v1/proxy/sim`

**Example response (payment required):**
```json
{
  "status": 200,
  "body": {
    "requiresPayment": true,
    "targetPaymentRequirements": {
      "scheme": "exact",
      "network": "base",
      "maxAmountRequired": "10000"
    },
    "proxyFeeBreakdown": {
      "targetAmount": 0.01,
      "proxyFee": 0.0003,
      "totalCreditsCharged": 10.3,
      "proxyFeePercentage": 3,
      "feeModel": "3% with $0 minimum",
      "creditsPerUsdc": 1000
    }
  },
  "headers": { }
}
```

**Example response (no payment required):**
```json
{
  "status": 200,
  "body": {
    "requiresPayment": false,
    "status": 200,
    "response": { }
  },
  "headers": { }
}
```

**When Claude uses it:** Before making an expensive call when the user wants to preview the cost, or when Claude is uncertain about credit availability.

---

### `get_topup_link`

Returns the HTTPayer dashboard URL where the user can add more credits.

**Input:** none

**Output:** Plain text — `Top up your HTTPayer credits at: https://httpayer.com/dashboard`

**No API call made** — this is a static response.

**When Claude uses it:** When `get_balance` shows low credits (below 100), or when a `fetch` fails with insufficient credits (402 from HTTPayer itself).

---

### `check_limits`

Check global HTTPayer system-wide daily limits and current usage for both proxy and relay modes.

**Input:** none

**HTTPayer endpoint:** `GET https://api.httpayer.com/v1/limits`

**Example response:**
```json
{
  "relay": {
    "mainnet": {
      "daily_limit": 1000,
      "today_spent": 450.75,
      "remaining": 549.25
    },
    "testnet": {
      "daily_limit": 1000,
      "today_spent": 50,
      "remaining": 950
    },
    "per_wallet_daily_limit": 100
  },
  "proxy": {
    "mainnet": { "..." : "..." },
    "testnet": { "..." : "..." },
    "per_account_daily_limit": 500
  },
  "unit": "USDC",
  "reset_time": "2026-03-20T00:00:00Z"
}
```

**When Claude uses it:** When a request fails due to rate limiting or when diagnosing why a payment isn't going through.

---

### `get_webhook_status`

Poll the status of an async HTTPayer operation by webhook ID.

**Input:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `webhook_id` | string | yes | The webhook ID from a previous `fetch` response |

**HTTPayer endpoint:** `GET https://api.httpayer.com/v1/webhooks/{webhook_id}`

**Example response (success):**
```json
{
  "status": "success",
  "txHash": "0xabc...",
  "network": "base",
  "message": "Payment confirmed"
}
```

**Example response (pending):**
```json
{
  "status": "pending"
}
```

**Example response (failed):**
```json
{
  "status": "failed",
  "error": "...",
  "errorType": "upstream_error"
}
```

**Possible status values:**

| Status | Meaning |
|--------|---------|
| `pending` | Still processing |
| `success` | Request completed, upstream responded 2xx |
| `success_refunded` | Succeeded, refund issued (target did not charge) |
| `refund_confirmed` | Refund transaction confirmed on-chain |
| `no_refund_needed` | Target charged HTTPayer within auth window |
| `payment_failed` | Payment never settled on-chain |
| `upstream_error` | Target API returned 5xx |
| `internal_error` | HTTPayer-side error |
| `rate_limited` | Daily limit exceeded |
| `validation_failed` | Invalid request parameters |
| `refund_failed` | Refund attempt failed |

**When Claude uses it:** When `fetch` returns a 502 with a `webhook_id` in the body — poll this until status is no longer `pending`.

---

## HTTPayer API reference

All calls go to `https://api.httpayer.com/v1`. Authentication uses the `x-api-key` header.

### Authentication header

```
x-api-key: sk-live-c1f7b741...
```

### Endpoints used by this MCP server

| Method | Path | Tool | Description |
|--------|------|------|-------------|
| `GET` | `/credits/balance` | `get_balance` | Account credit balance and usage |
| `POST` | `/proxy` | `fetch` | Execute x402-gated request via proxy |
| `POST` | `/proxy/sim` | `simulate` | Simulate proxy request (dry-run) |
| `GET` | `/limits` | `check_limits` | Global system daily limits |
| `GET` | `/webhooks/{id}` | `get_webhook_status` | Async operation status |

### Proxy endpoint detail

`POST /proxy` is the core endpoint. It:
1. Receives the target URL and request options
2. Attempts the request directly
3. If the target returns 402, HTTPayer pays using the account's credits
4. Retries the request with payment proof
5. Returns the target's final response

**Request body:**
```json
{
  "api_url": "https://target.example.com/endpoint",
  "method": "GET",
  "json": { "key": "value" },
  "data": "form-encoded-or-raw-string",
  "params": { "query": "param" },
  "headers": { "Custom-Header": "value" },
  "auth": { "username": "user", "password": "pass" },
  "cookies": { "session": "abc" },
  "timeout": 30
}
```

Only `api_url` and `method` are required. This MCP server sends `json`, `params`, `headers`, and `timeout` when provided by the tool caller.

**HTTP status codes from proxy:**

| Code | Meaning |
|------|---------|
| `200` | Success — target API responded |
| `402` | Insufficient credits in account |
| `429` | Rate limited or daily limit hit |
| `500` | Proxy configuration error |
| `502` | Target API refused payment after retries — includes `webhook_id` |

---

## Source files

### `src/index.ts`

Entry point. Reads `process.argv` and routes to setup mode or server mode.

```typescript
#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes("setup") || args.includes("--setup")) {
  const { runSetup } = await import("./setup.js");
  await runSetup();
} else {
  const { startServer } = await import("./server.js");
  await startServer();
}
```

- Setup mode: `npx @httpayer/mcp setup` or `npx @httpayer/mcp --setup`
- Server mode: `npx @httpayer/mcp` (no args) — used by Claude Code

When Claude Code launches the server, it passes no arguments, so the MCP server starts immediately without any interactive prompts. The two modes are completely separate code paths to avoid any chance of interactive prompts appearing during MCP server operation.

---

### `src/config.ts`

Handles reading and writing `~/.httpayer/config.json`.

**Constants:**
- `CONFIG_DIR` — `~/.httpayer`
- `CONFIG_FILE` — `~/.httpayer/config.json`

**Exports:**

```typescript
interface Config {
  apiKey: string;
}

function loadConfig(): Config | null
// Returns parsed config or null if file doesn't exist or is malformed

function saveConfig(config: Config): void
// Creates ~/.httpayer/ if needed, writes config as pretty-printed JSON

function getApiKey(): string
// Calls loadConfig(), throws if no key found
// Used by all API functions in server.ts
```

**Error behavior:** `getApiKey()` throws `"No HTTPayer API key configured. Run: npx @httpayer/mcp setup"`. This propagates through the MCP tool handler and is returned to Claude as an `isError: true` response.

---

### `src/api.ts`

All HTTP calls to `https://api.httpayer.com/v1`. No external dependencies — uses native Node.js `fetch` (available since Node 18).

**Base URL:** `https://api.httpayer.com/v1`

**Internal function:**

```typescript
async function apiRequest(
  apiKey: string,
  path: string,
  method = "GET",
  body?: unknown
): Promise<unknown>
```

Makes a request with `x-api-key` header, throws on non-2xx, parses JSON if possible (falls back to raw text).

**Exported functions:**

```typescript
function getBalance(apiKey: string): Promise<unknown>
// GET /credits/balance

function getLimits(apiKey: string): Promise<unknown>
// GET /limits

function getWebhookStatus(apiKey: string, webhookId: string): Promise<unknown>
// GET /webhooks/{webhookId}

interface ProxyOptions {
  method?: string;
  json?: unknown;       // JSON body
  data?: string;        // form or raw body
  params?: Record<string, string>;
  headers?: Record<string, string>;
  timeout?: number;     // seconds
}

interface ProxyResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  webhook_id?: string;  // bubbled up from 502 body when present
}

async function proxyFetch(
  apiKey: string,
  url: string,
  options: ProxyOptions,
  simulate: boolean      // true → POST /proxy/sim, false → POST /proxy
): Promise<ProxyResult>
```

**`webhook_id` bubbling:** When the proxy returns 502 and the response body contains `webhook_id`, `proxyFetch` copies it to the top level of `ProxyResult` so tool callers don't have to dig into `body` to find it.

---

### `src/setup.ts`

Interactive setup wizard. Only runs when `setup` is in `process.argv`. Never imported during normal MCP server operation.

**Key functions:**

```typescript
function prompt(question: string): Promise<string>
// readline wrapper — asks one question, closes interface, resolves with trimmed input

async function validateApiKey(apiKey: string): Promise<{ ok: boolean; reason?: string }>
// Calls GET /v1/credits/balance with the key
// ok: true  → 200 (valid and authenticated)
// ok: false → 401 (key rejected), network error
// Any other server error → ok: true (key format accepted, server-side issue)

function patchClaudeJson(): void
// Reads ~/.claude.json (or starts with {})
// Merges in mcpServers.httpayer = { command: "npx", args: ["-y", "@httpayer/mcp"] }
// Writes back as pretty-printed JSON
// Does NOT overwrite any other existing mcpServers entries
```

**Validation logic:**
- Key must start with `sk-live-` (exits with code 1 if not)
- Live API call must return 200 (exits with code 1 on 401 or network error)

**`patchClaudeJson` safety:**
- Reads and parses existing `~/.claude.json` before writing
- Only touches `mcpServers.httpayer` — all other keys preserved
- Creates the file from scratch if it doesn't exist

---

### `src/server.ts`

The MCP server itself. Implements the [Model Context Protocol](https://modelcontextprotocol.io) over stdio transport.

**MCP SDK used:** `@modelcontextprotocol/sdk` v1.x

**Server initialization:**

```typescript
const server = new Server(
  { name: "httpayer", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
);
```

The `instructions` field is returned in the MCP `initialize` response and injected into Claude's system prompt context. This is what tells Claude when and how to use HTTPayer tools without requiring a separate skill file.

**System instructions injected into Claude:**

```
HTTPayer lets AI agents call x402-enabled APIs using credit balance — no wallets,
no blockchain knowledge required.

Use HTTPayer when:
- A task involves calling a paid API that returns 402 Payment Required
- The user asks you to fetch data from an x402-gated service
- Any HTTP call might require a micropayment

Workflow:
1. Call get_balance if unsure about remaining credits
2. Use simulate to preview cost before spending (optional but recommended)
3. Use fetch to call any x402 endpoint — payment is handled automatically
4. If balance is low (< 100 credits), call get_topup_link and share the link with the user
5. If fetch returns a webhook_id on a 502, poll with get_webhook_status

Credit system: 1 credit = 0.001 USDC. Fee: 3% per request.
Top up at https://httpayer.com/dashboard.
```

**Request handlers registered:**

- `ListToolsRequestSchema` — returns the full tool manifest with input schemas
- `CallToolRequestSchema` — dispatches to per-tool logic via `switch(name)`

**Response helpers:**

```typescript
function text(content: string)   // wraps in { content: [{ type: "text", text }] }
function json(data: unknown)     // JSON.stringify(data, null, 2) → text()
function err(message: string)    // text() + isError: true
```

All tool errors are caught and returned as `isError: true` MCP responses rather than thrown — this keeps the MCP connection alive and gives Claude a readable error to work with.

**Transport:** `StdioServerTransport` — Claude Code communicates with the server via stdin/stdout pipes.

---

## Configuration files

### `package.json`

```json
{
  "name": "@httpayer/mcp",
  "version": "0.1.0",
  "description": "MCP server for HTTPayer — x402 payments for AI agents, no wallet required",
  "type": "module",
  "bin": {
    "httpayer-mcp": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "node --loader ts-node/esm src/index.ts",
    "prepublishOnly": "npm run build"
  },
  "files": ["dist"],
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.0.0"
  },
  "engines": { "node": ">=18" },
  "publishConfig": { "access": "public" }
}
```

Key decisions:
- `"type": "module"` — ESM throughout, needed for `NodeNext` module resolution and top-level `await` in `index.ts`
- `"files": ["dist"]` — only the compiled output is published; `src/` stays local
- `"prepublishOnly": "npm run build"` — TypeScript is always compiled before publish
- No runtime dependencies beyond the MCP SDK — uses Node 18 native `fetch` instead of `node-fetch`

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

Key decisions:
- `"module": "NodeNext"` + `"moduleResolution": "NodeNext"` — required for ESM in Node.js; local imports must use `.js` extensions (e.g., `"./config.js"`)
- `"target": "ES2022"` — enables top-level `await` in the compiled output
- `"strict": true` — full strictness; catches `undefined` / `null` issues at compile time
- `"skipLibCheck": true` — avoids type errors in `node_modules`

---

## Publishing to npm

The package is scoped to `@httpayer`. You need to be logged in to npm with access to that org.

```bash
cd httpayer-mcp

# Build
npm run build

# Dry run — see exactly what would be published
npm pack --dry-run

# Publish
npm publish --access public
```

What gets published (only `dist/`):
```
dist/index.js
dist/config.js
dist/api.js
dist/setup.js
dist/server.js
```

After publishing, users install/run with:
```bash
npx @httpayer/mcp setup
```

or use it directly in Claude Code via `~/.claude.json`:
```json
{
  "mcpServers": {
    "httpayer": {
      "command": "npx",
      "args": ["-y", "@httpayer/mcp"]
    }
  }
}
```

---

## Architecture decisions

### Why MCP stdio transport

Claude Code communicates with MCP servers over stdio pipes — each server is a child process launched by Claude Code. This is the standard MCP transport for local tools. No HTTP server needed, no port management, no auth handshake beyond the MCP protocol itself.

### Why no `httpayer` npm package dependency

The `httpayer` Python package (and future npm package) handles x402 at a higher level. This MCP server calls the HTTPayer REST API directly (`/v1/proxy`) rather than depending on the SDK, for two reasons:
1. The npm package doesn't exist yet at time of writing
2. Fewer dependencies = simpler install, faster `npx` cold start

When the `httpayer` npm package ships, `api.ts` can be replaced with SDK calls without changing any of the tool interface.

### Why `~/.httpayer/config.json` not env vars

Env vars are ephemeral and don't persist across terminal sessions. A config file in the home directory survives restarts, is easy to inspect and edit, and is the pattern used by other CLI tools (AWS, GCP, etc.). The setup wizard creates the directory and file automatically.

### Why auto-patch `~/.claude.json`

The biggest friction point in MCP server adoption is the manual JSON editing step. By offering to patch the file automatically (with explicit user consent), setup goes from a multi-step copy-paste operation to a single `y` keypress. The patch is safe: it reads the existing file, merges only `mcpServers.httpayer`, and writes it back.

### Why keep setup and server as separate code paths

When Claude Code starts the MCP server (`npx -y @httpayer/mcp` with no args), stdin is connected to the MCP protocol pipe. If setup ran interactively, it would corrupt the MCP handshake. The `if (args.includes("setup"))` guard ensures interactive code never runs during server mode.

### Why `isError: true` instead of throwing

MCP tool errors returned with `isError: true` keep the server connection open and give Claude a readable message. Unhandled throws crash the server process and break the Claude Code session. All `catch` blocks in `server.ts` convert errors to `isError` responses.

---

## x402 protocol overview

x402 is an HTTP-native micropayment protocol using the `402 Payment Required` status code, originally reserved in HTTP/1.1.

**Flow without HTTPayer (raw x402):**
1. Client → target: `GET /resource`
2. Target → client: `402` + payment requirements in headers/body
3. Client creates payment on-chain (requires wallet + USDC)
4. Client → target: `GET /resource` + `X-Payment: <proof>`
5. Target → client: `200 OK`

**Flow with HTTPayer proxy:**
1. Client → HTTPayer proxy: `POST /v1/proxy { api_url, method, ... }`
2. Proxy → target: `GET /resource`
3. Target → proxy: `402` + payment requirements
4. Proxy pays the target using HTTPayer's wallet (charged to account credits)
5. Proxy → target: `GET /resource` + `X-Payment: <proof>`
6. Target → proxy: `200 OK`
7. Proxy → client: `200` + target response

The client (this MCP server) only talks to HTTPayer. All blockchain interaction is on HTTPayer's side.

**x402 payment requirements structure (for reference):**
```json
{
  "scheme": "exact",
  "network": "base",
  "payTo": "0xRecipientAddress",
  "asset": "0xUSDCContractAddress",
  "maxAmountRequired": "10000",
  "resource": "https://target.example.com/endpoint",
  "description": "Human-readable description",
  "mimeType": "application/json",
  "maxTimeoutSeconds": 180
}
```

`maxAmountRequired` is in micro-USDC (1,000,000 = $1.00).

**Supported networks (HTTPayer):**
- EVM: `base`, `base-sepolia`, `skale-base`, `skale-base-sepolia`
- Solana: `solana` (mainnet), `solana-devnet`

---

## Credit system

| Unit | Value |
|------|-------|
| 1 credit | 0.001 USDC |
| 1 USDC | 1,000 credits |
| Proxy fee | 3% of target payment amount |
| Minimum fee | $0.00 |

**Fee example:**
- Target API charges $0.10 per request
- HTTPayer proxy fee: $0.003 (3%)
- Total credits charged: 103 credits ($0.103)

**Balance response fields:**
- `credits_balance` — current credits (mainnet)
- `daily_limit` — max credits spendable per day
- `daily_spend` — credits spent today
- `daily_remaining` — `daily_limit - daily_spend`

**When to top up:** Below 100 credits you may not have enough for a single request depending on the target API's price. Claude is instructed to call `get_topup_link` and show the user the dashboard URL when this threshold is hit.

**Top up:** https://httpayer.com/dashboard

---

## Error handling

### Setup errors

| Situation | Behavior |
|-----------|----------|
| Key doesn't start with `sk-live-` | Print error, `process.exit(1)` |
| Key rejected (401 from API) | Print "API key rejected", `process.exit(1)` |
| Network unreachable | Print "Could not reach api.httpayer.com", `process.exit(1)` |

### MCP tool errors

All tool errors are caught and returned to Claude as `isError: true` MCP responses. The server process never exits due to a tool error.

| Situation | Error message |
|-----------|---------------|
| No config file | `"No HTTPayer API key configured. Run: npx @httpayer/mcp setup"` |
| HTTPayer API non-2xx | `"HTTPayer {status}: {response body}"` |
| Network error | Native fetch error message |
| Unknown tool name | `"Unknown tool: {name}"` |

### HTTPayer API error codes

| Status | Meaning |
|--------|---------|
| `401` | Invalid API key |
| `402` | Insufficient credits (account needs top-up) |
| `429` | Rate limited or daily limit exceeded |
| `500` | Proxy configuration error |
| `502` | Target API refused payment after retries |

---

## Future work

These are things not yet implemented but would be natural additions:

- **`list_endpoints`** — catalog of known x402-enabled APIs, once HTTPayer publishes one
- **Relay mode** — currently only proxy (API key) mode is supported; relay mode (wallet-based, no API key) is a separate HTTPayer flow not exposed here
- **Usage history** — a `get_usage` tool showing transaction history if the API exposes it
- **Multiple profiles** — supporting more than one API key in the config for multi-account setups
- **`httpayer` npm package integration** — once `npm install httpayer` ships, `api.ts` can delegate to the SDK instead of raw `fetch`
- **`skill.md` at `httpayer.com/skill.md`** — a SKILL.md file hosted at that URL for users who want to install it as a Claude Code skill in addition to (or instead of) the MCP server
- **Auto-update check** — warn when a newer version of the package is available on npm
