# MicroWatch Observability Platform — Presentation Guide & Execution Runbook

This guide provides the complete architectural blueprint, technical justification, clean Docker execution runbook, and a scripted 2-minute live demo of the **MicroWatch** observability platform for college project mentors and technical jury evaluations.

---

## 🏛️ Deliverable 1: Visual System Architecture Diagram

```
              +----------------------------------------------+
              |           Client / Synthetic Traffic         |
              |          (Browser / Dashboard / cURL)        |
              +-----------------------+----------------------+
                                      |
                                      | HTTP Requests (:8002/api/pay)
                                      v
              +----------------------------------------------+
              |               PAYMENT-SERVICE                |
              |   - Express.js HTTP Server                   |
              |   - OpenTelemetry Auto/Manual SDK            |
              |   - Loki Structured JSON Logger              |
              |   - Fault Injection Controller               |
              +-------+---------------+--------------+-------+
                      |               |              |
       Prometheus Scrapes             |              | Spans (OTLP)
       (:8002/metrics) |               |              | (:4318)
                      v               v              v
              +---------------+ +------------+ +-------------+
              |  PROMETHEUS   | |    LOKI    | |   JAEGER    |
              |  (Metrics TSDB| |(Log Engine)| |(Distributed |
              |   Port: 9090) | |Port: 3100) | |Trace Store) |
              |               | |            | | Port: 16686 |
              +-------+-------+ +-----+------+ +------+------+
                      |               |               |
                      +---------------+---------------+
                                      |
                                      | REST / PromQL / Trace APIs
                                      v
              +----------------------------------------------+
              |           MICROWATCH REACT DASHBOARD         |
              |  - Clean SaaS Light / Dark Theme             |
              |  - RED Metrics (Throughput, Latency, Errors) |
              |  - SLO & Error Budget Gauges                 |
              |  - Jaeger Trace Waterfall & Fault Toggle     |
              |  Port: 3000                                  |
              +----------------------------------------------+
```

---

## 💡 Deliverable 2: Simplified Technical Breakdown

### 1. What Are We Doing?
We built **MicroWatch**, an end-to-end cloud-native observability sandbox. Rather than treating microservices as black boxes where failures only surface after user complaints or total downtime, MicroWatch continuously extracts the **"Three Pillars of Observability"** (metrics, logs, and distributed traces) from a running payment service. 

It calculates real-time reliability health (RED metrics and Google SRE SLO error budget burn) and renders it through a single-pane-of-glass dashboard equipped with live chaos fault injection.

### 2. What Technologies Did We Use & Why?

| Component | Tool Chosen | Why We Used It |
| :--- | :--- | :--- |
| **Monitored Service** | Node.js + Express (`payment-service`) | Lightweight, event-driven runtime ideal for showcasing API transactions, telemetry hooks, and fault injection. |
| **Telemetry Standard** | OpenTelemetry (OTel) SDK | Vendor-neutral industry standard for emitting metrics and traces without proprietary vendor lock-in. |
| **Metrics Engine** | Prometheus | Scrapes time-series data at high frequency and evaluates PromQL alert expressions efficiently. |
| **Tracing Engine** | Jaeger | Visualizes request execution lifecycles and isolates latency bottlenecks via waterfall charts. |
| **Log Management** | Grafana Loki | Efficient, label-indexed log aggregation correlated directly with request trace IDs. |
| **Unified Dashboard** | React + TypeScript + Tailwind CSS | Minimalist, high-performance UI featuring light/dark mode and instant visual alerts. |
| **Orchestration** | Docker Compose | One-command local containerization ensuring uniform execution across any machine. |

---

## ⚡ Deliverable 3: Clean Step-by-Step Runbook (Minimal Console Output)

To prevent multi-screen terminal flooding during evaluations, execute using Docker's quiet (`-q`) and detached (`-d`) flags:

```bash
# Step 1: Clean any stale or orphaned containers
docker compose down --remove-orphans

# Step 2: Build silently (suppresses verbose intermediate layers)
docker compose build -q

# Step 3: Launch entire stack in detached background mode
docker compose up -d

# Step 4: Verify running containers in one concise table
docker compose ps
```

### 🌐 Port Access Reference

| Service / Interface | URL | Description |
|---|---|---|
| **MicroWatch Dashboard** | [http://localhost:3000](http://localhost:3000) | Observability UI with Theme Switcher & SLO Monitors |
| **Payment Service API** | [http://localhost:8002](http://localhost:8002) | Health check (`/health`) and metrics (`/metrics`) |
| **Prometheus TSDB** | [http://localhost:9090](http://localhost:9090) | Time-series scraper and PromQL alerting engine |
| **Jaeger Trace Viewer** | [http://localhost:16686](http://localhost:16686) | Distributed tracing UI and waterfall visualizer |
| **Grafana Loki Logs** | [http://localhost:3100](http://localhost:3100) | Centralized structured log ingestion API |

---

## 🎤 Deliverable 4: Mentor Presentation & 2-Minute Live Demo Script

Use this exact, spoken script during evaluation:

### Part A: Introduction (30 seconds)
> *"Respected Mentor, modern distributed systems often fail silently because metrics, logs, and traces live in separate silos. When an issue occurs in production, developers typically waste hours cross-referencing disjointed tools.*
>
> *MicroWatch solves this by instrumenting a business-critical service with the OpenTelemetry standard and unifying its operational signals into a single real-time dashboard. Here is our live system running inside isolated Docker containers."*

---

### Part B: Normal Health & Metrics Baseline (30 seconds)
*(Open [http://localhost:3000](http://localhost:3000) in your browser)*

> *"As you can see on our dashboard:*
> 1. *We have an icon-first layout with an instant **Light / Dark Mode Switcher** in the top navigation.*
> 2. *Our **RED Metrics** show normal operational health: nominal throughput (~5 req/s), sub-100ms p95 latency, and 0.0% error rate.*
> 3. *Our **SLO Gauges** track a 99.0% Availability Objective and <500ms Latency Target, both running at 100% remaining Error Budget with a nominal burn rate.*
> 4. *In our **Trace Viewer**, request spans complete cleanly in under 50ms with valid W3C trace IDs."*

---

### Part C: Live Chaos & Root-Cause Isolation (60 seconds)
*(In the Dashboard Chaos Panel, toggle **Simulate Latency Delay (+5000ms)** or click **Inject Payment Fault**)*

> *"Now, let's inject a realistic production failure: an artificial 5-second latency delay in payment processing.*
>
> *(Point to the screen as the cards react)*
>
> 1. *Within seconds, Prometheus scrapes the increased response times from `payment-service:8002/metrics`.*
> 2. *The **p95 Latency** card turns amber/red as it spikes from 120ms to over 5,000ms.*
> 3. *The **SLO Latency Budget** gauge immediately detects an anomalous 14.4x burn rate, warning that our error budget will exhaust in under 1.5 hours.*
> 4. *Looking at our **Jaeger Trace Waterfall**, the `/api/pay` span is visually stretched across 5.1 seconds, pinpointing the exact delay inside `payment-service`.*
> 5. *Now, I click **Reset Faults**—and the error budget burn halts, returning the service to nominal health instantly."*

---

### Closing Verdict
> *"Without digging into server terminal logs or guessing which component failed, MicroWatch enabled us to detect the service degradation, pinpoint the culprit span, and flag an SLO breach in under 15 seconds. Thank you."*
