const { exporter } = require("./telemetry");
const logger = require("./logger");

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const { trace, context, propagation } = require("@opentelemetry/api");

const app = express();
app.use(cors());
app.use(express.json());

const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:8002";
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3003";

// In-memory order store
const orders = [];

// Fault Injection Configuration - Order Service focuses specifically on Database Failure
let faultConfig = {
  simulateDbError: false,
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

// 0. Prometheus Metrics Endpoint
app.get("/metrics", (req, res) => {
  exporter.getMetricsRequestHandler(req, res);
});

// 1. Root / UI Endpoint
app.get("/", (req, res) => {
  if (req.accepts("html") && !req.xhr) {
    const htmlPath = path.join(__dirname, "index.html");
    return res.sendFile(htmlPath, (err) => {
      if (err) {
        res.json({
          service: "order-service",
          status: "UP",
          port: PORT,
          endpoints: [
            "/metrics",
            "/health",
            "/api/checkout",
            "/api/order",
            "/api/orders",
            "/api/fault/enable",
            "/api/fault/disable",
            "/api/fault-config",
          ],
        });
      }
    });
  }
  res.json({
    service: "order-service",
    status: "UP",
    endpoints: {
      metrics: "GET /metrics",
      health: "GET /health",
      checkout: "POST /api/checkout",
      order: "POST /api/order",
      orders: "GET /api/orders",
      orderById: "GET /api/orders/:id",
      faultEnable: "POST /api/fault/enable",
      faultDisable: "POST /api/fault/disable",
      faultConfig: "GET /api/fault-config",
    },
  });
});

// 2. Health Endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    service: "order-service",
    orderCount: orders.length,
    timestamp: new Date().toISOString(),
  });
});

// 3. Fault Config & Control Endpoints
app.get("/api/fault-config", (req, res) => {
  res.json(faultConfig);
});

app.get("/api/fault/status", (req, res) => {
  res.json(faultConfig);
});

app.post("/api/fault/enable", (req, res) => {
  faultConfig.simulateDbError = true;
  logger.warn("Database fault injection enabled", {
    service: "order-service",
    faultType: "database",
  });
  res.json({
    success: true,
    message: "Database failure fault enabled",
    currentConfig: faultConfig,
  });
});

app.post("/api/fault/disable", (req, res) => {
  faultConfig.simulateDbError = false;
  logger.info("Database fault disabled", {
    service: "order-service",
    faultType: "database",
  });
  res.json({
    success: true,
    message: "Database failure fault disabled",
    currentConfig: faultConfig,
  });
});

// Backwards-compatible /api/fault-inject
app.post("/api/fault-inject", (req, res) => {
  const { type, enabled } = req.body || {};

  if (type === "dbError" || type === "database") {
    faultConfig.simulateDbError = Boolean(enabled);
  } else if (type === "reset") {
    faultConfig.simulateDbError = false;
  }

  logger.info(`[order-service] Fault config updated: ${JSON.stringify(faultConfig)}`);

  res.json({
    service: "order-service",
    message: "Fault configuration updated",
    currentConfig: faultConfig,
  });
});

// 4. Order Checkout & Creation Handler
const handleOrderCheckout = async (req, res) => {
  const { customerId, items, item, quantity, totalAmount, paymentMethod, shippingAddress } = req.body || {};

  const orderId = `ORD-${crypto.randomUUID().split("-")[0].toUpperCase()}`;

  logger.info("Order request received", {
    traceId: req.traceId,
    spanId: req.spanId,
    orderId,
    customerId: customerId || "guest",
  });

  logger.info("Processing order", {
    traceId: req.traceId,
    spanId: req.spanId,
    orderId,
  });

  // Database Failure Fault Injection
  if (faultConfig.simulateDbError) {
    logger.warn("Database fault injection enabled", {
      traceId: req.traceId,
      spanId: req.spanId,
      orderId,
    });
    logger.error("Database operation failed", {
      traceId: req.traceId,
      spanId: req.spanId,
      orderId,
      errorType: "DB_CONNECTION_TIMEOUT",
    });
    logger.error("Order failed", {
      traceId: req.traceId,
      spanId: req.spanId,
      orderId,
    });

    const activeSpan = trace.getSpan(context.active());
    if (activeSpan) {
      activeSpan.setStatus({ code: 2, message: "Database operation failed" });
      activeSpan.setAttribute("error", true);
      activeSpan.setAttribute("db.error", "DB_CONNECTION_TIMEOUT");
    }

    return res.status(500).json({
      error: "DatabaseConnectionTimeout",
      message: "PostgreSQL cluster replica timed out during transaction write",
      orderId,
      traceId: req.traceId,
    });
  }

  // Database persistence simulation
  logger.info("Database operation successful", {
    traceId: req.traceId,
    spanId: req.spanId,
    orderId,
  });

  const calculatedAmount = totalAmount || (item ? 49.99 * (quantity || 1) : 49.99);

  // Step 1: Call Payment Service
  logger.info(`Invoking payment-service for order ${orderId} (₹${calculatedAmount})`, {
    traceId: req.traceId,
    orderId,
  });

  let paymentResult;
  try {
    paymentResult = await callService(`${PAYMENT_SERVICE_URL}/api/pay`, {
      method: "POST",
      body: JSON.stringify({
        amount: calculatedAmount,
        itemName: item || `Order ${orderId}`,
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
      customerId: customerId || "guest",
      items: items || [{ name: item || "Standard Item", quantity: quantity || 1 }],
      totalAmount: calculatedAmount,
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
      customerId: customerId || "guest",
      items: items || [{ name: item || "Standard Item", quantity: quantity || 1 }],
      totalAmount: calculatedAmount,
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
          amount: calculatedAmount,
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
    items: items || [{ name: item || "Standard Item", quantity: quantity || 1 }],
    totalAmount: calculatedAmount,
    paymentMethod: paymentMethod || "CREDIT_CARD",
    shippingAddress: shippingAddress || "123 Telemetry Ave",
    transactionId,
    notificationStatus: notificationResult.ok ? "SENT" : "FAILED",
    status: "CONFIRMED",
    createdAt: new Date().toISOString(),
  };

  orders.unshift(finalOrder);
  if (orders.length > 200) orders.pop();

  logger.info("Order completed", {
    traceId: req.traceId,
    spanId: req.spanId,
    orderId,
    transactionId,
  });

  return res.status(200).json({
    success: true,
    message: "Order placed and confirmed",
    order: finalOrder,
    traceId: req.traceId,
  });
};

// Attach checkout endpoints
app.post(["/api/checkout", "/api/orders/checkout", "/api/order"], handleOrderCheckout);

// 5. List Orders
app.get("/api/orders", (req, res) => {
  res.json({
    count: orders.length,
    orders: orders.slice(0, 50),
  });
});

// 6. Get Order by ID
app.get("/api/orders/:id", (req, res) => {
  const order = orders.find((o) => o.orderId === req.params.id);
  if (!order) {
    return res.status(404).json({ error: "Order not found", orderId: req.params.id });
  }
  res.json(order);
});

const PORT = parseInt(process.env.PORT || "3002", 10);

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`🚀 Order Service running on http://0.0.0.0:${PORT}`);
  logger.info(`📊 Prometheus Metrics available at http://0.0.0.0:${PORT}/metrics`);
});

