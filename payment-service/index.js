require("./telemetry");
const logger = require("./logger");

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

let faultConfig = {
  simulateDelay: false,
  delayMs: 5000,
  simulateError: false,
  errorCode: 503,
};

app.get("/", (req, res) => {
  res.json({
    message: "Payment Service is Running!",
    endpoints: {
      pay: "POST /api/pay",
      faultInject: "POST /api/fault-inject",
      health: "GET /health",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "UP" });
});

app.post("/api/pay", async (req, res) => {
  const { amount, itemName } = req.body;

  const transactionId = `TXN-${crypto
    .randomUUID()
    .split("-")[0]
    .toUpperCase()}`;

  logger.info(
    `Processing payment for ${itemName} (₹${amount}) - Txn: ${transactionId}`,
  );

  if (faultConfig.simulateDelay) {
    logger.warn(`Injecting ${faultConfig.delayMs}ms delay...`);

    await new Promise((resolve) =>
      setTimeout(resolve, faultConfig.delayMs),
    );
  }

  if (faultConfig.simulateError) {
    logger.error(
      `Injecting error: HTTP ${faultConfig.errorCode}`,
    );

    return res.status(faultConfig.errorCode).json({
      error: "Payment Gateway Unavailable",
      transactionId,
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 200));

  logger.info(
    `Payment successful for Txn: ${transactionId}`,
  );

  res.json({
    success: true,
    message: "Payment processed successfully",
    transactionId,
    amount,
  });
});

app.post("/api/fault-inject", (req, res) => {
  const { type, enabled, delayMs } = req.body;

  if (type === "delay") {
    faultConfig.simulateDelay = enabled;

    if (enabled && delayMs) {
      faultConfig.delayMs = delayMs;
    }
  } else if (type === "error") {
    faultConfig.simulateError = enabled;
  } else if (type === "reset") {
    faultConfig = {
      simulateDelay: false,
      delayMs: 5000,
      simulateError: false,
      errorCode: 503,
    };
  }

  logger.info(
    `Fault config updated: ${JSON.stringify(faultConfig)}`,
  );

  res.json({
    message: "Fault configuration updated",
    currentConfig: faultConfig,
  });
});

app.get("/api/fault-config", (req, res) => {
  res.json(faultConfig);
});

const PORT = parseInt(process.env.PORT || "3000", 10);

app.listen(PORT, () => {
  logger.info(
    `Payment Service running on http://localhost:${PORT}`,
  );
});
