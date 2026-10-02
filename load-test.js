#!/usr/bin/env node

/**
 * MicroWatch Automated Load Testing & Incident Drill Suite
 *
 * Usage:
 *   node load-test.js                      # Standard 30s test at 5 RPS
 *   node load-test.js --rps 15 --duration 45
 *   node load-test.js --burst              # Include burst traffic spikes
 *   node load-test.js --drill payment-delay # Run automated fault drill
 *   node load-test.js --drill payment-error
 *   node load-test.js --drill order-db
 */

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:8088";

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1]) return args[index + 1];
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  return defaultValue;
}
const hasFlag = (name) => args.includes(`--${name}`);

const RPS = parseInt(getArg("rps", "5"), 10);
const DURATION_SEC = parseInt(getArg("duration", "30"), 10);
const BURST_ENABLED = hasFlag("burst");
const DRILL_MODE = getArg("drill", null);

console.log("============================================================");
console.log("             ⚡ MICROWATCH LOAD TESTING SUITE ⚡            ");
console.log("============================================================");
console.log(`🎯 Target Gateway:  ${GATEWAY_URL}`);
console.log(`⏱️  Duration:        ${DURATION_SEC} seconds`);
console.log(`📊 Request Rate:    ${RPS} req/s`);
console.log(`💥 Burst Mode:      ${BURST_ENABLED ? "ENABLED" : "Disabled"}`);
console.log(`🚨 Incident Drill:   ${DRILL_MODE || "None (Baseline)"}`);
console.log("============================================================\n");

// Stats Collector
const stats = {
  total: 0,
  success: 0,
  failed: 0,
  statusCodes: {},
  latencies: [],
};

const sampleItems = [
  { id: "PROD-101", name: "High-Frequency Telemetry Probe", price: 89.99 },
  { id: "PROD-102", name: "OTel Distributed Span Collector", price: 120.0 },
  { id: "PROD-103", name: "Prometheus Metric Scraper Node", price: 45.5 },
  { id: "PROD-104", name: "Loki Log Aggregator Agent", price: 65.0 },
];

async function sendCheckoutRequest(iteration) {
  const item = sampleItems[iteration % sampleItems.length];
  const payload = {
    customerId: `CUST-${1000 + (iteration % 500)}`,
    items: [item],
    totalAmount: item.price,
    paymentMethod: iteration % 3 === 0 ? "UPI" : "CREDIT_CARD",
    shippingAddress: `${100 + (iteration % 900)} Observability Way`,
  };

  const start = performance.now();
  stats.total++;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${GATEWAY_URL}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const duration = performance.now() - start;
    stats.latencies.push(duration);
    stats.statusCodes[res.status] = (stats.statusCodes[res.status] || 0) + 1;

    if (res.ok) {
      stats.success++;
      process.stdout.write(`\x1b[32m.\x1b[0m`);
    } else {
      stats.failed++;
      process.stdout.write(`\x1b[31mF\x1b[0m`);
    }
  } catch (err) {
    const duration = performance.now() - start;
    stats.latencies.push(duration);
    stats.failed++;
    stats.statusCodes["ERR"] = (stats.statusCodes["ERR"] || 0) + 1;
    process.stdout.write(`\x1b[35mX\x1b[0m`);
  }
}

async function injectFault(target, body) {
  console.log(`\n\n🚨 [Drill Setup] Injecting fault to ${target}...`);
  try {
    const res = await fetch(`${GATEWAY_URL}/api/fault-inject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, ...body }),
    });
    const data = await res.json();
    console.log(`✅ Fault applied:`, data);
  } catch (e) {
    console.error(`❌ Failed to inject fault:`, e.message);
  }
}

async function resetAllFaults() {
  console.log(`\n\n🧹 [Drill Cleanup] Resetting all faults...`);
  for (const target of ["gateway", "order", "payment", "notification"]) {
    try {
      await fetch(`${GATEWAY_URL}/api/fault-inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, type: "reset" }),
      });
    } catch (e) {}
  }
  console.log("✅ All service faults restored to normal.\n");
}

function calculatePercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)].toFixed(1);
}

async function run() {
  // Pre-flight check
  try {
    const health = await fetch(`${GATEWAY_URL}/health`);
    if (!health.ok) throw new Error(`HTTP ${health.status}`);
    console.log(`✅ API Gateway health verified (HTTP ${health.status})`);
  } catch (e) {
    console.error(`❌ Cannot connect to API Gateway at ${GATEWAY_URL}`);
    console.error(`Please ensure services are running before starting load test.`);
    process.exit(1);
  }

  // Handle drill injections
  if (DRILL_MODE === "payment-delay") {
    await injectFault("payment", { type: "delay", enabled: true, delayMs: 4000 });
  } else if (DRILL_MODE === "payment-error") {
    await injectFault("payment", { type: "error", enabled: true });
  } else if (DRILL_MODE === "order-db") {
    await injectFault("order", { type: "dbError", enabled: true });
  } else if (DRILL_MODE === "notif-retry") {
    await injectFault("notification", { type: "retryError", enabled: true });
  }

  console.log("\n🚀 Starting traffic generation. Press Ctrl+C to stop...\n");

  const startTime = Date.now();
  let iteration = 0;
  const intervalMs = 1000 / RPS;

  const timer = setInterval(async () => {
    if (Date.now() - startTime >= DURATION_SEC * 1000) {
      clearInterval(timer);
      await finish();
      return;
    }

    sendCheckoutRequest(iteration++);

    // Random burst
    if (BURST_ENABLED && iteration % (RPS * 5) === 0) {
      process.stdout.write(`\n⚡ [BURST] Dispatching spike of 10 concurrent checkouts... `);
      for (let b = 0; b < 10; b++) {
        sendCheckoutRequest(iteration++);
      }
    }
  }, intervalMs);

  process.on("SIGINT", async () => {
    clearInterval(timer);
    await finish();
    process.exit(0);
  });
}

async function finish() {
  if (DRILL_MODE) {
    await resetAllFaults();
  }

  console.log("\n\n============================================================");
  console.log("                    📈 TEST SUMMARY REPORT                  ");
  console.log("============================================================");
  console.log(`Total Requests:      ${stats.total}`);
  console.log(`Successful (2xx):    \x1b[32m${stats.success}\x1b[0m`);
  console.log(`Failed / Errors:     \x1b[31m${stats.failed}\x1b[0m`);
  console.log(
    `Success Rate:        ${
      stats.total > 0
        ? ((stats.success / stats.total) * 100).toFixed(2)
        : "0.00"
    }%`
  );
  console.log(`Status Codes:       `, stats.statusCodes);
  console.log("------------------------------------------------------------");
  console.log(`p50 Latency:         ${calculatePercentile(stats.latencies, 50)} ms`);
  console.log(`p90 Latency:         ${calculatePercentile(stats.latencies, 90)} ms`);
  console.log(`p95 Latency:         ${calculatePercentile(stats.latencies, 95)} ms`);
  console.log(`p99 Latency:         ${calculatePercentile(stats.latencies, 99)} ms`);
  console.log("============================================================\n");
}

run();
