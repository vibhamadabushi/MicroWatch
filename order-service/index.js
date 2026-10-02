require("./telemetry");
const logger = require("./logger");

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { trace, context, propagation } = require("@opentelemetry/api");

const app = express();
app.use(cors());
app.use(express.json());

const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:3000";
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3003";

// In-memory order store
const orders = [];

// Fault Injection Configuration
let faultConfig = {
  simulateDelay: false,
  delayMs: 3000,
  simulateDbError: false,
  simulateError: false,
  errorCode: 500,
};

// Middleware: Trace context extraction and correlation
app.use((req, res, next) => {
  const currentSpan = trace.getSpan(context.active());
  const traceId = currentSpan ? currentSpan.spanContext().traceId : null;
  const spanId = currentSpan ? currentSpan.spanContext().spanId : null;

  req.traceId = traceId;
  req.spanId = spanId;

  if (traceId) {
    res.setHeader("x-trace-id", traceId);
  }

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      traceId,
      spanId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });

  next();
});

// Helper for HTTP calls with propagated W3C Trace context
async function callService(url, options = {}) {
  const carrier = {};
  propagation.inject(context.active(), carrier);

  const headers = {
    "Content-Type": "application/json",
    ...carrier,
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

// 1. Health
app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    service: "order-service",
    orderCount: orders.length,
    timestamp: new Date().toISOString(),
  });
});

// 2. Fault Config Query
app.get("/api/fault-config", (req, res) => {
  res.json(faultConfig);
});

