# MicroWatch - Prometheus Monitoring

This folder contains the Prometheus configuration used by **MicroWatch** for monitoring the Payment Service and detecting service-level issues.

## Overview

Prometheus collects metrics from the Payment Service and evaluates alerting rules to detect:

- High HTTP 5xx error rates
- High request latency
- Payment service downtime

Prometheus is run using Docker.

## Requirements

Before running Prometheus, make sure the following are installed:

- Docker Desktop
- WSL 2 (Windows)
- Node.js and npm
- MicroWatch project repository

Make sure Docker Desktop is running before starting Prometheus.

## Configuration Files

### `prometheus.yml`

Main Prometheus configuration file.

It defines:

- Global scrape interval
- Payment Service monitoring target
- Metrics endpoint used by Prometheus

The Payment Service is scraped through:

```text
host.docker.internal:9464
```

### `alert_rules.yml`

Contains the MicroWatch alerting rules:

| Alert | Purpose | Severity |
|-------|---------|----------|
| `HighErrorRate` | Detects excessive HTTP 5xx errors | Critical |
| `HighLatency` | Detects high p95 request latency | Warning |
| `PaymentServiceDown` | Detects when the Payment Service becomes unavailable | Critical |

## Running the Payment Service

Open a terminal in the Payment Service directory:

```bash
cd payment-service
```

Install dependencies if required:

```bash
npm install
```

Start the service:

```bash
npm start
```

The service must be running for Prometheus to scrape its metrics.

## Running Prometheus

From the MicroWatch project directory, create the Prometheus container:

```cmd
docker run -d --name prometheus -p 9090:9090 ^
  -v "C:\Users\<YOUR_USERNAME>\Desktop\MicroWatch\Prometheus\prometheus.yml:/etc/prometheus/prometheus.yml" ^
  -v "C:\Users\<YOUR_USERNAME>\Desktop\MicroWatch\Prometheus\alert_rules.yml:/etc/prometheus/alert_rules.yml" ^
  prom/prometheus
```

> Replace `<YOUR_USERNAME>` with your Windows username.

Alternatively, if the Prometheus container already exists:

```bash
docker start prometheus
```

## Accessing Prometheus

Open:

```text
http://localhost:9090
```

The Prometheus web interface can be used to execute PromQL queries and inspect metrics.

## Useful Queries

### Check whether the Payment Service is up

```promql
up{job="payment-service"}
```

Expected result when the service is running:

```text
1
```

Expected result when the service is unavailable:

```text
0
```

### Check request rate

```promql
sum(rate(http_server_request_duration_count{job="payment-service"}[5m]))
```

### Check HTTP status codes

```promql
sum by (http_response_status_code) (
  rate(http_server_request_duration_count{job="payment-service"}[5m])
)
```

### Check 5xx error percentage

```promql
100 *
sum(rate(http_server_request_duration_count{job="payment-service",http_response_status_code=~"5.."}[5m]))
/
sum(rate(http_server_request_duration_count{job="payment-service"}[5m]))
```

### Check p95 latency

```promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(http_server_request_duration_bucket{job="payment-service"}[5m])
  )
)
```

The result is measured in seconds.

## Checking Alerts

Open:

```text
http://localhost:9090/alerts
```

The following alerts should be visible:

```text
HighErrorRate
HighLatency
PaymentServiceDown
```

Alerts can have three states:

- **INACTIVE** - condition is not currently met
- **PENDING** - condition has been met but the configured duration has not elapsed
- **FIRING** - condition has remained true for the required duration

## Testing Alerts

### 1. High Error Rate

Generate multiple payment requests and simulate a payment gateway failure.

The `HighErrorRate` alert should eventually move from:

```text
INACTIVE → PENDING → FIRING
```

After the service returns to normal and the error rate falls below the threshold, it should return to:

```text
INACTIVE
```

### 2. High Latency

Generate payment requests that produce increased request latency.

The `HighLatency` alert should move through:

```text
INACTIVE → PENDING → FIRING
```

Once latency returns below the configured threshold, the alert should become:

```text
INACTIVE
```

### 3. Payment Service Down

Stop the Payment Service.

Check:

```promql
up{job="payment-service"}
```

The result should become:

```text
0
```

The `PaymentServiceDown` alert should eventually enter:

```text
FIRING
```

Start the Payment Service again:

```bash
npm start
```

Then verify:

```promql
up{job="payment-service"}
```

returns:

```text
1
```

The alert should return to:

```text
INACTIVE
```

## Configuration Validation

Before running Prometheus, the configuration can be validated using:

```bash
docker exec prometheus promtool check config /etc/prometheus/prometheus.yml
```

A successful validation should show:

```text
SUCCESS: ... rule files found
SUCCESS: /etc/prometheus/prometheus.yml is valid prometheus config file syntax
```

The alert rules can also be checked directly:

```bash
docker exec prometheus promtool check rules /etc/prometheus/alert_rules.yml
```

## Troubleshooting

### Prometheus is not scraping the Payment Service

Check:

```promql
up{job="payment-service"}
```

If the result is `0`, make sure:

1. The Payment Service is running.
2. Docker Desktop is running.
3. The service is exposing metrics on port `9464`.
4. `prometheus.yml` contains:

```yaml
targets: ["host.docker.internal:9464"]
```

### Prometheus container is not running

Check:

```bash
docker ps
```

If `prometheus` is stopped:

```bash
docker start prometheus
```

### Check Prometheus logs

```bash
docker logs prometheus
```

## Architecture

```text
                    ┌─────────────────────┐
                    │    Payment Service  │
                    │      Node.js        │
                    │                     │
                    │   Metrics :9464     │
                    └──────────┬──────────┘
                               │
                               │ scrape
                               ▼
                    ┌─────────────────────┐
                    │     Prometheus      │
                    │      :9090          │
                    │                     │
                    │ Metrics + PromQL    │
                    │ Alert Evaluation    │
                    └─────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │      Alerts         │
                    │                     │
                    │ HighErrorRate       │
                    │ HighLatency         │
                    │ PaymentServiceDown  │
                    └─────────────────────┘
```

## Notes

- Grafana is **not used** in the current MicroWatch implementation.
- Prometheus is responsible for metrics collection, querying, and alert rule evaluation.
- Alert notifications are not configured through Alertmanager in the current implementation.
