import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const paymentServiceUrl = process.env.VITE_PAYMENT_SERVICE_URL || "http://payment-service:8002";

const proxyConfig = {
  "/api/payment": {
    target: paymentServiceUrl,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/payment/, ""),
  },
  "/api/pay": {
    target: paymentServiceUrl,
    changeOrigin: true,
  },
  "/api/fault": {
    target: paymentServiceUrl,
    changeOrigin: true,
  },
  "/api/fault-inject": {
    target: paymentServiceUrl,
    changeOrigin: true,
  },
  "/api/prometheus": {
    target: process.env.VITE_PROMETHEUS_URL || "http://prometheus:9090",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/prometheus/, ""),
  },
  "/api/jaeger": {
    target: process.env.VITE_JAEGER_URL || "http://jaeger:16686",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/jaeger/, ""),
  },
  "/api/loki": {
    target: process.env.VITE_LOKI_URL || "http://loki:3100",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/loki/, ""),
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: proxyConfig,
  },
  preview: {
    port: 3000,
    host: "0.0.0.0",
    proxy: proxyConfig,
  },
});
