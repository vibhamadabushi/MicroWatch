require("./telemetry");
const logger = require("./logger");

const express = require("express");
const cors = require("cors");
const http = require("http");
const { trace, context, propagation } = require("@opentelemetry/api");

const app = express();
app.use(cors());
app.use(express.json());

// Upstream service URLs
const ORDER_SERVICE_URL =
  process.env.ORDER_SERVICE_URL || "http://localhost:3002";
const PAYMENT_SERVICE_URL =
  process.env.PAYMENT_SERVICE_URL || "http://localhost:3000";
const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || "http://localhost:3003";

// Gateway Fault Configuration
let faultConfig = {
  simulateDelay: false,
  delayMs: 3000,
  simulateError: false,
  errorCode: 504,
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

  // Intercept response finish for RED metrics logging
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

// Helper: Propagate W3C Trace Context and execute fetch
async function forwardRequest(url, options = {}) {
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

// 1. Root Catalog
app.get("/", (req, res) => {
  res.json({
    name: "MicroWatch API Gateway",
    version: "1.0.0",
    routes: {
      health: "GET /health",
      checkout: "POST /api/checkout",
      orders: "GET /api/orders",
      orderById: "GET /api/orders/:id",
      serviceStatus: "GET /api/services/status",
      faultInject: "POST /api/fault-inject",
      trafficBurst: "POST /api/traffic-burst",
    },
    upstreams: {
      orderService: ORDER_SERVICE_URL,
      paymentService: PAYMENT_SERVICE_URL,
      notificationService: NOTIFICATION_SERVICE_URL,
    },
  });
});

// 2. Health Endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    service: "api-gateway",
    timestamp: new Date().toISOString(),
  });
});