// 3. Checkout Coordination Endpoint
app.post(["/api/checkout", "/api/orders/checkout"], async (req, res) => {
  const { customerId, items, totalAmount, paymentMethod, shippingAddress } =
    req.body;

  const orderId = `ORD-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
  logger.info(`Starting order checkout workflow for ${orderId}`, {
    traceId: req.traceId,
    orderId,
    customerId,
    totalAmount,
  });

  // A. Check for artificial delay fault
  if (faultConfig.simulateDelay) {
    logger.warn(`[Fault] Injecting order processing delay: ${faultConfig.delayMs}ms`, {
      traceId: req.traceId,
      orderId,
    });
    await new Promise((resolve) => setTimeout(resolve, faultConfig.delayMs));
  }

  // B. Check for simulated database error fault
  if (faultConfig.simulateDbError) {
    logger.error(`[Fault] Database timeout: unable to write order record ${orderId}`, {
      traceId: req.traceId,
      orderId,
      errorType: "DB_CONNECTION_TIMEOUT",
    });
    return res.status(500).json({
      error: "DatabaseConnectionTimeout",
      message: "PostgreSQL cluster replica timed out during transaction write",
      orderId,
      traceId: req.traceId,
    });
  }

  // C. Check for general simulated error
  if (faultConfig.simulateError) {
    logger.error(`[Fault] Simulated order failure HTTP ${faultConfig.errorCode}`, {
      traceId: req.traceId,
      orderId,
    });
    return res.status(faultConfig.errorCode).json({
      error: "OrderProcessingFailed",
      message: "Simulated order failure",
      orderId,
      traceId: req.traceId,
    });
  }

  // Step 1: Call Payment Service
  logger.info(`Invoking payment-service for order ${orderId} (₹${totalAmount || 50})`, {
    traceId: req.traceId,
    orderId,
  });

  let paymentResult;
  try {
    paymentResult = await callService(`${PAYMENT_SERVICE_URL}/api/pay`, {
      method: "POST",
      body: JSON.stringify({
        amount: totalAmount || 50,
        itemName: `Order ${orderId}`,
        customerId: customerId || "guest",
      }),
    });
  } catch (err) {
    logger.error(`Payment service call failed: ${err.message}`, {
      traceId: req.traceId,
      orderId,
      error: err.message,
    });
    const failedOrder = {
      orderId,
      customerId,
      items: items || [],
      totalAmount: totalAmount || 50,
      status: "FAILED_PAYMENT_UNREACHABLE",
      error: err.message,
      createdAt: new Date().toISOString(),
    };
    orders.unshift(failedOrder);
    return res.status(502).json({
      error: "Payment Service Unreachable",
      orderId,
      details: err.message,
      traceId: req.traceId,
    });
  }

  // If payment service returned an error (e.g., 503 or 500 fault)
  if (!paymentResult.ok) {
    logger.error(
      `Payment failed with status ${paymentResult.status} for ${orderId}`,
      {
        traceId: req.traceId,
        orderId,
        paymentStatus: paymentResult.status,
        paymentData: paymentResult.data,
      }
    );
    const failedOrder = {
      orderId,
      customerId,
      items: items || [],
      totalAmount: totalAmount || 50,
      status: "PAYMENT_REJECTED",
      paymentError: paymentResult.data,
      createdAt: new Date().toISOString(),
    };
    orders.unshift(failedOrder);
    return res.status(paymentResult.status).json({
      error: "Payment Failed",
      orderId,
      status: "PAYMENT_REJECTED",
      upstreamPayment: paymentResult.data,
      traceId: req.traceId,
    });
  }

  const transactionId =
    paymentResult.data && paymentResult.data.transactionId
      ? paymentResult.data.transactionId
      : `TXN-GEN-${Date.now()}`;

  logger.info(`Payment succeeded (${transactionId}) for ${orderId}`, {
    traceId: req.traceId,
    orderId,
    transactionId,
  });

  // Step 2: Call Notification Service
  logger.info(`Invoking notification-service for order confirmation ${orderId}`, {
    traceId: req.traceId,
    orderId,
  });

  let notificationResult;
  try {
    notificationResult = await callService(
      `${NOTIFICATION_SERVICE_URL}/api/notify`,
      {
        method: "POST",
        body: JSON.stringify({
          orderId,
          customerId: customerId || "guest",
          amount: totalAmount || 50,
          transactionId,
          channel: "EMAIL",
        }),
      }
    );
  } catch (err) {
    logger.warn(
      `Notification service failed for ${orderId}: ${err.message}. Order still fulfilled.`,
      {
        traceId: req.traceId,
        orderId,
      }
    );
    notificationResult = {
      ok: false,
      status: 503,
      data: { error: "Notification dispatch failed", details: err.message },
    };
  }

  // Record successful order
  const finalOrder = {
    orderId,
    customerId: customerId || "guest",
    items: items || [],
    totalAmount: totalAmount || 50,
    paymentMethod: paymentMethod || "CREDIT_CARD",
    shippingAddress: shippingAddress || "123 Telemetry Ave",
    transactionId,
    notificationStatus: notificationResult.ok ? "SENT" : "FAILED",
    notificationData: notificationResult.data,
    status: "CONFIRMED",
    createdAt: new Date().toISOString(),
  };

  orders.unshift(finalOrder);
  if (orders.length > 200) orders.pop();

  logger.info(`Order ${orderId} completed successfully!`, {
    traceId: req.traceId,
    orderId,
    transactionId,
  });

  return res.status(200).json({
    success: true,
    message: "Order placed and confirmed",
    order: finalOrder,
    traceId: req.traceId,
  });
});

// 4. List Orders
app.get("/api/orders", (req, res) => {
  res.json({
    count: orders.length,
    orders: orders.slice(0, 50),
  });
});

// 5. Get Order by ID
app.get("/api/orders/:id", (req, res) => {
  const order = orders.find((o) => o.orderId === req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Order not found", orderId: req.params.id });
  }
  res.json(order);
});

// 6. Fault Injection Handler
app.post("/api/fault-inject", (req, res) => {
  const { type, enabled, delayMs, errorCode } = req.body;

  if (type === "delay") {
    faultConfig.simulateDelay = Boolean(enabled);
    if (enabled && delayMs) faultConfig.delayMs = delayMs;
  } else if (type === "dbError") {
    faultConfig.simulateDbError = Boolean(enabled);
  } else if (type === "error") {
    faultConfig.simulateError = Boolean(enabled);
    if (errorCode) faultConfig.errorCode = errorCode;
  } else if (type === "reset") {
    faultConfig = {
      simulateDelay: false,
      delayMs: 3000,
      simulateDbError: false,
      simulateError: false,
      errorCode: 500,
    };
  }

  logger.info(`[order-service] Fault config updated: ${JSON.stringify(faultConfig)}`);

  res.json({
    service: "order-service",
    message: "Fault configuration updated",
    currentConfig: faultConfig,
  });
});

const PORT = parseInt(process.env.PORT || "3002", 10);

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`🚀 Order Service running on http://0.0.0.0:${PORT}`);
});
