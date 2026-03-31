#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes("setup") || args.includes("--setup")) {
  const { runSetup, parseSetupArgs } = await import("./setup.js");
  const opts = parseSetupArgs(args.filter((a) => a !== "setup" && a !== "--setup"));
  await runSetup(opts);
} else {
  const { startServer } = await import("./server.js");
  await startServer();
}