// 3. Checkout Workflow Route
app.post("/api/checkout", async (req, res) => {
  const { customerId, items, paymentMethod, shippingAddress, totalAmount } =
    req.body;

  logger.info(`Received checkout request for customer: ${customerId || "guest"}`, {
    traceId: req.traceId,
    totalAmount,
  });

  // Check Gateway-level faults
  if (faultConfig.simulateDelay) {
    logger.warn(`[Fault] Injecting gateway delay of ${faultConfig.delayMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, faultConfig.delayMs));
  }

  if (faultConfig.simulateError) {
    logger.error(`[Fault] Injecting gateway error HTTP ${faultConfig.errorCode}`);
    return res.status(faultConfig.errorCode).json({
      error: "Gateway Timeout / Simulated Failure",
      traceId: req.traceId,
    });
  }

  try {
    // Forward directly to order service checkout coordinator
    const orderPayload = {
      customerId: customerId || "CUST-" + Math.floor(Math.random() * 9000 + 1000),
      items: items || [
        { id: "ITEM-1", name: "MicroWatch Pro Sensor", price: 49.99, quantity: 1 },
      ],
      paymentMethod: paymentMethod || "CREDIT_CARD",
      shippingAddress: shippingAddress || "123 Telemetry Ave, Cloud City",
      totalAmount: totalAmount || 49.99,
    };

    const result = await forwardRequest(`${ORDER_SERVICE_URL}/api/checkout`, {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });

    return res.status(result.status).json(result.data);
  } catch (err) {
    logger.error(`Order service unreachable: ${err.message}`, {
      traceId: req.traceId,
      error: err.message,
    });
    return res.status(503).json({
      error: "Order Service Unavailable",
      message: err.message,
      traceId: req.traceId,
    });
  }
});

// 4. Get Orders Route
app.get("/api/orders", async (req, res) => {
  try {
    const result = await forwardRequest(`${ORDER_SERVICE_URL}/api/orders`, {
      method: "GET",
    });
    return res.status(result.status).json(result.data);
  } catch (err) {
    return res.status(503).json({
      error: "Order Service Unavailable",
      message: err.message,
    });
  }
});

// 5. Get Order by ID Route
app.get("/api/orders/:id", async (req, res) => {
  try {
    const result = await forwardRequest(
      `${ORDER_SERVICE_URL}/api/orders/${req.params.id}`,
      { method: "GET" }
    );
    return res.status(result.status).json(result.data);
  } catch (err) {
    return res.status(503).json({
      error: "Order Service Unavailable",
      message: err.message,
    });
  }
});

// 6. Unified Fault Injection Router
app.post("/api/fault-inject", async (req, res) => {
  const { target, type, enabled, delayMs, errorCode } = req.body;

  // Handle gateway itself or route to specific downstream
  if (!target || target === "gateway" || target === "api-gateway") {
    if (type === "delay") {
      faultConfig.simulateDelay = enabled;
      if (delayMs) faultConfig.delayMs = delayMs;
    } else if (type === "error") {
      faultConfig.simulateError = enabled;
      if (errorCode) faultConfig.errorCode = errorCode;
    } else if (type === "reset") {
      faultConfig = {
        simulateDelay: false,
        delayMs: 3000,
        simulateError: false,
        errorCode: 504,
      };
    }
    return res.json({
      service: "api-gateway",
      message: "Gateway fault configuration updated",
      currentConfig: faultConfig,
    });
  }

  // Target downstream services
  let targetUrl = "";
  if (target === "payment" || target === "payment-service") {
    targetUrl = `${PAYMENT_SERVICE_URL}/api/fault-inject`;
  } else if (target === "order" || target === "order-service") {
    targetUrl = `${ORDER_SERVICE_URL}/api/fault-inject`;
  } else if (target === "notification" || target === "notification-service") {
    targetUrl = `${NOTIFICATION_SERVICE_URL}/api/fault-inject`;
  }

  if (targetUrl) {
    try {
      const response = await forwardRequest(targetUrl, {
        method: "POST",
        body: JSON.stringify(req.body),
      });
      return res.status(response.status).json(response.data);
    } catch (err) {
      return res.status(502).json({
        error: `Failed to configure faults on ${target}`,
        message: err.message,
      });
    }
  }

  return res.status(400).json({ error: `Unknown fault target: ${target}` });
});

// 7. Microservice Topology & Health Aggregate Status
app.get("/api/services/status", async (req, res) => {
  const probe = async (name, url, metricsUrl) => {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1200);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      const latency = Date.now() - t0;
      let data = {};
      try {
        data = await resp.json();
      } catch (e) {}
      return {
        name,
        url,
        metricsUrl,
        status: resp.ok ? "UP" : "DEGRADED",
        httpStatus: resp.status,
        latencyMs: latency,
        data,
      };
    } catch (e) {
      return {
        name,
        url,
        metricsUrl,
        status: "DOWN",
        error: e.message,
        latencyMs: Date.now() - t0,
      };
    }
  };

  const results = await Promise.all([
    probe("api-gateway", `http://localhost:${PORT}/health`, `http://localhost:${process.env.PROMETHEUS_PORT || 9466}/metrics`),
    probe("order-service", `${ORDER_SERVICE_URL}/health`, `${ORDER_SERVICE_URL.replace('3002', '9465')}/metrics`),
    probe("payment-service", `${PAYMENT_SERVICE_URL}/health`, `${PAYMENT_SERVICE_URL.replace('3000', '9464')}/metrics`),
    probe("notification-service", `${NOTIFICATION_SERVICE_URL}/health`, `${NOTIFICATION_SERVICE_URL.replace('3003', '9467')}/metrics`),
  ]);

  res.json({
    timestamp: new Date().toISOString(),
    services: results,
  });
});

// 8. Traffic Burst / Live Generator Helper
app.post("/api/traffic-burst", async (req, res) => {
  const count = Math.min(parseInt(req.body.count || 5, 10), 100);
  const results = [];

  for (let i = 0; i < count; i++) {
    try {
      const orderPayload = {
        customerId: `USER-${Math.floor(Math.random() * 8999 + 1000)}`,
        items: [{ id: "ITEM-AUTO", name: "Load Test Item", price: 25.0 + i, quantity: 1 }],
        totalAmount: 25.0 + i,
      };
      const r = await forwardRequest(`http://localhost:${PORT}/api/checkout`, {
        method: "POST",
        body: JSON.stringify(orderPayload),
      });
      results.push({ index: i + 1, status: r.status, ok: r.ok });
    } catch (err) {
      results.push({ index: i + 1, status: 500, error: err.message });
    }
  }

  res.json({
    burstRequested: count,
    completed: results.length,
    successful: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

let PORT = parseInt(process.env.PORT || "8080", 10);

const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`🚀 API Gateway running on http://0.0.0.0:${PORT}`);
});

server.on("error", (err) => {
  if ((err.code === "EADDRINUSE" || err.code === "EACCES") && PORT === 8080) {
    logger.warn(`Port 8080 unavailable (${err.code}), falling back to port 8088...`);
    PORT = 8088;
    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`🚀 API Gateway running on http://0.0.0.0:${PORT}`);
    });
  } else {
    logger.error(`API Gateway failed to start: ${err.message}`);
  }
});
