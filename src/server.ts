import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getApiKey } from "./config.js";
import { getBalance, getLimits, getWebhookStatus, proxyFetch } from "./api.js";

const INSTRUCTIONS = `
HTTPayer lets AI agents call x402-enabled APIs using credit balance — no wallets, no blockchain knowledge required.

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

Credit system: 1 credit = 0.001 USDC. Fee: 3% per request. Top up at https://app.httpayer.com.
`.trim();

function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

function json(data: unknown) {
  return text(JSON.stringify(data, null, 2));
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

export async function startServer(): Promise<void> {
  const server = new Server(
    { name: "httpayer", version: "0.1.0" },
    { capabilities: { tools: { listChanged: false } }, instructions: INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_balance",
        title: "Get Balance",
        description:
          "Check your HTTPayer credit balance and daily usage. Run this when unsure if you have enough credits.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "fetch",
        title: "Fetch (x402)",
        description:
          "Make an HTTP request to any x402-enabled endpoint. HTTPayer automatically handles payment using your credits. Supports GET, POST, PUT, DELETE, PATCH.",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: {
              type: "string",
              description: "The URL to fetch",
            },
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
              description: "HTTP method (default: GET)",
            },
            body: {
              type: "object",
              description: "JSON body to send with the request",
            },
            params: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Query string parameters",
            },
            headers: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Additional request headers",
            },
            timeout: {
              type: "number",
              description: "Request timeout in seconds (max 120)",
            },
          },
        },
      },
      {
        name: "simulate",
        title: "Simulate Fetch",
        description:
          "Dry-run a fetch to see if payment is required and estimate the credit cost, without spending anything.",
        inputSchema: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", description: "URL to simulate" },
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
              description: "HTTP method (default: GET)",
            },
            body: {
              type: "object",
              description: "JSON body",
            },
            params: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Query string parameters",
            },
            headers: {
              type: "object",
              additionalProperties: { type: "string" },
              description: "Additional request headers",
            },
          },
        },
      },
      {
        name: "get_topup_link",
        title: "Get Top-up Link",
        description:
          "Get the link to top up HTTPayer credits. Show this to the user when their balance is running low.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "check_limits",
        title: "Check Limits",
        description:
          "Check global HTTPayer system daily limits and remaining capacity for proxy and relay.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_webhook_status",
        title: "Get Webhook Status",
        description:
          "Poll the status of an async HTTPayer operation. Use this when fetch returns a webhook_id on a 502 response.",
        inputSchema: {
          type: "object",
          required: ["webhook_id"],
          properties: {
            webhook_id: {
              type: "string",
              description: "The webhook ID returned by a previous fetch call",
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case "get_balance": {
          const balance = await getBalance(getApiKey());
          return json(balance);
        }

        case "fetch": {
          const { url, method, body, params, headers, timeout } = args as {
            url: string;
            method?: string;
            body?: unknown;
            params?: Record<string, string>;
            headers?: Record<string, string>;
            timeout?: number;
          };
          const result = await proxyFetch(getApiKey(), url, {
            method,
            json: body,
            params,
            headers,
            timeout,
          });
          return json(result);
        }

        case "simulate": {
          const { url, method, body, params, headers } = args as {
            url: string;
            method?: string;
            body?: unknown;
            params?: Record<string, string>;
            headers?: Record<string, string>;
          };
          const result = await proxyFetch(
            getApiKey(),
            url,
            { method, json: body, params, headers },
            true
          );
          return json(result);
        }

        case "get_topup_link": {
          return text("Top up your HTTPayer credits at: https://app.httpayer.com");
        }

        case "check_limits": {
          const limits = await getLimits(getApiKey());
          return json(limits);
        }

        case "get_webhook_status": {
          const { webhook_id } = args as { webhook_id: string };
          const status = await getWebhookStatus(getApiKey(), webhook_id);
          return json(status);
        }

        default:
          return err(`Unknown tool: ${name}`);
      }
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
