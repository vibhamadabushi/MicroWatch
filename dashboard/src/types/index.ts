export type ServiceName =
  | "api-gateway"
  | "order-service"
  | "payment-service"
  | "notification-service";

export type ServiceStatus = "UP" | "DEGRADED" | "DOWN";

export interface ServiceHealth {
  name: ServiceName;
  url: string;
  metricsUrl?: string;
  status: ServiceStatus;
  httpStatus?: number;
  latencyMs: number;
  error?: string;
  data?: any;
}

export interface REDMetricPoint {
  timestamp: string;
  timeLabel: string;
  rate: number; // requests per sec
  errorRate: number; // percentage (0 - 100)
  p50: number; // ms
  p90: number; // ms
  p95: number; // ms
  p99: number; // ms
  status2xx: number;
  status4xx: number;
  status5xx: number;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  serviceName: ServiceName;
  startTime: number; // microseconds or relative ms
  duration: number; // ms
  statusCode: number;
  hasError: boolean;
  tags: Record<string, any>;
  logs?: Array<{ timestamp: number; fields: Record<string, any> }>;
}

export interface Trace {
  traceId: string;
  rootService: ServiceName;
  rootOperation: string;
  startTime: string;
  totalDurationMs: number;
  spanCount: number;
  hasError: boolean;
  spans: Span[];
}

export interface SLOStatus {
  name: string;
  target: number; // e.g. 99.0
  current: number; // e.g. 99.4
  unit: "%" | "ms";
  window: string; // e.g. "30d" / "1h"
  budgetRemainingPercent: number; // e.g. 84.5%
  burnRate: number; // 1.0x normal, >2x warning, >14x critical
  status: "HEALTHY" | "WARNING" | "CRITICAL_BURN";
  timeToExhaustion: string;
}

export interface Incident {
  id: string;
  alertName: string;
  service: ServiceName | "system";
  severity: "critical" | "warning" | "info";
  status: "FIRING" | "RESOLVED";
  startedAt: string;
  resolvedAt?: string;
  summary: string;
  description: string;
  remediation: string;
}

export interface FaultConfig {
  service: ServiceName | "gateway";
  simulateDelay: boolean;
  delayMs: number;
  simulateError: boolean;
  errorCode: number;
  simulateDbError?: boolean;
  simulateQueueDelay?: boolean;
  queueLatencyMs?: number;
  simulateRetryError?: boolean;
}

export interface LogEntry {
  timestamp: string;
  service: ServiceName;
  level: "info" | "warn" | "error";
  message: string;
  traceId?: string;
  meta?: Record<string, any>;
}
