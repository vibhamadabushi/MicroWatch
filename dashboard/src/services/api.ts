import {
  ServiceHealth,
  REDMetricPoint,
  Trace,
  Span,
  SLOStatus,
  Incident,
  ServiceName,
  LogEntry,
  InventoryStockResponse,
  InventoryVerifyRequest,
  InventoryVerifyResult,
  InventoryFaultStatus,
} from "../types";

// Base URLs (prefers Vite proxies to bypass CORS, falls back to direct ports)
const PAYMENT_PROXY = "/api/payment";
const INVENTORY_PROXY = "/api/inventory";
const PROMETHEUS_URL = "/api/prometheus";
const JAEGER_URL = "/api/jaeger";
const LOKI_URL = "/api/loki";
const DIRECT_PAYMENT_URL = "http://localhost:8002";
const DIRECT_INVENTORY_URL = "http://localhost:8004";
const DIRECT_PROMETHEUS_URL = "http://localhost:9090";
const DIRECT_JAEGER_URL = "http://localhost:16686";
const DIRECT_LOKI_URL = "http://localhost:3100";

// In-memory historical buffer for charts
const metricsHistory: REDMetricPoint[] = [];

// Initialize 20 historical points
const now = Date.now();
for (let i = 20; i >= 0; i--) {
  const t = new Date(now - i * 3000);
  metricsHistory.push({
    timestamp: t.toISOString(),
    timeLabel: t.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    rate: 5.0 + Math.random() * 1.5,
    errorRate: 0,
    p50: 120 + Math.random() * 25,
    p90: 180 + Math.random() * 30,
    p95: 210 + Math.random() * 35,
    p99: 280 + Math.random() * 40,
    status2xx: 15,
    status4xx: 0,
    status5xx: 0,
  });
}

// In-memory trace cache
let localTraces: Trace[] = [];

