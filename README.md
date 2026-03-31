# @httpayer/mcp

MCP server for HTTPayer — x402 payments for AI agents. No wallets, no blockchain.

## Setup

```bash
npx @httpayer/mcp setup
```

Get your API key at [httpayer.com/dashboard](https://httpayer.com/dashboard).

## How it works

HTTPayer handles `402 Payment Required` responses automatically using your credit balance. Just call any x402-gated API — payment is transparent.

```
Claude Code → @httpayer/mcp → api.httpayer.com → target x402 API
```

## Available tools

| Tool | Description |
|------|-------------|
| `get_balance` | Check credit balance |
| `fetch` | Call any x402 endpoint — payment auto-handled |
| `simulate` | Preview cost without spending |
| `get_topup_link` | Get dashboard link to add credits |
| `check_limits` | Check system daily limits |
| `get_webhook_status` | Poll async operation |

## Credits

1 credit = 0.001 USDC · 3% fee per paid request

---

© 2026 HTTPayer Inc. — [httpayer.com](https://httpayer.com)
