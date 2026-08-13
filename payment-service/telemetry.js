const { NodeSDK } = require("@opentelemetry/sdk-node");
const { PrometheusExporter } = require("@opentelemetry/exporter-prometheus");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");

const exporter = new PrometheusExporter({
  port: 9464,
  host: '0.0.0.0',
});

const sdk = new NodeSDK({
  metricReader: exporter,
  instrumentations: [
    getNodeAutoInstrumentations(),
  ],
});

sdk.start();

console.log("✅ OpenTelemetry started");
console.log("📊 Metrics available at http://localhost:9464/metrics");