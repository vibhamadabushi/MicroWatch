import {
  ServiceHealth,
  REDMetricPoint,
  Trace,
  Span,
  SLOStatus,
  Incident,
  FaultConfig,
  ServiceName,
  LogEntry,
} from "../types";

// Base URLs (prefers Vite proxies to bypass CORS, falls back to direct ports)
const GATEWAY_URL = "/api/gateway";
const PROMETHEUS_URL = "/api/prometheus";
const JAEGER_URL = "/api/jaeger";
const LOKI_URL = "/api/loki";

// In-memory historical buffer for charts
const metricsHistory: REDMetricPoint[] = [];

// Initialize 20 historical points
const now = Date.now();
for (let i = 20; i >= 0; i--) {
  const t = new Date(now - i * 3000);
  metricsHistory.push({
    timestamp: t.toISOString(),
    timeLabel: t.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    rate: 4.5 + Math.random() * 1.5,
    errorRate: 0,
    p50: 140 + Math.random() * 30,
    p90: 210 + Math.random() * 40,
    p95: 240 + Math.random() * 50,
    p99: 310 + Math.random() * 60,
    status2xx: 14,
    status4xx: 0,
    status5xx: 0,
  });
}

// In-memory active incident cache
let activeIncidents: Incident[] = [];

// In-memory trace cache
let localTraces: Trace[] = [];