export const api = {
  // 1. Fetch Service Health & Topology Status (payment-service :8002 & order-service :3002)
  async getServicesStatus(): Promise<ServiceHealth[]> {
    let paymentStatus: ServiceHealth = {
      name: "payment-service",
      url: "http://localhost:8002",
      metricsUrl: "http://localhost:8002/metrics",
      status: "UP",
      latencyMs: 15,
    };

    try {
      const start = performance.now();
      const res = await fetch(`${PAYMENT_PROXY}/health`, {
        signal: AbortSignal.timeout(1500),
      }).catch(() =>
        fetch(`${DIRECT_PAYMENT_URL}/health`, {
          signal: AbortSignal.timeout(1500),
        })
      );

      if (res && res.ok) {
        paymentStatus.status = "UP";
        paymentStatus.latencyMs = Math.round(performance.now() - start);
      } else {
        paymentStatus.status = "DEGRADED";
      }
    } catch {
      paymentStatus.status = "DOWN";
    }

    let orderStatus: ServiceHealth = {
      name: "order-service",
      url: "http://localhost:3002",
      metricsUrl: "http://localhost:3002/metrics",
      status: "UP",
      latencyMs: 12,
    };

    try {
      const start = performance.now();
      const res = await fetch(`/api/orders/health`, {
        signal: AbortSignal.timeout(1500),
      }).catch(() =>
        fetch(`http://localhost:3002/health`, {
          signal: AbortSignal.timeout(1500),
        })
      );

      if (res && res.ok) {
        orderStatus.status = "UP";
        orderStatus.latencyMs = Math.round(performance.now() - start);
      } else {
        orderStatus.status = "DEGRADED";
      }
    } catch {
      orderStatus.status = "DOWN";
    }

    let inventoryStatus: ServiceHealth = {
      name: "inventory-service",
      url: "http://localhost:8004",
      metricsUrl: "http://localhost:8004/metrics",
      status: "UP",
      latencyMs: 10,
    };

    try {
      const start = performance.now();
      const res = await fetch(`${INVENTORY_PROXY}/health`, {
        signal: AbortSignal.timeout(1500),
      }).catch(() =>
        fetch(`${DIRECT_INVENTORY_URL}/health`, {
          signal: AbortSignal.timeout(1500),
        })
      );

      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        inventoryStatus.status = data.status === "DEGRADED" ? "DEGRADED" : "UP";
        inventoryStatus.latencyMs = Math.round(performance.now() - start);
      } else {
        inventoryStatus.status = "DEGRADED";
      }
    } catch {
      inventoryStatus.status = "DOWN";
    }

    return [
      paymentStatus,
      orderStatus,
      inventoryStatus,
      {
        name: "api-gateway",
        url: "http://localhost:8080",
        status: "UP",
        latencyMs: 5,
      },
      {
        name: "notification-service",
        url: "http://localhost:3003",
        status: "UP",
        latencyMs: 8,
      },
    ];
  },

  // 2. Fetch or compute RED Metrics (Scrapes for job="payment-service" & job="order-service")
  async getREDMetrics(activeFaults: Record<string, any>): Promise<{
    current: REDMetricPoint;
    history: REDMetricPoint[];
  }> {
    let baseRate = 5 + Math.random() * 2.5;
    let baseErrorRate = 0;
    let baseP95 = 200 + Math.random() * 35;
    let status2xx = Math.round(baseRate * 3);
    let status5xx = 0;

    // Scrape real Prometheus metrics if available
    try {
      const promQueryRate = encodeURIComponent('sum(rate(http_server_request_duration_count[1m]))');
      const promQueryErr = encodeURIComponent('sum(rate(http_server_request_duration_count{http_response_status_code=~"5.."}[1m]))');
      const promQueryP95 = encodeURIComponent('histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_bucket[1m]))) * 1000');

      const [rateRes, errRes, p95Res] = await Promise.allSettled([
        fetch(`${PROMETHEUS_URL}/api/v1/query?query=${promQueryRate}`, { signal: AbortSignal.timeout(1200) })
          .catch(() => fetch(`${DIRECT_PROMETHEUS_URL}/api/v1/query?query=${promQueryRate}`, { signal: AbortSignal.timeout(1200) })),
        fetch(`${PROMETHEUS_URL}/api/v1/query?query=${promQueryErr}`, { signal: AbortSignal.timeout(1200) })
          .catch(() => fetch(`${DIRECT_PROMETHEUS_URL}/api/v1/query?query=${promQueryErr}`, { signal: AbortSignal.timeout(1200) })),
        fetch(`${PROMETHEUS_URL}/api/v1/query?query=${promQueryP95}`, { signal: AbortSignal.timeout(1200) })
          .catch(() => fetch(`${DIRECT_PROMETHEUS_URL}/api/v1/query?query=${promQueryP95}`, { signal: AbortSignal.timeout(1200) })),
      ]);

      if (rateRes.status === "fulfilled" && rateRes.value && rateRes.value.ok) {
        const rateJson = await rateRes.value.json();
        const val = parseFloat(rateJson?.data?.result?.[0]?.value?.[1]);
        if (!isNaN(val) && val > 0) {
          baseRate = Number(val.toFixed(2));
          status2xx = Math.round(baseRate * 3);
        }
      }

      if (errRes.status === "fulfilled" && errRes.value && errRes.value.ok) {
        const errJson = await errRes.value.json();
        const val = parseFloat(errJson?.data?.result?.[0]?.value?.[1]);
        if (!isNaN(val) && val > 0 && baseRate > 0) {
          baseErrorRate = Math.min(100, Number(((val / baseRate) * 100).toFixed(1)));
          status5xx = Math.round(val * 3);
          status2xx = Math.max(0, status2xx - status5xx);
        }
      }

      if (p95Res.status === "fulfilled" && p95Res.value && p95Res.value.ok) {
        const p95Json = await p95Res.value.json();
        const val = parseFloat(p95Json?.data?.result?.[0]?.value?.[1]);
        if (!isNaN(val) && val > 0) {
          baseP95 = Number(val.toFixed(0));
        }
      }
    } catch {
      // Fallback synthesis
    }

    // Dynamic state adjustment reflecting active chaos faults
    if (activeFaults["payment-delay"]) {
      baseP95 += 4800 + Math.random() * 400;
    }
    if (activeFaults["payment-error"]) {
      baseErrorRate = 95 + Math.random() * 5;
      status5xx = Math.round(baseRate * 3 * 0.95);
      status2xx = Math.max(0, Math.round(baseRate * 3 * 0.05));
    }
    if (activeFaults["order-db"]) {
      baseErrorRate = 80 + Math.random() * 10;
      status5xx = Math.round(baseRate * 3 * 0.8);
      status2xx = Math.max(0, Math.round(baseRate * 3 * 0.2));
    }
    if (activeFaults["inventory-error"]) {
      baseErrorRate = 88 + Math.random() * 8;
      status5xx = Math.round(baseRate * 3 * 0.88);
      status2xx = Math.max(0, Math.round(baseRate * 3 * 0.12));
    }

    const t = new Date();
    const newPoint: REDMetricPoint = {
      timestamp: t.toISOString(),
      timeLabel: t.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      rate: Number(baseRate.toFixed(1)),
      errorRate: Number(baseErrorRate.toFixed(1)),
      p50: Number((baseP95 * 0.5).toFixed(0)),
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
      const res = await fetch(`${JAEGER_URL}/api/traces?service=payment-service&limit=20`, {
        signal: AbortSignal.timeout(2000),
      }).catch(() =>
        fetch(`${DIRECT_JAEGER_URL}/api/traces?service=payment-service&limit=20`, {
          signal: AbortSignal.timeout(2000),
        })
      );

      if (res && res.ok) {
        const jaegerData = await res.json();
        if (jaegerData.data && jaegerData.data.length > 0) {
          const parsed = jaegerData.data.map((jt: any): Trace => {
            const hasErr = jt.spans.some((s: any) =>
              s.tags.some((tag: any) => tag.key === "error" && tag.value === true)
            );
            const totalDur = Math.max(...jt.spans.map((s: any) => s.duration)) / 1000;

            const mappedSpans: Span[] = jt.spans.map((s: any): Span => {
              const tagsObj = (s.tags || []).reduce((acc: any, curr: any) => {
                acc[curr.key] = curr.value;
                return acc;
              }, {});
              return {
                traceId: s.traceID,
                spanId: s.spanID,
                parentSpanId: s.references && s.references[0] ? s.references[0].spanID : undefined,
                operationName: s.operationName || "POST /api/pay",
                serviceName: "payment-service",
                startTime: s.startTime / 1000,
                duration: s.duration / 1000,
                statusCode: tagsObj["http.status_code"] || (tagsObj["error"] ? 503 : 200),
                hasError: Boolean(tagsObj["error"]),
                tags: tagsObj,
              };
            });

            return {
              traceId: jt.traceID,
              rootService: "payment-service",
              rootOperation: jt.spans[0]?.operationName || "POST /api/pay",
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
    } catch {}

    if (localTraces.length === 0) {
      localTraces = generatePaymentTraces(activeFaults);
    } else if (Math.random() > 0.4) {
      localTraces.unshift(generateSinglePaymentTrace(activeFaults));
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
        name: "Service Availability SLO (99.0%)",
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
        name: "p95 Latency SLO (< 500ms)",
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

    if (activeFaults["payment-delay"] || currentMetric.p95 > 1000) {
      list.push({
        id: "INC-LATENCY-PAYMENT",
        alertName: "HighLatency",
        service: "payment-service",
        severity: "warning",
        status: "FIRING",
        startedAt: new Date(Date.now() - 45000).toLocaleTimeString(),
        summary: "p95 latency exceeded 500ms threshold on payment-service",
        description: `Current p95 is ${currentMetric.p95}ms. Downstream payment processing is experiencing high delay.`,
        remediation: "Inspect payment gateway connection pool or toggle off latency delay fault at /api/fault/disable.",
      });
    }

    if (activeFaults["payment-error"] || currentMetric.errorRate > 5) {
      list.push({
        id: "INC-ERR-PAYMENT",
        alertName: "HighErrorRate",
        service: "payment-service",
        severity: "critical",
        status: "FIRING",
        startedAt: new Date(Date.now() - 30000).toLocaleTimeString(),
        summary: "HTTP 5xx error rate exceeded 5% on payment-service",
        description: `Error rate is currently ${currentMetric.errorRate}%. Payment transactions returning HTTP 503 Payment Gateway Unavailable.`,
        remediation: "Check upstream acquirer connectivity or toggle off error fault via /api/fault/disable.",
      });
    }

    if (activeFaults["order-db"]) {
      list.push({
        id: "INC-ERR-ORDER-DB",
        alertName: "HighErrorRate",
        service: "order-service",
        severity: "critical",
        status: "FIRING",
        startedAt: new Date(Date.now() - 25000).toLocaleTimeString(),
        summary: "Database connection timeout on order-service",
        description: "PostgreSQL cluster replica timed out during transaction write. Order placement failing with 500 error.",
        remediation: "Check PostgreSQL replica node or toggle off database fault via /api/fault/disable on order-service.",
      });
    }

    if (activeFaults["inventory-error"]) {
      list.push({
        id: "INC-ERR-INVENTORY-503",
        alertName: "StockVerificationUnavailable",
        service: "inventory-service",
        severity: "critical",
        status: "FIRING",
        startedAt: new Date(Date.now() - 20000).toLocaleTimeString(),
        summary: "HTTP 503 Service Unavailable on inventory-service",
        description: "Stock verification failed with HTTP 503. Downstream order transactions aborted.",
        remediation: "Inspect inventory service replica or toggle off inventory fault via /api/fault/disable on inventory-service.",
      });
    }

    // Historical resolved incident
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

  // Fetch actual Order Service Database Fault status from backend
  async getOrderFaultStatus(): Promise<boolean> {
    try {
      const res = await fetch("/api/order/fault/status", {
        signal: AbortSignal.timeout(1500),
      }).catch(() =>
        fetch("http://localhost:3002/api/fault/status", {
          signal: AbortSignal.timeout(1500),
        })
      );
      if (res && res.ok) {
        const data = await res.json();
        return Boolean(data.simulateDbError);
      }
    } catch {}
    return false;
  },

  // Fetch actual Inventory Service Fault status from backend
  async getInventoryFaultStatus(): Promise<boolean> {
    try {
      const res = await fetch("/api/inventory/fault/status", {
        signal: AbortSignal.timeout(1500),
      }).catch(() =>
        fetch(`${DIRECT_INVENTORY_URL}/api/fault/status`, {
          signal: AbortSignal.timeout(1500),
        })
      );
      if (res && res.ok) {
        const data = await res.json();
        return Boolean(data.simulateServiceUnavailable);
      }
    } catch {}
    return false;
  },

  // 6. Inject Fault - Direct support for both payment-service and order-service
  async injectFault(target: string, body: any): Promise<any> {
    const isEnabling = body.enabled !== false;
    const endpoint = isEnabling ? "enable" : "disable";

    if (target === "order" || target === "order-service") {
      try {
        const res = await fetch(`/api/order/fault/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "database" }),
        }).catch(() =>
          fetch(`http://localhost:3002/api/fault/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "database" }),
          })
        );
        if (res && res.ok) return await res.json();
      } catch {}

      return { target: "order-service", success: true, endpoint, type: "database" };
    }

    if (target === "inventory" || target === "inventory-service") {
      try {
        const res = await fetch(`/api/inventory/fault/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "serviceUnavailable" }),
        }).catch(() =>
          fetch(`${DIRECT_INVENTORY_URL}/api/fault/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "serviceUnavailable" }),
          })
        );
        if (res && res.ok) return await res.json();
      } catch {}

      return { target: "inventory-service", success: true, endpoint, type: "serviceUnavailable" };
    }

    const payload = isEnabling
      ? { type: body.type || (target.includes("delay") ? "delay" : "error"), delayMs: body.delayMs || 5000, errorCode: 503 }
      : { type: body.type || (target.includes("delay") ? "delay" : "error") };

    try {
      const res = await fetch(`${DIRECT_PAYMENT_URL}/api/fault/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
    } catch {}

    try {
      const res = await fetch(`${PAYMENT_PROXY}/api/fault/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
    } catch {}

    return { target: "payment-service", success: true, endpoint, ...payload };
  },

  // 7. Reset All Faults across services
  async resetAllFaults(): Promise<void> {
    try {
      await fetch(`/api/inventory/fault/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch(() =>
        fetch(`${DIRECT_INVENTORY_URL}/api/fault/disable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    } catch {}

    try {
      await fetch(`/api/order/fault/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "database" }),
      }).catch(() =>
        fetch(`http://localhost:3002/api/fault/disable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "database" }),
        })
      );
    } catch {}

    try {
      await fetch(`${DIRECT_PAYMENT_URL}/api/fault/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "all" }),
      });
    } catch {
      try {
        await fetch(`${PAYMENT_PROXY}/api/fault/disable`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "all" }),
        });
      } catch {}
    }
  },

  // 8. Trigger Traffic Burst - Dispatches transactions
  async triggerTrafficBurst(count: number = 10): Promise<any> {
    const dispatches = [];
    for (let i = 0; i < count; i++) {
      dispatches.push(
        fetch(`http://localhost:3002/api/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: `Burst Pizza #${i + 1}`,
            quantity: 1,
            totalAmount: 49.99,
          }),
        }).catch(() =>
          fetch(`${DIRECT_PAYMENT_URL}/api/pay`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              amount: Number((20 + Math.random() * 80).toFixed(2)),
              itemName: `Checkout Item #${i + 1}`,
            }),
          }).catch(() => {})
        )
      );
    }
    await Promise.allSettled(dispatches);
    return { burstRequested: count, completed: count, target: "order-service & payment-service" };
  },

  // 9. Fetch Logs from Loki
  async getLogs(activeFaults: Record<string, any> = {}): Promise<LogEntry[]> {
    try {
      const query = `{service=~"payment-service|order-service|inventory-service"}`;
      const res = await fetch(`${LOKI_URL}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=40`, {
        signal: AbortSignal.timeout(1500),
      }).catch(() =>
        fetch(`${DIRECT_LOKI_URL}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=40`, {
          signal: AbortSignal.timeout(1500),
        })
      );
      if (res && res.ok) {
        const data = await res.json();
        const streams = data?.data?.result;
        if (streams && streams.length > 0) {
          const entries: LogEntry[] = [];
          for (const s of streams) {
            const svcName = s.stream?.service || "order-service";
            for (const [ts, line] of s.values) {
              try {
                const parsed = JSON.parse(line);
                entries.push({
                  timestamp: new Date(Number(ts.substring(0, 13))).toLocaleTimeString(),
                  service: svcName as ServiceName,
                  level: parsed.level || "info",
                  message: parsed.message || line,
                });
              } catch {
                entries.push({
                  timestamp: new Date().toLocaleTimeString(),
                  service: svcName as ServiceName,
                  level: "info",
                  message: line,
                });
              }
            }
          }
          if (entries.length > 0) return entries;
        }
      }
    } catch {}

    return generateMeshLogs(activeFaults);
  },

  // 10. Inventory Control Center APIs
  async getInventoryStock(): Promise<InventoryStockResponse> {
    try {
      const res = await fetch(`${INVENTORY_PROXY}/stock`, {
        signal: AbortSignal.timeout(2000),
      }).catch(() =>
        fetch(`${DIRECT_INVENTORY_URL}/api/inventory/stock`, {
          signal: AbortSignal.timeout(2000),
        })
      );
      if (res && res.ok) {
        return await res.json();
      }
    } catch {}

    return {
      service: "inventory-service",
      totalProducts: 7,
      stock: {
        "PROD-101": { id: "PROD-101", name: "High-Frequency Telemetry Probe", stock: 150 },
        "PROD-102": { id: "PROD-102", name: "OTel Distributed Span Collector", stock: 120 },
        "PROD-103": { id: "PROD-103", name: "Prometheus Metric Scraper Node", stock: 80 },
        "PROD-104": { id: "PROD-104", name: "Loki Log Aggregator Agent", stock: 200 },
        "ITEM-1": { id: "ITEM-1", name: "MicroWatch Pro Sensor", stock: 350 },
        "Standard Item": { id: "ITEM-STD", name: "Standard Item", stock: 500 },
        "Test Pizza": { id: "ITEM-PIZZA", name: "Test Pizza", stock: 100 },
      },
    };
  },

  async verifyInventoryStock(req: InventoryVerifyRequest): Promise<InventoryVerifyResult> {
    try {
      let res = await fetch(`${INVENTORY_PROXY}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(4000),
      }).catch(() => null);

      if (!res) {
        res = await fetch(`${DIRECT_INVENTORY_URL}/api/inventory/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
          signal: AbortSignal.timeout(4000),
        }).catch(() => null);
      }

      if (res) {
        const data = await res.json().catch(() => ({}));
        return {
          success: res.ok,
          verified: Boolean(data.verified),
          statusCode: res.status,
          message: data.message || (res.ok ? "Product stock verified successfully" : "Stock verification failed"),
          orderId: data.orderId || req.orderId,
          traceId: data.traceId,
          items: data.items,
          details: data.details,
          error: data.error,
          timestamp: data.timestamp || new Date().toISOString(),
        };
      }
    } catch (err) {
      return {
        success: false,
        statusCode: 500,
        message: err.message || "Failed to reach inventory service",
        orderId: req.orderId,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: false,
      statusCode: 503,
      message: "Connection to inventory-service timed out",
      orderId: req.orderId,
      timestamp: new Date().toISOString(),
    };
  },

  async getInventoryFaultConfig(): Promise<InventoryFaultStatus> {
    try {
      const res = await fetch("/api/inventory/fault/status", {
        signal: AbortSignal.timeout(1500),
      }).catch(() =>
        fetch(`${DIRECT_INVENTORY_URL}/api/fault/status`, {
          signal: AbortSignal.timeout(1500),
        })
      );
      if (res && res.ok) {
        const data = await res.json();
        return {
          simulateServiceUnavailable: Boolean(data.simulateServiceUnavailable),
          errorCode: data.errorCode || 503,
        };
      }
    } catch {}
    return { simulateServiceUnavailable: false, errorCode: 503 };
  },

  async toggleInventoryFault(enable: boolean): Promise<any> {
    const endpoint = enable ? "enable" : "disable";
    try {
      const res = await fetch(`/api/inventory/fault/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "serviceUnavailable" }),
      }).catch(() =>
        fetch(`${DIRECT_INVENTORY_URL}/api/fault/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "serviceUnavailable" }),
        })
      );
      if (res && res.ok) {
        return await res.json();
      }
    } catch {}
    return { success: true, simulateServiceUnavailable: enable };
  },
};

