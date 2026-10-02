/**
 * MicroWatch Cross-Platform Unified Local Runner
 * Starts all 4 microservices + React Dashboard in a single terminal process
 * with unified color-coded prefixes and clean SIGINT shutdown.
 */

const { spawn } = require("child_process");
const path = require("path");

const services = [
  { name: "PAYMENT     ", dir: "payment-service", cmd: "node", args: ["index.js"], color: "\x1b[32m" }, // Green
  { name: "NOTIFICATION", dir: "notification-service", cmd: "node", args: ["index.js"], color: "\x1b[36m" }, // Cyan
  { name: "ORDER       ", dir: "order-service", cmd: "node", args: ["index.js"], color: "\x1b[35m" }, // Magenta
  { name: "GATEWAY     ", dir: "api-gateway", cmd: "node", args: ["index.js"], color: "\x1b[34m", env: { PORT: "8088" } }, // Blue
  { name: "DASHBOARD   ", dir: "dashboard", cmd: "npx", args: ["vite", "--host", "--port", "5173"], color: "\x1b[33m" }, // Yellow
];

console.log("\x1b[1m\x1b[35m");
console.log("==================================================================");
console.log("             🚀 STARTING MICROWATCH PLATFORM LOCALLY             ");
console.log("==================================================================");
console.log("\x1b[0m");

const runningProcesses = [];

services.forEach((svc) => {
  const isWindows = process.platform === "win32";
  const cmd = isWindows && svc.cmd === "npx" ? "npx.cmd" : svc.cmd;

  const proc = spawn(cmd, svc.args, {
    cwd: path.resolve(__dirname, svc.dir),
    shell: isWindows,
    env: { ...process.env, FORCE_COLOR: "1", ...(svc.env || {}) },
  });

  runningProcesses.push({ name: svc.name, proc });

  proc.stdout.on("data", (data) => {
    const lines = data.toString().split(/\r?\n/).filter(Boolean);
    lines.forEach((line) => {
      console.log(`${svc.color}[${svc.name}]\x1b[0m ${line}`);
    });
  });

  proc.stderr.on("data", (data) => {
    const lines = data.toString().split(/\r?\n/).filter(Boolean);
    lines.forEach((line) => {
      console.error(`${svc.color}[${svc.name} ERR]\x1b[0m ${line}`);
    });
  });

  proc.on("close", (code) => {
    console.log(`${svc.color}[${svc.name}]\x1b[0m Process exited with code ${code}`);
  });
});

console.log("\x1b[32m✅ All services spawning in background.\x1b[0m");
console.log("📍 API Gateway: [http://localhost:8080]");
console.log("📍 Dashboard:   [http://localhost:5173]");
console.log("Press Ctrl+C to shut down all processes cleanly.\n");

function shutdown() {
  console.log("\n\x1b[33m🛑 Gracefully terminating all MicroWatch processes...\x1b[0m");
  runningProcesses.forEach(({ name, proc }) => {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", proc.pid, "/f", "/t"]);
      } else {
        proc.kill("SIGTERM");
      }
    } catch (e) {}
  });
  setTimeout(() => process.exit(0), 1000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
