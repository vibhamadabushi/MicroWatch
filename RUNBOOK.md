# MicroWatch Observability Platform — Runbook & Verification Guide

This runbook guides you through starting, operating, testing, and conducting incident drills with the **MicroWatch** microservices observability platform.

---

## 🏗️ Architecture Summary

```
                       ┌─────────────────────────┐
                       │  React Observability UI │ (Port 5173)
                       │       (Dashboard)       │
                       └───────────┬─────────────┘
                                   │
                                   ▼
                       ┌─────────────────────────┐
                       │       API Gateway       │ (Port 8080, Metrics: 9466)
                       └───────────┬─────────────┘
                                   │
                                   ▼
                       ┌─────────────────────────┐
                       │      Order Service      │ (Port 3002, Metrics: 9465)
                       └──────┬────────────┬─────┘
                              │            │
             ┌────────────────┘            └────────────────┐
             ▼                                              ▼
┌─────────────────────────┐                    ┌─────────────────────────┐
│     Payment Service     │ (Port 3000)        │   Notification Service  │ (Port 3003)
│     (Metrics: 9464)     │                    │     (Metrics: 9467)     │
└────────────┬────────────┘                    └────────────┬────────────┘
             │                                              │
             └──────────────────────┬───────────────────────┘
                                    │
                                    ▼
       ┌────────────────────────────────────────────────────────┐
       │               Telemetry Infrastructure                 │
       │  • Prometheus (9090)  • Jaeger (16686)  • Loki (3100)  │
       └────────────────────────────────────────────────────────┘
```

---

## 🚀 Quickstart: Running MicroWatch

### Option A: Turnkey with Docker Compose (Recommended)

Make sure Docker Desktop is started, then execute in the root directory:

```bash
docker compose up --build
```

