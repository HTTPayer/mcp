import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

const CONFIG_DIR = join(homedir(), ".httpayer");
const CONFIG_FILE = join(CONFIG_DIR, "mcp-config.json");

export interface Config {
  apiKey: string;
}

export function loadConfig(): Config | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getApiKey(): string {
  const config = loadConfig();
  if (!config?.apiKey) {
    throw new Error(
      "No HTTPayer API key configured. Run: npx @httpayer/mcp setup"
    );
  }
  return config.apiKey;
}