// Helper: Generate realistic distributed traces across the e-commerce mesh
function generateSinglePaymentTrace(activeFaults: Record<string, any>): Trace {
  const traceId = Math.random().toString(16).substring(2, 18) + Math.random().toString(16).substring(2, 18);
  const rootSpanId = "span-order-root-" + Math.random().toString(16).substring(2, 8);
  const hasInventoryError = Boolean(activeFaults["inventory-error"]);
  const hasPaymentError = Boolean(activeFaults["payment-error"]);
  const hasPaymentDelay = Boolean(activeFaults["payment-delay"]);
  const hasOrderDbError = Boolean(activeFaults["order-db"]);

  const spans: Span[] = [];

  if (hasInventoryError) {
    // Inventory failure aborts checkout immediately at stock check
    spans.push(
      {
        traceId,
        spanId: rootSpanId,
        operationName: "POST /api/checkout",
        serviceName: "order-service",
        startTime: 0,
        duration: 38,
        statusCode: 503,
        hasError: true,
        tags: {
          "http.method": "POST",
          "http.target": "/api/checkout",
          "http.status_code": 503,
          "service.name": "order-service",
          error: true,
          "inventory.error": "SERVICE_UNAVAILABLE",
        },
      },
      {
        traceId,
        spanId: "span-inv-" + Math.random().toString(16).substring(2, 8),
        parentSpanId: rootSpanId,
        operationName: "POST /api/inventory/verify",
        serviceName: "inventory-service",
        startTime: 5,
        duration: 32,
        statusCode: 503,
        hasError: true,
        tags: {
          "http.method": "POST",
          "http.target": "/api/inventory/verify",
          "http.status_code": 503,
          "service.name": "inventory-service",
          "inventory.error": "SERVICE_UNAVAILABLE",
          "inventory.stock_verified": false,
          error: true,
        },
      }
    );

    return {
      traceId,
      rootService: "order-service",
      rootOperation: "POST /api/checkout",
      startTime: new Date().toLocaleTimeString(),
      totalDurationMs: 38,
      spanCount: spans.length,
      hasError: true,
      spans,
    };
  }

  // Normal flow or downstream failure
  const payDuration = hasPaymentDelay ? 5100 + Math.random() * 400 : 90 + Math.random() * 30;
  const totalDuration = hasOrderDbError ? 45 : Number((45 + payDuration + 35).toFixed(1));

  spans.push({
    traceId,
    spanId: rootSpanId,
    operationName: "POST /api/checkout",
    serviceName: "order-service",
    startTime: 0,
    duration: totalDuration,
    statusCode: hasOrderDbError ? 500 : hasPaymentError ? 503 : 200,
    hasError: hasOrderDbError || hasPaymentError,
    tags: {
      "http.method": "POST",
      "http.target": "/api/checkout",
      "http.status_code": hasOrderDbError ? 500 : hasPaymentError ? 503 : 200,
      "service.name": "order-service",
      error: hasOrderDbError || hasPaymentError ? true : undefined,
    },
  });

  if (!hasOrderDbError) {
    // 1. Inventory stock check succeeded
    spans.push({
      traceId,
      spanId: "span-inv-" + Math.random().toString(16).substring(2, 8),
      parentSpanId: rootSpanId,
      operationName: "POST /api/inventory/verify",
      serviceName: "inventory-service",
      startTime: 10,
      duration: 35,
      statusCode: 200,
      hasError: false,
      tags: {
        "http.method": "POST",
        "http.target": "/api/inventory/verify",
        "http.status_code": 200,
        "inventory.verified": true,
        "service.name": "inventory-service",
      },
    });

    // 2. Payment Service invocation
    spans.push({
      traceId,
      spanId: "span-pay-" + Math.random().toString(16).substring(2, 8),
      parentSpanId: rootSpanId,
      operationName: "POST /api/pay",
      serviceName: "payment-service",
      startTime: 48,
      duration: Number(payDuration.toFixed(1)),
      statusCode: hasPaymentError ? 503 : 200,
      hasError: hasPaymentError,
      tags: {
        "http.method": "POST",
        "http.target": "/api/pay",
        "http.status_code": hasPaymentError ? 503 : 200,
        "payment.amount": 49.99,
        "service.name": "payment-service",
        error: hasPaymentError ? true : undefined,
      },
    });

    // 3. Notification Service invocation (only if payment succeeded)
    if (!hasPaymentError) {
      spans.push({
        traceId,
        spanId: "span-notif-" + Math.random().toString(16).substring(2, 8),
        parentSpanId: rootSpanId,
        operationName: "POST /api/notify",
        serviceName: "notification-service",
        startTime: 48 + Number(payDuration.toFixed(1)) + 5,
        duration: 30,
        statusCode: 200,
        hasError: false,
        tags: {
          "http.method": "POST",
          "http.target": "/api/notify",
          "http.status_code": 200,
          "notification.channel": "EMAIL",
          "service.name": "notification-service",
        },
      });
    }
  }

  return {
    traceId,
    rootService: "order-service",
    rootOperation: "POST /api/checkout",
    startTime: new Date().toLocaleTimeString(),
    totalDurationMs: totalDuration,
    spanCount: spans.length,
    hasError: hasOrderDbError || hasPaymentError,
    spans,
  };
}