All 8 containers will build and start:
- **Observability Dashboard:** [http://localhost:5173](http://localhost:5173)
- **API Gateway:** [http://localhost:8080](http://localhost:8080)
- **Order Service:** [http://localhost:3002](http://localhost:3002)
- **Payment Service:** [http://localhost:3000](http://localhost:3000)
- **Notification Service:** [http://localhost:3003](http://localhost:3003)
- **Jaeger UI:** [http://localhost:16686](http://localhost:16686)
- **Prometheus UI:** [http://localhost:9090](http://localhost:9090)
- **Loki Logs:** [http://localhost:3100](http://localhost:3100)

---

### Option B: Local Mode (Node.js Direct)

If running Docker is optional or you want to debug Node services locally:

1. **Start Telemetry Containers (Jaeger, Prometheus, Loki):**
   ```bash
   # Jaeger
   docker run -d --name jaeger -p 16686:16686 -p 4317:4317 -p 4318:4318 jaegertracing/all-in-one:latest

   # Prometheus
   docker run -d --name prometheus -p 9090:9090 -v %cd%/Prometheus/prometheus.yml:/etc/prometheus/prometheus.yml -v %cd%/Prometheus/alert_rules.yml:/etc/prometheus/alert_rules.yml prom/prometheus:latest

   # Loki
   docker run -d --name loki -p 3100:3100 -v %cd%/loki-config.yaml:/etc/loki/local-config.yaml grafana/loki:latest -config.file=/etc/loki/local-config.yaml
   ```

2. **Start the Microservices in Separate Terminals:**
   ```bash
   # Terminal 1: Payment Service
   cd payment-service
   node index.js

   # Terminal 2: Notification Service
   cd notification-service
   node index.js

   # Terminal 3: Order Service
   cd order-service
   node index.js

   # Terminal 4: API Gateway
   cd api-gateway
   node index.js

   # Terminal 5: Dashboard
   cd dashboard
   npm run dev
   ```

*(Alternatively, use `npm run dev:all` or the included `start-services.bat` helper)*.

---

## 🧪 Verification & Incident Drill Procedures

### Drill 1: Baseline Steady-State Traffic

1. Open the **MicroWatch Dashboard** at [http://localhost:5173](http://localhost:5173).
2. Confirm the **Topology Graph** displays all 4 services in green (`UP`).
3. Click the **"⚡ Trigger 20 Requests"** button in the dashboard top navigation bar, or run in terminal:
   ```bash
   node load-test.js --rps 5 --duration 20
   ```
4. **Expected Results:**
   - **RED Metrics Hub:** Throughput ramps up to ~5 req/s. Error rate stays at 0.0%. p95 latency stays under 250ms.
   - **SLO Monitor:** Availability Error Budget remains at 100%. Burn rate is normal (< 1x).
   - **Distributed Trace Viewer:** Expanding any recent trace shows 4 distinct spans:
     1. `api-gateway` (`POST /api/checkout`)
     2. `order-service` (`POST /api/checkout`)
     3. `payment-service` (`POST /api/pay`)
     4. `notification-service` (`POST /api/notify`)
   - **Incident Timeline:** Clean — no firing alerts.

---

### Drill 2: Payment Service Delay (Latency Spike & SLO Burn)

1. **Inject Fault:**
   - Option A: In the **Dashboard Fault Panel**, toggle **"Simulate Delay"** under **Payment Service** and set the slider to `4500ms`.
   - Option B: Run via CLI:
     ```bash
     node load-test.js --drill payment-delay --rps 4 --duration 30
     ```
2. **Observe System Response in Real-Time:**
   - **RED Metrics:** Latency immediately spikes to > 4,500ms.
   - **Topology Graph:** `payment-service` badge changes to `DEGRADED (4.5s delay)`. Flow animation slows down.
   - **Trace Waterfall:** Click any new trace in the Trace Viewer. The `payment-service` span expands to take 4.5 seconds, while `api-gateway` and `order-service` wait on it.
   - **SLO Monitor:** Latency SLO error budget burns rapidly (burn rate > 10x).
   - **Prometheus Alert:** Within 15 seconds, the `HighLatency` alert switches from `PENDING` to `FIRING`.
   - **Incident Timeline:** Logs `[CRITICAL/WARNING] High latency in payment service (p95 > 500ms)`.
3. **Recovery:**
   - Click **"Reset All Faults"** in the top navigation bar.
   - The system returns to nominal sub-200ms latency and alerts resolve.

---

### Drill 3: Payment Service Error Injection (503 Gateway Unavailable)

1. **Inject Fault:**
   - Toggle **"Simulate 503 Errors"** under **Payment Service** in the dashboard.
   - Or run:
     ```bash
     node load-test.js --drill payment-error --rps 5 --duration 25
     ```
2. **Observe System Response:**
   - **RED Metrics:** Error rate jumps to 100%. 5xx status codes surge.
   - **Topology Graph:** `payment-service` shows red `CRITICAL ERROR (HTTP 503)`.
   - **Trace Waterfall:** Spans turn red with `error: true` and `http.status_code: 503`. Notice that `notification-service` is skipped because payment failed!
   - **SLO Monitor:** Availability Error budget drops precipitously towards 0% exhaustion.
   - **Prometheus Alert:** `HighErrorRate` rule fires on `payment-service`.
   - **Incident Timeline:** Logs incident with root-cause tag: `payment-service`.
3. **Recovery:**
   - Click **"Reset All Faults"**. Error rate immediately drops to 0%.

---

### Drill 4: Order Service Database Timeout

1. **Inject Fault:**
   - Under **Order Service**, toggle **"Simulate Database Failure"**.
   - Or run:
     ```bash
     node load-test.js --drill order-db --rps 5 --duration 20
     ```
2. **Observe System Response:**
   - Order service immediately throws 500 `DatabaseConnectionTimeout`.
   - Notice in Jaeger traces: Neither `payment-service` nor `notification-service` are called — the transaction fails at the persistence tier!
   - Incident timeline pinpoints root cause to `order-service` database replica timeout.

---

### Drill 5: Notification Service Queue Backlog

1. **Inject Fault:**
   - Under **Notification Service**, toggle **"Simulate Queue Backlog (2500ms)"**.
2. **Observe System Response:**
   - Overall checkout end-to-end latency increases by 2.5s.
   - Trace viewer clearly shows that payment was completed fast (200ms), but the final stage `notification-service` took 2,500ms in queue processing.

---

## 📊 Endpoints & Ports Reference

| Component | Port | Metrics Port | Key Endpoints |
|---|---|---|---|
| **API Gateway** | 8080 | 9466 | `POST /api/checkout`, `GET /health`, `POST /api/fault-inject`, `GET /api/services/status` |
| **Order Service** | 3002 | 9465 | `POST /api/checkout`, `GET /api/orders`, `GET /health`, `POST /api/fault-inject` |
| **Payment Service** | 3000 | 9464 | `POST /api/pay`, `GET /health`, `POST /api/fault-inject` |
| **Notification Service** | 3003 | 9467 | `POST /api/notify`, `GET /health`, `POST /api/fault-inject` |
| **Dashboard** | 5173 | N/A | Interactive Observability UI |
| **Prometheus** | 9090 | N/A | `/api/v1/query`, `/api/v1/query_range`, `/api/v1/alerts` |
| **Jaeger** | 16686 / 4318 | N/A | Tracing UI `/` and OTLP collector `/v1/traces` |
| **Loki** | 3100 | N/A | Structured log queries `/loki/api/v1/query_range` |
