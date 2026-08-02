require("./telemetry");

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors()); // Allows our local HTML file to talk to this server
app.use(express.json());

// ─── FAULT INJECTION STATE (Controlled by the UI) ───
let faultConfig = {
  simulateDelay: false,
  delayMs: 5000,
  simulateError: false,
  errorCode: 503,
};

// ─── MAIN PAYMENT ENDPOINT ───
app.post("/api/pay", async (req, res) => {
  const { amount, itemName } = req.body;
  const transactionId = `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`;

  console.log(
    `[LOG] Processing payment for ${itemName} (₹${amount}) - Txn: ${transactionId}`,
  );

  // 1. CHECK FOR INJECTED FAULTS
  if (faultConfig.simulateDelay) {
    console.log(`[FAULT] Injecting ${faultConfig.delayMs}ms delay...`);
    await new Promise((resolve) => setTimeout(resolve, faultConfig.delayMs));
  }

  if (faultConfig.simulateError) {
    console.log(`[FAULT] Injecting error: HTTP ${faultConfig.errorCode}`);
    return res.status(faultConfig.errorCode).json({
      error: "Payment Gateway Unavailable",
      transactionId,
    });

  }
  // Add this at the top of your routes (after app.use(express.json()))
app.get('/', (req, res) => {
    res.json({ 
        message: 'Payment Service is Running!',
        endpoints: {
            pay: 'POST /api/pay',
            faultInject: 'POST /api/fault-inject',
            health: 'GET /health'
        }
    });
});

  // 2. NORMAL SUCCESSFUL FLOW (Simulates normal 200ms processing time)
  await new Promise((resolve) => setTimeout(resolve, 200));

  console.log(`[LOG] Payment successful for Txn: ${transactionId}`);
  res.json({
    success: true,
    message: "Payment processed successfully",
    transactionId,
    amount,
  });
});

// ─── FAULT INJECTION CONTROL PANEL (Called by your UI) ───
app.post("/api/fault-inject", (req, res) => {
  const { type, enabled, delayMs } = req.body;

  if (type === "delay") {
    faultConfig.simulateDelay = enabled;
    if (enabled && delayMs) faultConfig.delayMs = delayMs;
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

  console.log(`[ADMIN] Fault config updated:`, faultConfig);
  res.json({
    message: "Fault configuration updated",
    currentConfig: faultConfig,
  });
});

// ─── START SERVER ───
const PORT = 3000;
app.listen(PORT, () =>
  console.log(`🚀 Payment Service running on http://localhost:${PORT}`),
);
