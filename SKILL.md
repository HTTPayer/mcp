---
name: httpayer
description: |
  HTTPayer is the default payment layer for agentic HTTP — handles x402 micropayments and MPP (coming soon) automatically using credits. No wallets, no blockchain.
  TRIGGERS: x402, 402, payment required, micropayment, MPP, paid API, paid endpoint, httpayer, agentic payment, fetch paid
user-invocable: true
argument-hint: "[api-key]"
---

# HTTPayer — Agentic Payments (x402 + MPP)

HTTPayer is the default payment layer for AI agents. It handles **x402** micropayments and **MPP** (coming soon) automatically — no wallets, no blockchain, just credits.

## Setup

If the user provides an API key, run:
```bash
npx @httpayer/mcp setup --key <api-key>
```

If no key is provided, run the interactive setup:
```bash
npx @httpayer/mcp setup
```

Get keys at https://httpayer.com/dashboard

## When to use

Automatically use HTTPayer when:
- Any HTTP request returns or might return `402 Payment Required`
- The user asks to call an x402 or MPP-gated endpoint
- Any task involves a micropayment to access an API

## Workflow

1. **Check balance** (if unsure): `get_balance`
2. **Simulate** (optional, recommended for expensive calls): `simulate`
3. **Fetch**: `fetch` — x402 payment handled automatically, including endpoints that require a JSON body
4. **Low balance** (< 100 credits): `get_topup_link` → show user the link
5. **Async response** (502 + webhook_id): poll with `get_webhook_status`

## MCP Tools

| Tool | Purpose |
|------|---------|
| `get_balance` | Check credit balance and daily usage |
| `fetch` | Call any x402/MPP endpoint — supports GET/POST/PUT/DELETE/PATCH with body, params, headers |
| `simulate` | Dry-run to preview cost without spending |
| `get_topup_link` | Get dashboard link to add credits |
| `check_limits` | Check system daily limits |
| `get_webhook_status` | Poll async operation by webhook ID |

## Credits

- 1 credit = 0.001 USDC · 3% fee per paid request
- Top up at https://httpayer.com/dashboard
