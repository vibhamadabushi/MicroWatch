const { NodeSDK } = require("@opentelemetry/sdk-node");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { resourceFromAttributes } = require("@opentelemetry/resources");

// Create Prometheus Exporter with preventServerStart: true so metrics can be served directly via Express on port 8002
const exporter = new PrometheusExporter({
  preventServerStart: true,
});

let otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
if (!otlpEndpoint.endsWith("/v1/traces")) {
  otlpEndpoint = `${otlpEndpoint.replace(/\/+$/, "")}/v1/traces`;
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ "service.name": "payment-service" }),
  traceExporter: new OTLPTraceExporter({
    url: otlpEndpoint,
  }),
  metricReader: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log("✅ OpenTelemetry initialized for payment-service");
console.log(`📡 OTLP Traces directed to: ${otlpEndpoint}`);

module.exports = { sdk, exporter };
