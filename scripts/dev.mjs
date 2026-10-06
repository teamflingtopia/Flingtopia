import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [
  spawn(process.execPath, ["--watch", "server/index.mjs"], {
    cwd: root,
    stdio: "inherit",
  }),
  spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1"],
    { cwd: root, stdio: "inherit" },
  ),
];
function stop() {
  for (const child of children) child.kill();
}
for (const child of children)
  child.on("exit", (code) => {
    stop();
    process.exitCode = code || 0;
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
