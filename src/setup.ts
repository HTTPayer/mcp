import { createInterface } from "readline";
import { homedir, platform } from "os";
import { join, dirname } from "path";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
} from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { saveConfig, loadConfig } from "./config.js";

const SKILL_SRC = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "SKILL.md"
);

// ─── Client config paths ──────────────────────────────────────────────────────

const CLAUDE_JSON = join(homedir(), ".claude.json");
const CLAUDE_DESKTOP_CONFIG =
  platform() === "win32"
    ? join(process.env.APPDATA ?? "", "Claude", "claude_desktop_config.json")
    : join(
        homedir(),
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      );
const CLAUDE_SKILLS_DIR = join(homedir(), ".claude", "skills", "httpayer");

const MCP_ENTRY = {
  command: "npx",
  args: ["-y", "@httpayer/mcp@latest"],
};

const ZED_ENTRY = {
  command: { path: "npx", args: ["-y", "@httpayer/mcp@latest"] },
};

// ─── Supported clients ────────────────────────────────────────────────────────

type Client =
  | "claude-code"
  | "claude-desktop"
  | "cursor"
  | "windsurf"
  | "opencode"
  | "zed"
  | "cline"
  | "warp"
  | "codex"
  | "other";

const CLIENT_LABELS: Record<Client, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  windsurf: "Windsurf",
  opencode: "OpenCode",
  zed: "Zed",
  cline: "Cline",
  warp: "Warp",
  codex: "Codex",
  other: "Other / Manual",
};

// ─── Environment detection ────────────────────────────────────────────────────

function detectClient(): Client | null {
  if (process.env.CLAUDECODE) return "claude-code";
  if (process.env.CURSOR_TRACE_ID || process.env.CURSOR_SESSION_ID)
    return "cursor";
  if (process.env.WINDSURF_EXTENSION_ID || process.env.CODEIUM_API_KEY)
    return "windsurf";
  if (process.env.OPENCODE_SESSION) return "opencode";
  if (process.env.ZED_TERM) return "zed";
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function validateApiKey(
  apiKey: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch("https://api.httpayer.com/v1/credits/balance", {
      headers: { "x-api-key": apiKey },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401)
      return { ok: false, reason: "API key rejected (401 Unauthorized)" };
    if (res.status === 403)
      return { ok: false, reason: "Access denied (403 Forbidden)" };
    return { ok: false, reason: `Unexpected response: ${res.status}` };
  } catch {
    return { ok: false, reason: "Could not reach api.httpayer.com" };
  }
}

function patchMcpJson(
  filePath: string,
  entry: Record<string, unknown>,
  schema: "mcpServers" | "mcp" = "mcpServers"
): void {
  let config: Record<string, unknown> = {};
  if (existsSync(filePath)) {
    try {
      config = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      // start fresh
    }
  }
  mkdirSync(dirname(filePath), { recursive: true });
  if (schema === "mcp") {
    const mcp = (config.mcp ?? {}) as Record<string, unknown>;
    mcp["httpayer"] = { type: "local", command: entry.args ? ["npx", "-y", "@httpayer/mcp@latest"] : entry.command, enabled: true };
    config.mcp = mcp;
  } else {
    const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
    servers["httpayer"] = entry;
    config.mcpServers = servers;
  }
  writeFileSync(filePath, JSON.stringify(config, null, 2));
}

function installSkill(): void {
  mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });
  copyFileSync(SKILL_SRC, join(CLAUDE_SKILLS_DIR, "SKILL.md"));
}

