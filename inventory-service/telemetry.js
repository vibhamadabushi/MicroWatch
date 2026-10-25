const { NodeSDK } = require("@opentelemetry/sdk-node");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { resourceFromAttributes } = require("@opentelemetry/resources");
const { metrics } = require("@opentelemetry/api");

// Create Prometheus Exporter with preventServerStart: true so metrics can be served directly via Express on port 8004
const exporter = new PrometheusExporter({
  preventServerStart: true,
});

let otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
if (!otlpEndpoint.endsWith("/v1/traces")) {
  otlpEndpoint = `${otlpEndpoint.replace(/\/+$/, "")}/v1/traces`;
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ "service.name": "inventory-service" }),
  traceExporter: new OTLPTraceExporter({
    url: otlpEndpoint,
  }),
  metricReader: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log("✅ [inventory-service] OpenTelemetry started");
console.log(`📡 [inventory-service] OTLP Traces directed to: ${otlpEndpoint}`);

// Application-level metrics exposed via Prometheus
const meter = metrics.getMeter("inventory-service");
const totalRequestsCounter = meter.createCounter("inventory_requests_total", {
  description: "Total number of stock verification requests processed",
});
const failedRequestsCounter = meter.createCounter("inventory_requests_failed_total", {
  description: "Total number of failed stock verification requests",
});
const stockCheckDuration = meter.createHistogram("inventory_request_duration_seconds", {
  description: "Latency duration of inventory stock verification requests in seconds",
});
const stockRejectionsCounter = meter.createCounter("inventory_stock_rejections_total", {
  description: "Total number of stock rejection events due to insufficient inventory",
});
const stockAdjustmentsCounter = meter.createCounter("inventory_stock_adjustments_total", {
  description: "Total number of manual inventory stock adjustments",
});

module.exports = {
  sdk,
  exporter,
  totalRequestsCounter,
  failedRequestsCounter,
  stockCheckDuration,
  stockRejectionsCounter,
  stockAdjustmentsCounter,
};
