import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const paymentServiceUrl = process.env.VITE_PAYMENT_SERVICE_URL || "http://localhost:8002";
const orderServiceUrl = process.env.VITE_ORDER_SERVICE_URL || "http://localhost:3002";

const proxyConfig = {
  "/api/order/fault": {
    target: orderServiceUrl,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/order\/fault/, "/api/fault"),
  },
  "/api/order": {
    target: orderServiceUrl,
    changeOrigin: true,
  },
  "/api/orders": {
    target: orderServiceUrl,
    changeOrigin: true,
  },
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
    target: process.env.VITE_PROMETHEUS_URL || "http://localhost:9090",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/prometheus/, ""),
  },
  "/api/jaeger": {
    target: process.env.VITE_JAEGER_URL || "http://localhost:16686",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api\/jaeger/, ""),
  },
  "/api/loki": {
    target: process.env.VITE_LOKI_URL || "http://localhost:3100",
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
