# MicroWatch: System Architecture, Observability Engine & Dashboard Reference Guide

---

## Executive Overview
**MicroWatch** is an enterprise-grade microservice observability platform providing unified telemetry across distributed services. Built on OpenTelemetry, Prometheus, Jaeger, and Loki, it aggregates the Three Pillars of Observability (Metrics, Traces, and Logs) into a high-performance React/TypeScript dashboard featuring Google SRE-compliant Error Budget burn calculations and chaos engineering fault injection.

---

## Part 1: How the Project Works (End-to-End Workflow)

```
                       [ Incoming Traffic / Load Test ]
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   API Gateway (:8080)     │
                        │  (HTTP Ingress & Router)  │
                        └─────────────┬─────────────┘
                                      │  W3C Traceparent
                                      ▼
                        ┌───────────────────────────┐
                        │   Order Service (:3002)   │
                        │ (Transaction Coordinator) │
                        └──────┬─────────────┬──────┘
                               │             │
              W3C Traceparent  │             │  W3C Traceparent
                               ▼             ▼
       ┌───────────────────────────┐   ┌───────────────────────────┐
       │  Payment Service (:3000)  │   │Notification Service(:3003)│
       │   (Settlement Gateway)    │   │  (Async Queue Dispatch)   │
       └───────────────────────────┘   └───────────────────────────┘
```

