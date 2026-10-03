const { exporter } = require("./telemetry");
const logger = require("./logger");

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

let faultConfig = {
  simulateDelay: false,
  delayMs: 5000,
  simulateError: false,
  errorCode: 503,
};

// Prometheus Metrics Endpoint (scraped on payment-service:8002/metrics)
app.get("/metrics", (req, res) => {
  exporter.getMetricsRequestHandler(req, res);
});

// Root / Status info
app.get("/", (req, res) => {
  if (req.accepts("html") && !req.xhr) {
    const htmlPath = path.join(__dirname, "index.html");
    return res.sendFile(htmlPath, (err) => {
      if (err) {
        res.json({
          service: "payment-service",
          status: "UP",
          port: PORT,
          endpoints: ["/metrics", "/health", "/api/pay", "/api/fault/enable", "/api/fault/disable", "/api/fault-config"],
        });
      }
    });
  }
  res.json({
    service: "payment-service",
    status: "UP",
    endpoints: {
      metrics: "GET /metrics",
      health: "GET /health",
      pay: "POST /api/pay",
      faultEnable: "POST /api/fault/enable",
      faultDisable: "POST /api/fault/disable",
      faultInject: "POST /api/fault-inject",
      faultConfig: "GET /api/fault-config",
    },
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "UP", service: "payment-service" });
});

// Payment processing endpoint
app.post("/api/pay", async (req, res) => {
  const { amount = 49.99, itemName = "Order Checkout" } = req.body || {};

  const transactionId = `TXN-${crypto
    .randomUUID()
    .split("-")[0]
    .toUpperCase()}`;

  logger.info(
    `Processing payment for ${itemName} (₹${amount}) - Txn: ${transactionId}`
  );

  if (faultConfig.simulateDelay) {
    logger.warn(`Injecting simulated delay of ${faultConfig.delayMs}ms on Txn: ${transactionId}`);
    await new Promise((resolve) => setTimeout(resolve, faultConfig.delayMs));
  }

  if (faultConfig.simulateError) {
    logger.error(`Injecting fault error HTTP ${faultConfig.errorCode} on Txn: ${transactionId}`);
    return res.status(faultConfig.errorCode).json({
      success: false,
      error: "Payment Gateway Unavailable",
      errorCode: faultConfig.errorCode,
      transactionId,
      timestamp: new Date().toISOString(),
    });
  }

  // Realistic normal processing delay
  await new Promise((resolve) => setTimeout(resolve, 80 + Math.random() * 80));

  logger.info(`Payment successful for Txn: ${transactionId} (₹${amount})`);

  res.json({
    success: true,
    message: "Payment processed successfully",
    transactionId,
    amount,
    currency: "INR",
    timestamp: new Date().toISOString(),
  });
});

// Fault Panel Quick Toggles - Enable Fault
app.post("/api/fault/enable", (req, res) => {
  const { type = "delay", delayMs = 5000, errorCode = 503 } = req.body || {};
  const queryType = req.query.type;
  const activeType = queryType || type;

  if (activeType === "delay") {
    faultConfig.simulateDelay = true;
    faultConfig.delayMs = Number(delayMs) || 5000;
    logger.warn(`[Fault Injected] Simulated Latency Delay ENABLED: ${faultConfig.delayMs}ms`);
  } else if (activeType === "error") {
    faultConfig.simulateError = true;
    faultConfig.errorCode = Number(errorCode) || 503;
    logger.error(`[Fault Injected] Simulated Error ENABLED: HTTP ${faultConfig.errorCode}`);
  }

  res.json({
    success: true,
    message: `Fault '${activeType}' enabled successfully`,
    currentConfig: faultConfig,
  });
});

// Fault Panel Quick Toggles - Disable Fault
app.post("/api/fault/disable", (req, res) => {
  const { type } = req.body || {};
  const queryType = req.query.type;
  const targetType = queryType || type;

  if (!targetType || targetType === "all" || targetType === "reset") {
    faultConfig.simulateDelay = false;
    faultConfig.delayMs = 5000;
    faultConfig.simulateError = false;
    faultConfig.errorCode = 503;
    logger.info("[Fault Cleared] All faults disabled and reset to baseline");
  } else if (targetType === "delay") {
    faultConfig.simulateDelay = false;
    logger.info("[Fault Cleared] Simulated Latency Delay DISABLED");
  } else if (targetType === "error") {
    faultConfig.simulateError = false;
    logger.info("[Fault Cleared] Simulated Error DISABLED");
  }

  res.json({
    success: true,
    message: `Fault '${targetType || "all"}' disabled successfully`,
    currentConfig: faultConfig,
  });
});

// Backwards-compatible /api/fault-inject
app.post("/api/fault-inject", (req, res) => {
  const { type, enabled, delayMs } = req.body || {};

  if (type === "delay") {
    faultConfig.simulateDelay = Boolean(enabled);
    if (enabled && delayMs) {
      faultConfig.delayMs = Number(delayMs);
    }
  } else if (type === "error") {
    faultConfig.simulateError = Boolean(enabled);
  } else if (type === "reset") {
    faultConfig = {
      simulateDelay: false,
      delayMs: 5000,
      simulateError: false,
      errorCode: 503,
    };
  }

  logger.info(`Fault config updated via /api/fault-inject: ${JSON.stringify(faultConfig)}`);

  res.json({
    message: "Fault configuration updated",
    currentConfig: faultConfig,
  });
});

// Fault Config Status
app.get("/api/fault-config", (req, res) => {
  res.json(faultConfig);
});

app.get("/api/fault/status", (req, res) => {
  res.json(faultConfig);
});

const PORT = parseInt(process.env.PORT || "8002", 10);

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Payment Service running on http://0.0.0.0:${PORT}`);
  logger.info(`Prometheus Metrics available at http://0.0.0.0:${PORT}/metrics`);
});
