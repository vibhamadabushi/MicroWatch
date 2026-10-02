const { NodeSDK } = require("@opentelemetry/sdk-node");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { resourceFromAttributes } = require("@opentelemetry/resources");

const prometheusPort = parseInt(process.env.PROMETHEUS_PORT || "9466", 10);
const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces";

const exporter = new PrometheusExporter({
  port: prometheusPort,
  host: "0.0.0.0",
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ "service.name": "api-gateway" }),
  traceExporter: new OTLPTraceExporter({
    url: otlpEndpoint,
  }),
  metricReader: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log("✅ [api-gateway] OpenTelemetry started");
console.log(`📊 [api-gateway] Metrics available at http://0.0.0.0:${prometheusPort}/metrics`);
console.log(`📡 [api-gateway] Traces exporting to ${otlpEndpoint}`);