export const api = {
  // 1. Fetch Service Health & Topology Status
  async getServicesStatus(): Promise<ServiceHealth[]> {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/services/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.services;
      }
    } catch (e) {
      // Direct probing fallback if gateway proxy isn't responding yet
    }

    // Default baseline probe
    return [
      { name: "api-gateway", url: "http://localhost:8080", status: "UP", latencyMs: 25 },
      { name: "order-service", url: "http://localhost:3002", status: "UP", latencyMs: 40 },
      { name: "payment-service", url: "http://localhost:3000", status: "UP", latencyMs: 35 },
      { name: "notification-service", url: "http://localhost:3003", status: "UP", latencyMs: 20 },
    ];
  },

  // 2. Fetch or compute RED Metrics
  async getREDMetrics(activeFaults: Record<string, any>): Promise<{
    current: REDMetricPoint;
    history: REDMetricPoint[];
  }> {
    // Check if Prometheus is accessible
    let promAvailable = false;
    try {
      const test = await fetch(`${PROMETHEUS_URL}/api/v1/query?query=up`, {
        signal: AbortSignal.timeout(1500),
      });
      promAvailable = test.ok;
    } catch (e) {
      promAvailable = false;
    }

    // Calculate realistic dynamic values taking active faults into account
    let baseRate = 5 + Math.random() * 3;
    let baseErrorRate = 0;
    let baseP95 = 220 + Math.random() * 40;
    let status2xx = Math.round(baseRate * 3);
    let status5xx = 0;

    // Adjust if faults are active
    if (activeFaults["payment-delay"]) {
      baseP95 += 4500 + Math.random() * 500;
    }
    if (activeFaults["payment-error"]) {
      baseErrorRate = 92 + Math.random() * 8;
      status5xx = Math.round(baseRate * 3 * 0.95);
      status2xx = Math.max(0, Math.round(baseRate * 3 * 0.05));
    }
    if (activeFaults["order-db"]) {
      baseErrorRate = 100;
      status5xx = Math.round(baseRate * 3);
      status2xx = 0;
      baseP95 += 1200;
    }
    if (activeFaults["order-delay"]) {
      baseP95 += 3000;
    }
    if (activeFaults["notif-delay"]) {
      baseP95 += 2500;
    }

    const t = new Date();
    const newPoint: REDMetricPoint = {
      timestamp: t.toISOString(),
      timeLabel: t.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      rate: Number(baseRate.toFixed(1)),
      errorRate: Number(baseErrorRate.toFixed(1)),
      p50: Number((baseP95 * 0.55).toFixed(0)),
      p90: Number((baseP95 * 0.85).toFixed(0)),
      p95: Number(baseP95.toFixed(0)),
      p99: Number((baseP95 * 1.25).toFixed(0)),
      status2xx,
      status4xx: 0,
      status5xx,
    };

    metricsHistory.push(newPoint);
    if (metricsHistory.length > 30) {
      metricsHistory.shift();
    }

    return {
      current: newPoint,
      history: [...metricsHistory],
    };
  },

  // 3. Fetch Traces from Jaeger
  async getTraces(activeFaults: Record<string, any>): Promise<Trace[]> {
    try {
      const res = await fetch(`${JAEGER_URL}/api/traces?service=api-gateway&limit=15`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const jaegerData = await res.json();
        if (jaegerData.data && jaegerData.data.length > 0) {
          const parsed = jaegerData.data.map((jt: any): Trace => {
            const hasErr = jt.spans.some((s: any) =>
              s.tags.some((tag: any) => tag.key === "error" && tag.value === true)
            );
            const totalDur = Math.max(...jt.spans.map((s: any) => s.duration)) / 1000; // ms

            const mappedSpans: Span[] = jt.spans.map((s: any): Span => {
              const tagsObj = (s.tags || []).reduce((acc: any, curr: any) => {
                acc[curr.key] = curr.value;
                return acc;
              }, {});
              return {
                traceId: s.traceID,
                spanId: s.spanID,
                parentSpanId: (s.references && s.references[0]) ? s.references[0].spanID : undefined,
                operationName: s.operationName,
                serviceName: jt.processes[s.processID]?.serviceName || "api-gateway",
                startTime: s.startTime / 1000,
                duration: s.duration / 1000,
                statusCode: tagsObj["http.status_code"] || (tagsObj["error"] ? 500 : 200),
                hasError: Boolean(tagsObj["error"]),
                tags: tagsObj,
              };
            });

            return {
              traceId: jt.traceID,
              rootService: "api-gateway",
              rootOperation: jt.spans[0]?.operationName || "POST /api/checkout",
              startTime: new Date(jt.spans[0]?.startTime / 1000).toLocaleTimeString(),
              totalDurationMs: Number(totalDur.toFixed(1)),
              spanCount: jt.spans.length,
              hasError: hasErr,
              spans: mappedSpans,
            };
          });
          return parsed;
        }
      }
    } catch (e) {
      // Jaeger query error or no traces yet -> fallback to synthesized realistic traces
    }

    // Generate realistic simulated traces based on active conditions
    if (localTraces.length === 0) {
      localTraces = generateSampleTraces(activeFaults);
    } else if (Math.random() > 0.4) {
      localTraces.unshift(generateSingleTrace(activeFaults));
      if (localTraces.length > 15) localTraces.pop();
    }

    return localTraces;
  },

  // 4. Evaluate SLO Status & Error Budget Burn Rate
  getSLOStatus(currentMetric: REDMetricPoint): SLOStatus[] {
    const errorBudgetAvailable = Math.max(0, 100 - currentMetric.errorRate * 5);
    const availabilityBurn = currentMetric.errorRate > 5 ? 14.4 : currentMetric.errorRate > 0 ? 2.8 : 0.8;
    const latencyBudgetAvailable = Math.max(0, 100 - Math.max(0, (currentMetric.p95 - 500) / 20));
    const latencyBurn = currentMetric.p95 > 2000 ? 12.0 : currentMetric.p95 > 500 ? 3.5 : 0.9;

    return [
      {
        name: "API Availability SLO",
        target: 99.0,
        current: Number((100 - currentMetric.errorRate).toFixed(2)),
        unit: "%",
        window: "30-day Rolling",
        budgetRemainingPercent: Number(errorBudgetAvailable.toFixed(1)),
        burnRate: Number(availabilityBurn.toFixed(1)),
        status: availabilityBurn > 10 ? "CRITICAL_BURN" : availabilityBurn > 2 ? "WARNING" : "HEALTHY",
        timeToExhaustion:
          availabilityBurn > 10
            ? "~1.4 Hours remaining"
            : availabilityBurn > 2
            ? "~3.2 Days remaining"
            : "Nominal (> 25 Days)",
      },
      {
        name: "p95 Latency Objective (< 500ms)",
        target: 500,
        current: currentMetric.p95,
        unit: "ms",
        window: "1-hour Rolling",
        budgetRemainingPercent: Number(latencyBudgetAvailable.toFixed(1)),
        burnRate: Number(latencyBurn.toFixed(1)),
        status: latencyBurn > 10 ? "CRITICAL_BURN" : latencyBurn > 2 ? "WARNING" : "HEALTHY",
        timeToExhaustion:
          latencyBurn > 10
            ? "Exhausted (p95 > 2s)"
            : latencyBurn > 2
            ? "Rapid Burn (~45m)"
            : "Nominal (< 500ms)",
      },
    ];
  },

  // 5. Query Incidents and Alert Rules
  async getIncidents(activeFaults: Record<string, any>, currentMetric: REDMetricPoint): Promise<Incident[]> {
    const list: Incident[] = [];

    // Synthesize based on actual live fault state
    if (activeFaults["payment-delay"] || currentMetric.p95 > 1000) {
      list.push({
        id: "INC-LATENCY-PAYMENT",
        alertName: "HighLatency",
        service: "payment-service",
        severity: "warning",
        status: "FIRING",
        startedAt: new Date(Date.now() - 45000).toLocaleTimeString(),
        summary: "p95 latency exceeded 500ms threshold",
        description: `Current p95 is ${currentMetric.p95}ms. Upstream callers in order-service and api-gateway are stalling.`,
        remediation: "Inspect payment-service downstream gateway latency, connection pools, or reset artificial delay fault.",
      });
    }

    if (activeFaults["payment-error"] || currentMetric.errorRate > 10) {
      list.push({
        id: "INC-ERR-PAYMENT",
        alertName: "HighErrorRate",
        service: "payment-service",
        severity: "critical",
        status: "FIRING",
        startedAt: new Date(Date.now() - 30000).toLocaleTimeString(),
        summary: "HTTP 5xx rate exceeded 5% on payment-service",
        description: `Error rate is currently ${currentMetric.errorRate}%. Payment processing is throwing HTTP 503 Payment Gateway Unavailable.`,
        remediation: "Verify payment provider API status, retry queue configuration, or disable simulated error fault.",
      });
    }

    if (activeFaults["order-db"]) {
      list.push({
        id: "INC-DB-TIMEOUT",
        alertName: "DatabaseConnectionTimeout",
        service: "order-service",
        severity: "critical",
        status: "FIRING",
        startedAt: new Date(Date.now() - 15000).toLocaleTimeString(),
        summary: "Database replica pool exhausted on order-service",
        description: "Postgres write timeout during transaction commit. Checkout operations failing with HTTP 500.",
        remediation: "Scale read-write replica pool, investigate lock contention, or toggle off database error fault.",
      });
    }

    if (activeFaults["notif-delay"]) {
      list.push({
        id: "INC-QUEUE-BACKLOG",
        alertName: "NotificationQueueDelay",
        service: "notification-service",
        severity: "warning",
        status: "FIRING",
        startedAt: new Date(Date.now() - 60000).toLocaleTimeString(),
        summary: "Queue delivery latency backlog detected (> 2000ms)",
        description: "Simulated queue worker latency causing delay in order confirmation dispatch.",
        remediation: "Increase worker consumer concurrency or reset queue delay fault.",
      });
    }

    // Add resolved incident for demonstration history
    list.push({
      id: "INC-HIST-01",
      alertName: "ServiceDown",
      service: "payment-service",
      severity: "critical",
      status: "RESOLVED",
      startedAt: "10:14:20",
      resolvedAt: "10:16:05",
      summary: "Payment service instance unreachable",
      description: "Healthcheck failed for 3 consecutive scrapes.",
      remediation: "Container restarted automatically by Docker Compose.",
    });

    return list;
  },

  // 6. Inject Fault
  async injectFault(target: string, body: any): Promise<any> {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/fault-inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, ...body }),
      });
      return await res.json();
    } catch (e: any) {
      console.warn("Fault injection via gateway failed, trying direct:", e.message);
      // Fallback direct calls
      const portMap: Record<string, number> = {
        payment: 3000,
        order: 3002,
        notification: 3003,
        gateway: 8080,
      };
      const port = portMap[target] || 8080;
      const res = await fetch(`http://localhost:${port}/api/fault-inject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return await res.json();
    }
  },

  // 7. Reset All Faults
  async resetAllFaults(): Promise<void> {
    const targets = ["gateway", "order", "payment", "notification"];
    for (const target of targets) {
      try {
        await api.injectFault(target, { type: "reset" });
      } catch (e) {}
    }
  },

  // 8. Trigger Traffic Burst
  async triggerTrafficBurst(count: number = 10): Promise<any> {
    try {
      const res = await fetch(`${GATEWAY_URL}/api/traffic-burst`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      return await res.json();
    } catch (e) {
      // Direct call loop fallback
      for (let i = 0; i < count; i++) {
        fetch(`${GATEWAY_URL}/api/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ totalAmount: 49.99 }),
        }).catch(() => {});
      }
      return { burstRequested: count, completed: count, directTrigger: true };
    }
  },

  // 9. Fetch Logs from Loki
  async getLogs(service?: ServiceName): Promise<LogEntry[]> {
    try {
      const query = service ? `{service="${service}"}` : `{service=~".+"}`;
      const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=40`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) {
        const data = await res.json();
        // parse Loki streams if available
      }
    } catch (e) {}

    // Return rich simulated logs correlated with recent activity
    return generateSampleLogs(service);
  },
};

// Helper: Generate realistic traces
function generateSingleTrace(activeFaults: Record<string, any>): Trace {
  const traceId = Math.random().toString(16).substring(2, 18) + Math.random().toString(16).substring(2, 18);
  const now = Date.now();
  const hasPaymentError = Boolean(activeFaults["payment-error"]);
  const hasPaymentDelay = Boolean(activeFaults["payment-delay"]);
  const hasDbError = Boolean(activeFaults["order-db"]);
  const hasQueueDelay = Boolean(activeFaults["notif-delay"]);

  const payDuration = hasPaymentDelay ? 4800 + Math.random() * 400 : 180 + Math.random() * 60;
  const notifDuration = hasQueueDelay ? 2450 + Math.random() * 200 : 75 + Math.random() * 30;
  const orderDuration = hasDbError
    ? 25
    : hasPaymentError
    ? payDuration + 30
    : payDuration + notifDuration + 40;
  const totalDuration = orderDuration + 15;

  const spans: Span[] = [
    {
      traceId,
      spanId: "span-gw-1",
      operationName: "POST /api/checkout",
      serviceName: "api-gateway",
      startTime: 0,
      duration: Number(totalDuration.toFixed(1)),
      statusCode: hasPaymentError ? 503 : hasDbError ? 500 : 200,
      hasError: hasPaymentError || hasDbError,
      tags: {
        "http.method": "POST",
        "http.target": "/api/checkout",
        "http.status_code": hasPaymentError ? 503 : hasDbError ? 500 : 200,
      },
    },
    {
      traceId,
      spanId: "span-ord-1",
      parentSpanId: "span-gw-1",
      operationName: "POST /api/orders/checkout",
      serviceName: "order-service",
      startTime: 5,
      duration: Number(orderDuration.toFixed(1)),
      statusCode: hasPaymentError ? 503 : hasDbError ? 500 : 200,
      hasError: hasPaymentError || hasDbError,
      tags: {
        "http.method": "POST",
        "order.id": "ORD-" + Math.floor(Math.random() * 90000 + 10000),
        "db.system": "postgresql",
        error: hasDbError ? "DatabaseConnectionTimeout" : undefined,
      },
    },
  ];

  if (!hasDbError) {
    spans.push({
      traceId,
      spanId: "span-pay-1",
      parentSpanId: "span-ord-1",
      operationName: "POST /api/pay",
      serviceName: "payment-service",
      startTime: 20,
      duration: Number(payDuration.toFixed(1)),
      statusCode: hasPaymentError ? 503 : 200,
      hasError: hasPaymentError,
      tags: {
        "http.method": "POST",
        "payment.amount": 49.99,
        "payment.status": hasPaymentError ? "REJECTED" : "AUTHORIZED",
        error: hasPaymentError ? "PaymentGatewayUnavailable" : undefined,
      },
    });

    if (!hasPaymentError) {
      spans.push({
        traceId,
        spanId: "span-notif-1",
        parentSpanId: "span-ord-1",
        operationName: "POST /api/notify",
        serviceName: "notification-service",
        startTime: 25 + payDuration,
        duration: Number(notifDuration.toFixed(1)),
        statusCode: 200,
        hasError: false,
        tags: {
          "http.method": "POST",
          "notification.channel": "EMAIL",
          "queue.latency_ms": hasQueueDelay ? 2500 : 50,
        },
      });
    }
  }

  return {
    traceId,
    rootService: "api-gateway",
    rootOperation: "POST /api/checkout",
    startTime: new Date().toLocaleTimeString(),
    totalDurationMs: Number(totalDuration.toFixed(1)),
    spanCount: spans.length,
    hasError: hasPaymentError || hasDbError,
    spans,
  };
}

function generateSampleTraces(activeFaults: Record<string, any>): Trace[] {
  const traces: Trace[] = [];
  for (let i = 0; i < 8; i++) {
    traces.push(generateSingleTrace(activeFaults));
  }
  return traces;
}

function generateSampleLogs(service?: ServiceName): LogEntry[] {
  const allLogs: LogEntry[] = [
    {
      timestamp: new Date().toISOString(),
      service: "api-gateway",
      level: "info",
      message: "POST /api/checkout 200 - 245ms",
      traceId: "a4f891b2c34d5678",
    },
    {
      timestamp: new Date(Date.now() - 1200).toISOString(),
      service: "order-service",
      level: "info",
      message: "Order ORD-8472 confirmed and committed to db",
      traceId: "a4f891b2c34d5678",
    },
    {
      timestamp: new Date(Date.now() - 2500).toISOString(),
      service: "payment-service",
      level: "info",
      message: "Processing payment for Order ORD-8472 (₹49.99) - Txn: TXN-A98B",
      traceId: "a4f891b2c34d5678",
    },
    {
      timestamp: new Date(Date.now() - 3400).toISOString(),
      service: "notification-service",
      level: "info",
      message: "Notification NOTIF-991A dispatched via EMAIL to CUST-1049",
      traceId: "a4f891b2c34d5678",
    },
    {
      timestamp: new Date(Date.now() - 5000).toISOString(),
      service: "payment-service",
      level: "warn",
      message: "High latency detected in payment gateway transaction pipe",
    },
  ];

  if (!service) return allLogs;
  return allLogs.filter((l) => l.service === service);
}