function claudeCodeMcpAdd(scope: "user" | "project"): boolean {
  try {
    execSync(
      `claude mcp add httpayer --scope ${scope} -- npx -y @httpayer/mcp@latest`,
      { stdio: "pipe" }
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Per-client install ───────────────────────────────────────────────────────

function installForClient(
  client: Client,
  scope: "user" | "project" = "user"
): void {
  switch (client) {
    case "claude-code": {
      // Try claude CLI first, fall back to patching ~/.claude.json
      const ok = claudeCodeMcpAdd(scope);
      if (ok) {
        console.log(
          `Added httpayer via \`claude mcp add\` (scope: ${scope})`
        );
      } else {
        patchMcpJson(CLAUDE_JSON, MCP_ENTRY);
        console.log(`Patched ~/.claude.json`);
      }
      installSkill();
      console.log("Installed httpayer skill to ~/.claude/skills/httpayer/");
      console.log("\nRestart Claude Code to activate HTTPayer.\n");
      break;
    }

    case "claude-desktop": {
      patchMcpJson(CLAUDE_DESKTOP_CONFIG, MCP_ENTRY);
      console.log(`Patched ${CLAUDE_DESKTOP_CONFIG}`);
      console.log("\nRestart Claude Desktop to activate HTTPayer.\n");
      break;
    }

    case "cursor": {
      // Cursor: project-level .cursor/mcp.json
      const cursorPath = join(process.cwd(), ".cursor", "mcp.json");
      patchMcpJson(cursorPath, MCP_ENTRY);
      console.log(`Patched ${cursorPath}`);
      console.log("\nReload Cursor window to activate HTTPayer.\n");
      break;
    }

    case "windsurf": {
      const windsurfPath = join(process.cwd(), ".windsurf", "mcp.json");
      patchMcpJson(windsurfPath, MCP_ENTRY);
      console.log(`Patched ${windsurfPath}`);
      console.log("\nReload Windsurf window to activate HTTPayer.\n");
      break;
    }

    case "opencode": {
      // Prefer project-level, fall back to global
      const projectPath = join(process.cwd(), "opencode.json");
      const globalPath = join(homedir(), ".config", "opencode", "config.json");
      const target = existsSync(projectPath) ? projectPath : globalPath;
      patchMcpJson(target, MCP_ENTRY, "mcp");
      console.log(`Patched ${target}`);
      console.log("\nRestart OpenCode to activate HTTPayer.\n");
      break;
    }

    case "zed": {
      console.log("\nAdd this to your Zed settings (Cmd+, → Open settings.json):");
      console.log(
        JSON.stringify(
          {
            context_servers: {
              httpayer: ZED_ENTRY,
            },
          },
          null,
          2
        )
      );
      console.log();
      break;
    }

    case "cline": {
      const clinePath = join(process.cwd(), ".cline", "mcp_settings.json");
      patchMcpJson(clinePath, MCP_ENTRY);
      console.log(`Patched ${clinePath}`);
      console.log("\nReload Cline to activate HTTPayer.\n");
      break;
    }

    case "warp":
    case "codex":
    case "other": {
      console.log("\nAdd this to your MCP config:");
      console.log(
        JSON.stringify({ mcpServers: { httpayer: MCP_ENTRY } }, null, 2)
      );
      console.log();
      break;
    }
  }
}

// ─── Flags ────────────────────────────────────────────────────────────────────

interface SetupOptions {
  key?: string;
  client?: Client;
  scope?: "user" | "project";
  yes?: boolean;
  updateKey?: boolean;
}

export function parseSetupArgs(args: string[]): SetupOptions {
  const opts: SetupOptions = {};
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--key" || args[i] === "-k") && args[i + 1]) {
      opts.key = args[++i];
    } else if (args[i] === "--client" && args[i + 1]) {
      opts.client = args[++i] as Client;
    } else if (args[i] === "--scope" && args[i + 1]) {
      opts.scope = args[++i] as "user" | "project";
    } else if (args[i] === "--yes" || args[i] === "-y") {
      opts.yes = true;
    } else if (args[i] === "--update-key") {
      opts.updateKey = true;
    }
  }
  return opts;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runSetup(opts: SetupOptions = {}): Promise<void> {
  const nonInteractive = opts.yes || Boolean(opts.key);

  console.log("\nHTTPayer MCP Setup");
  console.log("==================");

  // ── API Key ──────────────────────────────────────────────────────────────────
  let apiKey: string;

  if (opts.updateKey) {
    const current = loadConfig();
    if (current?.apiKey) {
      console.log(`Current key: ${current.apiKey.slice(0, 16)}...`);
    }
  }

  if (opts.key) {
    apiKey = opts.key;
    console.log(`Using provided key: ${apiKey.slice(0, 16)}...`);
  } else if (opts.updateKey || !loadConfig()?.apiKey) {
    console.log("Get your API key at: https://app.httpayer.com\n");
    apiKey = await prompt("Paste your API key (sk-live-...): ");
  } else {
    apiKey = loadConfig()!.apiKey;
    console.log(`Using existing key: ${apiKey.slice(0, 16)}...`);
  }

  if (!apiKey.startsWith("sk-live-")) {
    console.error('\nInvalid key format. Expected "sk-live-..."');
    process.exit(1);
  }

  process.stdout.write("Validating key... ");
  const validation = await validateApiKey(apiKey);
  if (!validation.ok) {
    console.log(`failed\n${validation.reason}`);
    process.exit(1);
  }
  console.log("ok");

  saveConfig({ apiKey });
  console.log("Config saved to ~/.httpayer/mcp-config.json");

  // ── Client detection ──────────────────────────────────────────────────────
  let client: Client;

  if (opts.client) {
    client = opts.client;
  } else {
    const detected = detectClient();
    if (detected) {
      client = detected;
      console.log(`\nDetected client: ${CLIENT_LABELS[client]}`);
    } else if (nonInteractive) {
      // Default to claude-code when non-interactive and no client specified
      client = "claude-code";
    } else {
      console.log("\nWhich client are you installing for?\n");
      const entries = Object.entries(CLIENT_LABELS) as [Client, string][];
      entries.forEach(([key, label], i) => {
        console.log(`  ${i + 1}) ${label}`);
      });
      const choice = await prompt("\nEnter number (default 1): ");
      const idx = parseInt(choice || "1", 10) - 1;
      client = entries[idx]?.[0] ?? "claude-code";
    }
  }

  // ── Scope (Claude Code only) ───────────────────────────────────────────────
  let scope: "user" | "project" = opts.scope ?? "user";
  if (client === "claude-code" && !opts.scope && !nonInteractive) {
    const s = await prompt(
      "\nInstall scope — (u)ser (all sessions) or (p)roject (this dir only)? [u]: "
    );
    if (s.toLowerCase().startsWith("p")) scope = "project";
  }

  // ── Install ────────────────────────────────────────────────────────────────
  const confirm =
    nonInteractive ||
    (await prompt(
      `\nInstall HTTPayer for ${CLIENT_LABELS[client]}? (y/n): `
    )) === "y";

  if (confirm) {
    installForClient(client, scope);
  } else {
    console.log("\nSkipped client configuration.");
    console.log("To install manually, see: https://app.httpayer.com/docs\n");
  }
}
