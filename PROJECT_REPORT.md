# MicroWatch: System Architecture, Observability Engine & Mentor Guide

---

## Executive Summary
**MicroWatch** is an enterprise-grade cloud-native observability platform engineered for distributed microservice architectures. Built on OpenTelemetry (OTel), Prometheus, Jaeger, and Grafana Loki, MicroWatch provides end-to-end visibility into distributed request transactions, real-time Google SRE Service Level Objectives (SLO) error budget burn tracking, microservice dependency topologies, and proactive chaos engineering fault injection.

---

## Part 1: How the Project Works (End-to-End Workflow)

```
                       [ Incoming Traffic / Load Test ]
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   API Gateway (:8000)     │
                        │  (HTTP Ingress & Router)  │
                        └─────────────┬─────────────┘
                                      │  W3C Traceparent Header
                                      ▼
                        ┌───────────────────────────┐
                        │   Order Service (:8001)   │
                        │ (Transaction Coordinator) │
                        └──────┬─────────────┬──────┘
                               │             │
              W3C Traceparent  │             │  W3C Traceparent
                               ▼             ▼
       ┌───────────────────────────┐   ┌───────────────────────────┐
       │  Payment Service (:8002)  │   │Notification Service(:8003)│
       │   (Settlement Gateway)    │   │  (Async Queue Dispatch)   │
       └───────────────────────────┘   └───────────────────────────┘
```

### 1. User Request & Ingress Ingestion
- Inbound HTTP checkout traffic (e.g. `POST /api/checkout`) originates from external clients, browser checkout flows, or automated traffic simulators (k6, dashboard traffic generator).
- Traffic enters through the **API Gateway** (listening on `:8080`, mapped externally to `:8000`).
- The API Gateway initiates the root OpenTelemetry span, assigns a unique 128-bit `trace_id`, and manages reverse proxy routing.

### 2. Distributed Cascading Execution Flow
1. **Gateway to Order Service (`:8001` / `:3002`):**
   - The Gateway forwards the request to `POST /api/orders/checkout`.
   - Injects the W3C standard HTTP header: `traceparent: 00-<trace_id>-<span_id>-01`.
2. **Order Service to Payment Service (`:8002` / `:3000`):**
   - The Order Service orchestrates the transaction by issuing `POST /api/pay` to charge customer accounts and authorize settlements.
   - If payment authorization fails (e.g. simulated 503 error or timeout), the transaction aborts and returns an error response immediately.
3. **Order Service to Notification Service (`:8003` / `:3003`):**
   - Upon successful payment authorization, the Order Service issues `POST /api/notify` to buffer or dispatch order confirmation emails via async queue.
4. **Response Aggregation:**
   - The Order Service compiles the confirmation receipt `ORD-XXXX` and returns HTTP 200/201 back through the API Gateway to the user.

### 3. The Telemetry Pipeline (The Three Pillars)

| Pillar | Technology | Endpoint & Scrape | Functionality |
| :--- | :--- | :--- | :--- |
| **Distributed Traces** | OpenTelemetry + Jaeger | Port `:16686` (`/api/traces`) | End-to-end parent-child span waterfall with microsecond timings. Propagates W3C Trace Context (`traceparent`) across HTTP boundaries. |
| **Metrics** | Prometheus | Port `:9090` (`/api/v1/query_range`) | Time-series histograms and counters scraped every 5 seconds across all service exporter endpoints. |
| **Structured Logs** | Grafana Loki + Winston | Port `:3100` (`/loki/api/v1/query_range`) | Structured JSON logs emitted with matching `trace_id` for instant cross-correlation between metrics and traces. |

---

## Part 2: What is Calculated & Monitored

### 1. RED Metrics (Rate, Errors, Duration)
The dashboard continuously tracks RED telemetry according to Google SRE principles:

- **Rate (Throughput):**
  $$\text{Throughput} = \sum \text{rate}(\text{http\_requests\_total}[1m])$$
  Measures total requests processed per second across the entire microservice mesh.

- **Errors (Failure Percentage):**
  $$\text{Error Rate (\%)} = \frac{\sum \text{rate}(\text{http\_requests\_total}\{\text{status}=\sim"5.." \}[1m])}{\sum \text{rate}(\text{http\_requests\_total}[1m])} \times 100$$
  Tracks the percentage of requests resulting in HTTP 5xx failures. Breaches above $5\%$ trigger critical alerts.

