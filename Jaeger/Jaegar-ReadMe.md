# MicroWatch - Jaeger Distributed Tracing

This folder documents the Jaeger setup used by **MicroWatch** for collecting
and visualizing distributed traces from the Payment Service.

## Overview

The OpenTelemetry SDK in the Payment Service (`payment-service/telemetry.js`)
exports traces over OTLP (HTTP) to Jaeger, where they are stored and
visualized for root-cause analysis.

## Running Jaeger

```cmd
docker run -d --name jaeger -p 16686:16686 -p 4317:4317 -p 4318:4318 jaegertracing/all-in-one:latest
```
