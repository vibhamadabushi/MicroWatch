import React, { useState } from "react";
import {
  Server,
  Layers,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sliders,
} from "lucide-react";
import { ServiceHealth, ServiceName } from "../types";

interface TopologyGraphProps {
  services: ServiceHealth[];
  activeFaults: Record<string, any>;
  onOpenFaults?: (svc: string) => void;
  compact?: boolean;
}

export const TopologyGraph: React.FC<TopologyGraphProps> = ({
  services,
  activeFaults,
  onOpenFaults,
  compact = false,
}) => {
  const [selectedNode, setSelectedNode] = useState<ServiceName | null>(null);

  const getServiceStatus = (name: ServiceName) => {
    const s = services.find((x) => x.name === name);
    return s ? s.status : "UP";
  };

  const getNodeMetrics = (name: ServiceName) => {
    const s = services.find((x) => x.name === name);
    return {
      latency: s?.latencyMs || 15,
      port: name === "payment-service" ? 8002 : "-",
      metricsPort: name === "payment-service" ? 8002 : "-",
    };
  };

  const isDegradedOrFaulty = (name: ServiceName) => {
    if (name === "payment-service" && (activeFaults["payment-delay"] || activeFaults["payment-error"])) {
      return activeFaults["payment-error"] ? "CRITICAL" : "DEGRADED";
    }
    if (name === "order-service" && (activeFaults["order-db"] || activeFaults["order-delay"])) {
      return activeFaults["order-db"] ? "CRITICAL" : "DEGRADED";
    }
    if (name === "notification-service" && (activeFaults["notif-delay"] || activeFaults["notif-error"])) {
      return "DEGRADED";
    }
    return getServiceStatus(name) === "DOWN" ? "CRITICAL" : "HEALTHY";
  };

  const nodes = [
    {
      id: "payment-service" as ServiceName,
      label: "Payment Service",
      sublabel: "Primary Active Service (:8002)",
      x: 300,
      y: 90,
    },
    {
      id: "api-gateway" as ServiceName,
      label: "API Gateway",
      sublabel: "Decommissioned (Streamlined)",
      x: 135,
      y: 280,
    },
    {
      id: "order-service" as ServiceName,
      label: "Order Service",
      sublabel: "Decommissioned (Streamlined)",
      x: 300,
      y: 280,
    },
    {
      id: "notification-service" as ServiceName,
      label: "Notification Service",
      sublabel: "Decommissioned (Streamlined)",
      x: 465,
      y: 280,
    },
  ];

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-colors duration-200">
      {/* Topology Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            Microservice Dependency Topology
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Real-time request routing mesh with W3C trace context propagation
          </p>
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Healthy
          </span>
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Delay
          </span>
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Error
          </span>
        </div>
      </div>

      {/* SVG Canvas & Node Cards */}
      <div className="relative bg-[#f8fafc] dark:bg-[#0b0f19] topology-grid-pattern p-4 sm:p-6 min-h-[380px] flex items-center justify-center overflow-hidden transition-colors duration-200">
        {/* SVG Flow Lines */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 600 370"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="edgeGradGateway" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#2563eb" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient id="edgeGradPay" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop
                offset="100%"
                stopColor={
                  activeFaults["payment-error"]
                    ? "#ef4444"
                    : activeFaults["payment-delay"]
                    ? "#f59e0b"
                    : "#10b981"
                }
              />
            </linearGradient>
            <linearGradient id="edgeGradNotif" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" />
              <stop
                offset="100%"
                stopColor={
                  activeFaults["notif-delay"]
                    ? "#f59e0b"
                    : "#06b6d4"
                }
              />
            </linearGradient>
          </defs>

          {/* Gateway -> Order */}
          <path
            d="M 300 85 L 300 145"
            fill="none"
            stroke="url(#edgeGradGateway)"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            className="animate-flow-dash"
          />

          {/* Order -> Payment */}
          <path
            d="M 270 205 C 270 245, 145 245, 145 280"
            fill="none"
            stroke="url(#edgeGradPay)"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            className="animate-flow-dash"
          />

          {/* Order -> Notification */}
          <path
            d="M 330 205 C 330 245, 455 245, 455 280"
            fill="none"
            stroke="url(#edgeGradNotif)"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            className="animate-flow-dash"
          />
        </svg>

        {/* Nodes Layer */}
        <div className="relative w-[600px] h-[370px]">
          {nodes.map((node) => {
            const healthStatus = isDegradedOrFaulty(node.id);
            const m = getNodeMetrics(node.id);
            const isSelected = selectedNode === node.id;

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node.id)}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  transform: "translate(-50%, -50%)",
                }}
                className={`absolute cursor-pointer transition-all duration-200 w-52 p-3 rounded-xl border bg-white dark:bg-[#1e293b] shadow-sm hover:shadow-md ${
                  healthStatus === "CRITICAL"
                    ? "border-red-400 dark:border-red-600 bg-red-50/40 dark:bg-red-950/40 ring-2 ring-red-300 dark:ring-red-800"
                    : healthStatus === "DEGRADED"
                    ? "border-amber-400 dark:border-amber-600 bg-amber-50/40 dark:bg-amber-950/40 ring-2 ring-amber-300 dark:ring-amber-800"
                    : "border-slate-200/90 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500"
                } ${isSelected ? "ring-2 ring-blue-500 scale-105" : "hover:scale-[1.02]"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-1.5 rounded-lg ${
                        healthStatus === "CRITICAL"
                          ? "bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400"
                          : healthStatus === "DEGRADED"
                          ? "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400"
                          : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                      }`}
                    >
                      <Server className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                        {node.label}
                      </h4>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        Port :{m.port}
                      </p>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  {healthStatus === "CRITICAL" ? (
                    <XCircle className="w-4 h-4 text-red-500 animate-spin" />
                  ) : healthStatus === "DEGRADED" ? (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                </div>

                <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                  {node.sublabel}
                </p>

                {/* Micro Metric Badges */}
                <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-500 dark:text-slate-400">
                    Latency:{" "}
                    <strong
                      className={
                        m.latency > 500
                          ? "text-amber-600 dark:text-amber-400 font-bold"
                          : "text-slate-700 dark:text-slate-300"
                      }
                    >
                      {m.latency}ms
                    </strong>
                  </span>
                  <span className="text-blue-600 dark:text-blue-400 font-semibold">OTel Active</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 dark:text-slate-100">
                Selected Service: <code className="font-mono text-blue-600 dark:text-blue-400 font-semibold">{selectedNode}</code>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                Metrics : {getNodeMetrics(selectedNode).metricsPort}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Live HTTP metrics & OTLP traces propagated via W3C traceparent headers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenFaults && (
              <button
                onClick={() => onOpenFaults(selectedNode)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Inject Fault</span>
              </button>
            )}
            <button
              onClick={() => setSelectedNode(null)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