- **Duration (p95 Latency):**
  $$\text{p95 Latency} = \text{histogram\_quantile}\left(0.95, \sum \text{rate}(\text{http\_request\_duration\_seconds\_bucket}[1m]) \text{ by } (le)\right)$$
  Calculates the 95th percentile response duration in milliseconds to detect tail latency bottlenecks.

---

### 2. Service Level Objectives (SLO) & Error Budget Burn Rate

#### A. Availability Objective ($99.5\%$ Target)
- **Target:** $99.5\%$ successful requests over a rolling 30-day window.
- **Allowed Budget:** $0.5\%$ error margin.
- **Error Budget Remaining Calculation:**
  $$\text{Remaining Budget (\%)} = \max\left(0, 100 - (\text{Error Rate} \times 5)\right)$$

#### B. Latency Objective ($p95 < 500\text{ms}$ Target)
- **Target:** $95\%$ of all requests complete in $< 500\text{ms}$ over a 1-hour window.
- **Latency Budget Calculation:**
  $$\text{Latency Budget Remaining (\%)} = \max\left(0, 100 - \frac{\max(0, p95 - 500)}{20}\right)$$

#### C. Multi-Window Multi-Burn Rate Theory

| Burn Rate | Meaning | Status / Indicator | Time to Total Budget Exhaustion |
| :--- | :--- | :--- | :--- |
| **$\le 1.0\times$** | Nominal budget consumption | Healthy (Emerald `#10b981`) | $> 25\text{ days}$ |
| **$2.0\times - 9.9\times$** | Elevated error budget drain | Warning (Amber `#f59e0b`) | $\sim 3.2\text{ days}$ |
| **$\ge 10.0\times$ (e.g. $14.4\times$)** | Rapid burn ($2\%$ budget consumed in $1\text{ hour}$) | Critical P1 (Crimson `#ef4444`) | $\sim 1.4\text{ hours}$ |

---

## Part 3: What is Inside the React Dashboard

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP NAVBAR: Environment Pill | Context Service | Real-time Sync | Search | Theme Toggle │
├───────────┬────────────────────────────────────────────────────────────────────────────┤
│ SLIM DOCK │ TOP ROW KPI CARDS: Throughput (req/s) | p95 Latency | Error Rate | Alerts  │
│           ├─────────────────────────────────────────┬──────────────────────────────────┤
│ Dashboard │ PRIMARY LEFT COLUMN:                    │ SECONDARY RIGHT COLUMN:          │
│ Topology  │ 1. Microservice Topology Graph          │ 1. SLO Radial Progress Rings     │
│ Traces    │    (Gateway -> Order -> Payment/Notif)  │ 2. Prometheus Incident Feed      │
│ SLOs      │ 2. Distributed Trace Waterfall          │ 3. Fault Injection Controls      │
│ Alerts    │    (Span offsets, durations, OTel tags) │    (Payment, Order, Notif delays)│
│ Chaos     ├─────────────────────────────────────────┴──────────────────────────────────┤
│ Logs      │ FOOTER: Telemetry Stack Status & Active Ports (:8000, :8001, :8002, :8003) │
└───────────┴────────────────────────────────────────────────────────────────────────────┘
```

1. **Light / Dark Mode Theme Engine:**
   - Supported via Tailwind `darkMode: 'class'` and persisted in `localStorage`.
   - Instant `<Sun />` / `<Moon />` toggle in top navbar.
   - Light canvas (`#f8fafc`), containers (`#ffffff`), borders (`border-slate-200/80`).
   - Dark canvas (`#0b0f19`), containers (`#1e293b`), borders (`border-slate-800`), text (`#f1f5f9`).

2. **Slim Icon Dock (Left Sidebar):**
   - Clean vertical dock featuring crisp icons:
     - Dashboard (`<Activity />`)
     - Topology Mesh (`<Layers />`)
     - Distributed Traces (`<ListTree />`)
     - SLOs & Budgets (`<ShieldCheck />`)
     - Prometheus Alerts (`<ShieldAlert />`) with live firing alert badge
     - Chaos Lab (`<ZapOff />`) with active fault badge
     - Loki Logs (`<FileText />`)

3. **Top Navigation Bar:**
   - Environment selector pill: `Prod (us-east-1)`, `Staging`, `Local Mesh`.
   - Contextual Service Selector: `All Services`, `api-gateway`, `order-service`, `payment-service`, `notification-service`.
   - Real-time Sync Status Pill: Live scraper frequency selector (`1s`, `2s`, `5s`).
   - Search input with keyboard shortcut hint (`⌘K`).
   - Quick action buttons: `Simulate Traffic (20x)` and `Reset Faults`.
   - Notification Bell with popover preview for active Prometheus alerts.

