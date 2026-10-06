const { NodeSDK } = require("@opentelemetry/sdk-node");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const {
  getNodeAutoInstrumentations,
} = require("@opentelemetry/auto-instrumentations-node");
const {
  OTLPTraceExporter,
} = require("@opentelemetry/exporter-trace-otlp-http");
const { resourceFromAttributes } = require("@opentelemetry/resources");

const exporter = new PrometheusExporter({
  preventServerStart: true,
});

let otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";
if (!otlpEndpoint.endsWith("/v1/traces")) {
  otlpEndpoint = `${otlpEndpoint.replace(/\/+$/, "")}/v1/traces`;
}

const sdk = new NodeSDK({
  resource: resourceFromAttributes({ "service.name": "order-service" }),
  traceExporter: new OTLPTraceExporter({
    url: otlpEndpoint,
  }),
  metricReader: exporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

console.log("✅ [order-service] OpenTelemetry started");
console.log(`📡 [order-service] OTLP Traces directed to: ${otlpEndpoint}`);

module.exports = { sdk, exporter };