### 1. User Request & Ingress Ingestion
- Clients (web frontend, k6 load scripts, or the dashboard's **Simulate Traffic** button) issue checkout transactions: `POST /api/checkout`.
- The request arrives at the **API Gateway** (port `:8080`, mapped externally as `:8000`).
- The API Gateway generates or extracts the OpenTelemetry root span context.

### 2. Distributed Cascading Flow
1. **API Gateway $\rightarrow$ Order Service (`:3002` / `:8001`):**
   - The Gateway forwards the payload to `POST /api/orders/checkout`.
   - Propagates the HTTP header: `traceparent: 00-<trace_id>-<span_id>-01`.
2. **Order Service $\rightarrow$ Payment Service (`:3000` / `:8002`):**
   - The Order Service calls `POST /api/pay` to authorize transactions.
   - If payment fails (e.g. injected 503 or timeout), the transaction aborts and returns an error immediately.
3. **Order Service $\rightarrow$ Notification Service (`:3003` / `:8003`):**
   - Upon successful payment authorization, the Order Service initiates `POST /api/notify` to queue confirmation emails.
4. **Response Aggregation:**
   - Order Service compiles the confirmation receipt `ORD-XXXX` and returns HTTP 200/201 back through the API Gateway.

### 3. The Telemetry Pipeline (The Three Pillars)

| Pillar | Technology | Implementation & Endpoint | Purpose |
| :--- | :--- | :--- | :--- |
| **Traces** | OpenTelemetry + Jaeger | Port `:16686` (`/api/traces`) | End-to-end distributed span waterfall with microsecond timings. |
| **Metrics** | Prometheus | Port `:9090` (`/api/v1/query_range`) | Time-series histograms and counters scraped every 5 seconds. |
| **Logs** | Loki + Winston | Port `:3100` (`/loki/api/v1/query_range`) | Structured JSON logs correlated with `trace_id`. |

---

## Part 2: What is Calculated & Monitored

### 1. RED Metrics (Rate, Errors, Duration)
The dashboard continuously tracks RED telemetry according to Google SRE best practices:

- **Rate (Throughput):**
  $$\text{Throughput} = \sum \text{rate}(\text{http\_requests\_total}[1m])$$
  Measures total HTTP requests processed per second across the entire microservice mesh.

- **Errors (Failure Percentage):**
  $$\text{Error Rate (\%)} = \frac{\sum \text{rate}(\text{http\_requests\_total}\{\text{status}=\sim"5.." \}[1m])}{\sum \text{rate}(\text{http\_requests\_total}[1m])} \times 100$$
  Tracks percentage of requests returning HTTP 5xx responses. Breaches above $5\%$ trigger critical alerts.

- **Duration (p95 Latency):**
  $$\text{p95 Latency} = \text{histogram\_quantile}\left(0.95, \sum \text{rate}(\text{http\_request\_duration\_seconds\_bucket}[1m]) \text{ by } (le)\right)$$
  Calculates the 95th percentile response duration in milliseconds. Detects tail latency bottlenecks.

---

### 2. Service Level Objectives (SLO) & Error Budget Burn Rates

#### A. Availability Objective ($99.5\%$ Target)
- **Target:** $99.5\%$ successful requests over rolling 30-day window.
- **Allowed Error Budget:** $0.5\%$ of all requests may fail before SLO breach.
- **Error Budget Remaining Calculation:**
  $$\text{Remaining Budget (\%)} = \max\left(0, 100 - (\text{Error Rate} \times 5)\right)$$

#### B. Latency Objective ($p95 < 500\text{ms}$)
- **Target:** $95\%$ of all requests complete in $< 500\text{ms}$ over 1-hour window.
- **Latency Budget Calculation:**
  $$\text{Latency Budget Remaining (\%)} = \max\left(0, 100 - \frac{\max(0, p95 - 500)}{20}\right)$$

#### C. Multi-Window Multi-Burn Rate Theory

| Burn Rate | Meaning | Severity | Time to Total Budget Exhaustion |
| :--- | :--- | :--- | :--- |
| **$\le 1.0\times$** | Nominal consumption rate | Healthy (Emerald) | $> 25\text{ days}$ |
| **$2.0\times - 9.9\times$** | Elevated error budget drain | Warning (Amber) | $\sim 3.2\text{ days}$ |
| **$\ge 10.0\times$ (e.g. $14.4\times$)** | Rapid burn ($2\%$ budget consumed in $1\text{ hour}$) | Critical P1 (Red) | $\sim 1.4\text{ hours}$ |

---

## Part 3: Architecture of the React SaaS Dashboard

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
│ Logs      │ FOOTER: Telemetry Stack Status & Active Ports (:8080, :3002, :3000, :3003) │
└───────────┴────────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

1. **Light / Dark Mode Engine (`ThemeContext.tsx`):**
   - Configured with Tailwind `darkMode: 'class'`.
   - Global toggle persisted in `localStorage`.
   - Instant `<Sun />` and `<Moon />` toggle button in top navbar.
   - **Light Mode Palette:** Canvas `#f8fafc`, containers `#ffffff`, borders `border-slate-200/80`, headings `#0f172a`.
   - **Dark Mode Palette:** Canvas `#0b0f19`, containers `#1e293b`, borders `border-slate-800`, text `#f1f5f9` and `#94a3b8`.

2. **Slim Left Sidebar (`Sidebar.tsx`):**
   - Minimalist vertical dock utilizing Lucide React icons:
     - Dashboard (`<Activity />`)
     - Topology Mesh (`<Layers />`)
     - Distributed Traces (`<ListTree />`)
     - SLOs & Budgets (`<ShieldCheck />`)
     - Prometheus Alerts (`<ShieldAlert />`) with live firing alert badge
     - Chaos Lab (`<ZapOff />`) with active fault badge
     - Loki Logs (`<FileText />`)

3. **Top Navigation Bar (`Navbar.tsx`):**
   - Environment selector pill: `Production (us-east-1)`, `Staging`, `Local Mesh`.
   - Contextual Service Selector: `All Services`, `api-gateway`, `order-service`, `payment-service`, `notification-service`.
   - Real-time Sync Status Pill: Live scraper frequency selector (`1s`, `2s`, `5s`).
   - Quick search input with keyboard shortcut pill `⌘K`.
   - Traffic generator button: `Simulate Traffic (20x)`.
   - Quick fault reset: `Reset Faults`.
   - Theme toggle (`<Sun />` / `<Moon />`).
   - Notification Bell with dropdown popover for active firing alerts.

4. **Top Row RED Metric Cards (`RedMetrics.tsx`):**
   - 4 high-contrast KPI cards:
     1. **Throughput:** Live requests/sec, trend pill ($+12.4\%$), 2xx/5xx status breakdown.
     2. **p95 Latency:** Latency in ms, target benchmark pill ($< 500\text{ms}$), p50 comparison.
     3. **Error Rate:** HTTP 5xx percentage, threshold breach warning pill.
     4. **Active Incidents:** Live firing count, status pill (Nominal vs Action Required).

5. **Microservice Dependency Topology Graph (`TopologyGraph.tsx`):**
   - Interactive SVG canvas with animated stroke dashes representing live HTTP requests.
   - Node cards for `API Gateway`, `Order Service`, `Payment Service`, `Notification Service`.
   - Real-time port mapping, status badges (Healthy, Delay, Error), and click-to-inspect drawer.

6. **Distributed Trace Waterfall Visualizer (`TraceViewer.tsx`):**
   - Split panel with recent trace search, filtering for errors, and duration ranking.
   - Visual Gantt bars proportional to span durations and start offsets.
   - Detailed span inspector revealing OpenTelemetry semantic attributes (`http.status_code`, `http.method`, `order.id`, error exceptions).

7. **SLO Circular Progress Rings (`SloMonitor.tsx`):**
   - Minimalist radial SVG donut gauges displaying remaining error budget percentages.
   - Color coded: Emerald ($> 60\%$), Amber ($25\% - 60\%$), Red ($\le 25\%$).
   - Real-time multi-window burn rate multipliers ($1.0\times$, $2.8\times$, $14.4\times$) and time-to-exhaustion forecasts.

8. **Prometheus Incident Timeline (`IncidentTimeline.tsx`):**
   - Real-time alert feed tracking FIRING and RESOLVED alert states.
   - Severity tags (Critical, Warning, Info) with root-cause diagnostics and actionable SRE remediation playbooks.

9. **Chaos & Fault Injection Lab (`FaultInjectionPanel.tsx`):**
   - Interactive iOS-style toggle switches and range sliders:
     - Payment Service latency delay ($1000\text{ms} - 8000\text{ms}$).
     - Payment Service HTTP 503 outage.
     - Order Service database connection timeout.
     - Notification Service queue backlog delay.
     - API Gateway HTTP 504 timeout.
   - One-click global reset to return the microservice mesh to normal.

---

## Verification & Deployment Summary
- **Vite Production Bundle:** Compiled with 0 errors via `npm run build` (`dist/assets/index-DIu5KxoM.js` ~ 249 kB).
- **Backend Integrity:** Port setups, OTel configurations, Prometheus rules, and telemetry collectors untouched and fully preserved.
- **Browser Compatibility:** Responsive across desktop, tablet, and mobile with light and dark mode support.
