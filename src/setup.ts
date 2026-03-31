import { createInterface } from "readline";
import { homedir } from "os";
import { join, dirname } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { fileURLToPath } from "url";
import { saveConfig } from "./config.js";

const CLAUDE_JSON = join(homedir(), ".claude.json");
const CLAUDE_SKILLS_DIR = join(homedir(), ".claude", "skills", "httpayer");
const SKILL_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "SKILL.md");

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
    const res = await fetch("https://api.httpayer.com/v1/credits/balance", { // único endpoint con /v1
      headers: { "x-api-key": apiKey },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401)
      return { ok: false, reason: "API key rejected (401 Unauthorized)" };
    // Other server errors — key format may still be fine
    return { ok: true };
  } catch {
    return { ok: false, reason: "Could not reach api.httpayer.com" };
  }
}

function patchClaudeJson(): void {
  let config: { mcpServers?: Record<string, unknown> } = {};
  if (existsSync(CLAUDE_JSON)) {
    try {
      config = JSON.parse(readFileSync(CLAUDE_JSON, "utf-8"));
    } catch {
      // start fresh
    }
  }
  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers["httpayer"] = {
    command: "npx",
    args: ["-y", "@httpayer/mcp"],
  };
  writeFileSync(CLAUDE_JSON, JSON.stringify(config, null, 2));
}

function installSkill(): void {
  mkdirSync(CLAUDE_SKILLS_DIR, { recursive: true });
  copyFileSync(SKILL_SRC, join(CLAUDE_SKILLS_DIR, "SKILL.md"));
}

export async function runSetup(inlineKey?: string): Promise<void> {
  console.log("\nHTTPayer MCP Setup");
  console.log("==================");

  let apiKey: string;

  if (inlineKey) {
    apiKey = inlineKey;
    console.log(`Using provided API key: ${apiKey.slice(0, 12)}...`);
  } else {
    console.log("Get your API key at: https://httpayer.com/dashboard\n");
    apiKey = await prompt("Paste your API key (sk-live-...): ");
  }

  if (!apiKey.startsWith("sk-live-")) {
    console.error(
      '\nInvalid key format. Expected a key starting with "sk-live-"'
    );
    process.exit(1);
  }

  process.stdout.write("Validating key... ");
  const result = await validateApiKey(apiKey);
  if (!result.ok) {
    console.log(`failed\n${result.reason}`);
    process.exit(1);
  }
  console.log("ok");

  saveConfig({ apiKey });
  console.log("Config saved to ~/.httpayer/mcp-config.json");

  const addToClaude = inlineKey
    ? "y"
    : await prompt("\nAdd HTTPayer to Claude Code? This patches ~/.claude.json (y/n): ");

  if (addToClaude.toLowerCase() === "y") {
    patchClaudeJson();
    installSkill();
    console.log('Added "httpayer" to ~/.claude.json');
    console.log("Installed httpayer skill to ~/.claude/skills/httpayer/");
    console.log("\nRestart Claude Code to activate HTTPayer.\n");
  } else {
    console.log('\nTo add manually, put this in ~/.claude.json under "mcpServers":');
    console.log(
      JSON.stringify(
        { httpayer: { command: "npx", args: ["-y", "@httpayer/mcp"] } },
        null,
        2
      )
    );
    console.log();
  }
}