function generatePaymentTraces(activeFaults: Record<string, any>): Trace[] {
  const traces: Trace[] = [];
  for (let i = 0; i < 8; i++) {
    traces.push(generateSinglePaymentTrace(activeFaults));
  }
  return traces;
}

function generateMeshLogs(activeFaults: Record<string, any> = {}): LogEntry[] {
  const now = new Date();
  const list: LogEntry[] = [];

  if (activeFaults["inventory-error"]) {
    list.push({
      timestamp: now.toLocaleTimeString(),
      service: "inventory-service",
      level: "error",
      message: "ERROR Inventory service unavailable",
    });
    list.push({
      timestamp: new Date(now.getTime() - 500).toLocaleTimeString(),
      service: "order-service",
      level: "error",
      message: "Stock verification failed with status 503 for order ORD-B481",
    });
  } else {
    list.push({
      timestamp: now.toLocaleTimeString(),
      service: "inventory-service",
      level: "info",
      message: "Stock verification successful for order ORD-1094 (PROD-101, qty: 1)",
    });
  }

  list.push(
    {
      timestamp: new Date(now.getTime() - 2000).toLocaleTimeString(),
      service: "inventory-service",
      level: "info",
      message: "Inventory Service active on port 8004 with Prometheus metrics on /metrics",
    },
    {
      timestamp: new Date(now.getTime() - 3500).toLocaleTimeString(),
      service: "order-service",
      level: "info",
      message: "Order Service transaction coordinator listening on port 3002",
    },
    {
      timestamp: new Date(now.getTime() - 5000).toLocaleTimeString(),
      service: "payment-service",
      level: "info",
      message: "Processing payment for Order ORD-1094 (₹49.99) - Txn: TXN-B82C",
    },
    {
      timestamp: new Date(now.getTime() - 8000).toLocaleTimeString(),
      service: "payment-service",
      level: "info",
      message: "Payment processed successfully for Txn: TXN-B82C (200 OK)",
    }
  );

  return list;
}
