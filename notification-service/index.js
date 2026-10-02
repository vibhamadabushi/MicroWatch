require("./telemetry");
const logger = require("./logger");

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { trace, context } = require("@opentelemetry/api");

const app = express();
app.use(cors());
app.use(express.json());

// In-memory notifications log
const notifications = [];

// Fault Injection Configuration
let faultConfig = {
  simulateQueueDelay: false,
  queueLatencyMs: 2500,
  simulateRetryError: false,
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

// 1. Health
app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    service: "notification-service",
    notificationsDispatched: notifications.length,
    timestamp: new Date().toISOString(),
  });
});

// 2. Fault Config Query
app.get("/api/fault-config", (req, res) => {
  res.json(faultConfig);
});

// 3. Dispatch Notification Endpoint
app.post("/api/notify", async (req, res) => {
  const { orderId, customerId, amount, transactionId, channel } = req.body;
  const notificationId = `NOTIF-${crypto.randomUUID().split("-")[0].toUpperCase()}`;

  logger.info(`Queuing notification for order ${orderId} (${channel || "EMAIL"})`, {
    traceId: req.traceId,
    orderId,
    customerId,
    notificationId,
  });

  // Simulated queue delay / backlog
  if (faultConfig.simulateQueueDelay) {
    logger.warn(`[Fault] Simulating message queue delay: ${faultConfig.queueLatencyMs}ms`, {
      traceId: req.traceId,
      orderId,
      notificationId,
    });
    await new Promise((resolve) => setTimeout(resolve, faultConfig.queueLatencyMs));
  }

  // Simulated worker crash / dead letter queue retry failure
  if (faultConfig.simulateRetryError) {
    logger.error(`[Fault] Notification queue delivery failed after 3 retries for ${orderId}`, {
      traceId: req.traceId,
      orderId,
      notificationId,
    });
    return res.status(faultConfig.errorCode).json({
      error: "NotificationQueueExhausted",
      message: "Worker crashed and exceeded maximum retry budget in dead letter exchange",
      orderId,
      notificationId,
      traceId: req.traceId,
    });
  }

  // Normal simulated async dispatch time
  await new Promise((resolve) => setTimeout(resolve, 80));

  const notificationRecord = {
    notificationId,
    orderId,
    customerId,
    amount,
    transactionId,
    channel: channel || "EMAIL",
    status: "DELIVERED",
    dispatchedAt: new Date().toISOString(),
    traceId: req.traceId,
  };

  notifications.unshift(notificationRecord);
  if (notifications.length > 200) notifications.pop();

  logger.info(`Notification ${notificationId} delivered to ${customerId || "customer"} for ${orderId}`, {
    traceId: req.traceId,
    notificationId,
    orderId,
  });

  res.json({
    success: true,
    notificationId,
    orderId,
    status: "DELIVERED",
    channel: channel || "EMAIL",
    timestamp: notificationRecord.dispatchedAt,
  });
});

// 4. List Dispatched Notifications
app.get("/api/notifications", (req, res) => {
  res.json({
    count: notifications.length,
    notifications: notifications.slice(0, 50),
  });
});

// 5. Fault Injection Handler
app.post("/api/fault-inject", (req, res) => {
  const { type, enabled, delayMs, errorCode } = req.body;

  if (type === "delay" || type === "queueDelay") {
    faultConfig.simulateQueueDelay = Boolean(enabled);
    if (enabled && delayMs) faultConfig.queueLatencyMs = delayMs;
  } else if (type === "retryError" || type === "error") {
    faultConfig.simulateRetryError = Boolean(enabled);
    if (errorCode) faultConfig.errorCode = errorCode;
  } else if (type === "reset") {
    faultConfig = {
      simulateQueueDelay: false,
      queueLatencyMs: 2500,
      simulateRetryError: false,
      errorCode: 500,
    };
  }

  logger.info(`[notification-service] Fault config updated: ${JSON.stringify(faultConfig)}`);

  res.json({
    service: "notification-service",
    message: "Fault configuration updated",
    currentConfig: faultConfig,
  });
});

const PORT = parseInt(process.env.PORT || "3003", 10);

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`🚀 Notification Service running on http://0.0.0.0:${PORT}`);
});
