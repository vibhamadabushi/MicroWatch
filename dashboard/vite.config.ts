import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api/gateway": {
        target: "http://localhost:8088",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gateway/, ""),
      },
      "/api/prometheus": {
        target: "http://localhost:9090",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/prometheus/, ""),
      },
      "/api/jaeger": {
        target: "http://localhost:16686",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jaeger/, ""),
      },
      "/api/loki": {
        target: "http://localhost:3100",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/loki/, ""),
      },
    },
  },
  preview: {
    port: 5173,
    host: "0.0.0.0",
  },
});
