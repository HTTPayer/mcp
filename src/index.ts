#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes("setup") || args.includes("--setup")) {
  const keyFlag = args.indexOf("--key");
  const key = keyFlag !== -1 ? args[keyFlag + 1] : undefined;
  const { runSetup } = await import("./setup.js");
  await runSetup(key);
} else {
  const { startServer } = await import("./server.js");
  await startServer();
}