4. **RED Metrics Top Bar:**
   - 4 high-contrast KPI cards:
     1. **Throughput (req/s):** With $+12.4\%$ trend pill and 2xx/5xx status breakdown.
     2. **p95 Latency (ms):** With target benchmark pill ($< 500\text{ms}$) and p50 comparison.
     3. **Error Rate (%):** With HTTP 5xx breach warnings.
     4. **Active Incidents:** Live firing count with status pills.

5. **Two-Column Main Workspace:**
   - **Left Column (Primary):**
     - **Microservice Topology Graph:** Live interactive dependency map with animated SVG flow dashes, port mappings, and status badges (Healthy, Delay, Error).
     - **Distributed Trace Waterfall:** Interactive waterfall Gantt chart showing span duration offsets, HTTP status badges, and expandable OpenTelemetry attribute inspector.
   - **Right Column (Secondary):**
     - **SLO Circular Progress Rings:** Minimalist SVG donut gauges displaying remaining error budgets and burn rate multipliers.
     - **Incident Feed:** Real-time stream of FIRING and RESOLVED alert events with root-cause diagnostics and actionable SRE remediation.
     - **Chaos / Fault Injection Panel:** Direct iOS-style toggle switches and sliders to inject latency delay or 503 crashes on `payment-service:8002`, `order-service:8001`, or `notification-service:8003`.

---

## Part 4: Mentor Presentation Script (3-Minute Walkthrough)

### Step 1: Establish the Healthy Baseline (0:00 - 1:00)
- **What to say:**
  > *"Good morning. Today I am demonstrating MicroWatch, our observability platform for microservice architectures. Here on the screen is our live SaaS dashboard running in Light/Dark mode. Notice the top RED metrics row: our throughput is currently at 5.2 requests per second, error rate is at 0.0%, and p95 latency is at 240ms, well within our 500ms objective. On the left, our topology graph shows API Gateway, Order Service, Payment Service, and Notification Service all running with green operational indicators. On the right, our Google SRE error budget radial donuts show 99.4% budget remaining at a nominal 0.8x burn rate."*
- **What to do:**
  - Click the **Light/Dark Mode toggle** (`<Sun />` / `<Moon />`) to demonstrate theme transition.
  - Click **Simulate Traffic (20x)** to show live requests streaming through the mesh and updating charts.

### Step 2: Inject a Bottleneck via Chaos Engineering (1:00 - 2:00)
- **What to say:**
  > *"Now, let's simulate a real-world production incident. In our Chaos Lab panel on the right, I'm going to inject an artificial 5000ms latency delay into our Payment Service, which handles financial settlement."*
- **What to do:**
  - In the **Fault Injection** panel, flip the toggle for **Simulate Latency Delay** on Payment Service.
  - Set the slider to **5000ms**.
  - Click **Simulate Traffic (20x)**.
- **What to point out:**
  > *"Immediately, observe the ripple effect across the system. The p95 latency card spikes from 240ms to over 4800ms, shifting from green to amber. Our SLO Error Budget donut for latency enters elevated burn (12.0x burn rate), warning us that our budget will be exhausted in less than 45 minutes."*

### Step 3: Root-Cause Isolation in 15 Seconds (2:00 - 3:00)
- **What to say:**
  > *"In a distributed system with dozens of services, finding the root cause is often the hardest part. With MicroWatch, we isolate it in 15 seconds."*
- **What to point out:**
  1. **Topology Graph:**
     > *"Looking at our Topology Graph, the Payment Service node has turned amber with an elevated latency warning."*
  2. **Distributed Trace Waterfall:**
     > *"Looking at our Distributed Trace breakdown, we select the latest checkout trace. In the waterfall Gantt view, we clearly see the Gateway took 5015ms total, Order Service took 5000ms, and the Payment Service span `POST /api/pay` is highlighted in amber taking exactly 4850ms. Order and Gateway were merely waiting on Payment."*
  3. **Prometheus Alert & Remediation:**
     > *"In our Incident Feed, the Prometheus `HighLatency` alert is FIRING. Expanding the card provides immediate root-cause diagnostics and recommended SRE remediation: check downstream payment gateway connection pools or reset the fault."*
- **Conclusion:**
  - Click **Reset Faults** in the top navbar.
  - Show the toast notification, metrics returning to nominal 220ms, and all indicators turning green.
  - Conclude: *"This demonstrates how MicroWatch unifies metrics, traces, logs, and error budgets into a single actionable pane of glass."*
