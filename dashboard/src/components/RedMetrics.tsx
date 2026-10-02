import React from "react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
} from "lucide-react";
import { REDMetricPoint } from "../types";
import { useTheme } from "../context/ThemeContext";

interface RedMetricsProps {
  currentMetric: REDMetricPoint;
  history: REDMetricPoint[];
  selectedService: string;
  setSelectedService: (svc: string) => void;
  firingAlertCount?: number;
}

export const RedMetricCards: React.FC<{
  currentMetric: REDMetricPoint;
  firingAlertCount?: number;
}> = ({ currentMetric, firingAlertCount = 0 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Throughput (Rate) */}
      <div className="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Throughput (Rate)
          </span>
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 transition-colors group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40">
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 font-mono tracking-tight">
            {currentMetric.rate}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">req / sec</span>
        </div>

        <div className="mt-3.5 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60">
            <ArrowUpRight className="w-3 h-3 text-emerald-600" />
            +12.4%
          </span>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            2xx: {currentMetric.status2xx}
          </span>
        </div>
      </div>

      {/* 2. p95 Latency */}
      <div
        className={`bg-white dark:bg-[#1e293b] p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all relative overflow-hidden group ${
          currentMetric.p95 > 500
            ? "border-amber-300 dark:border-amber-700 bg-amber-50/20 dark:bg-amber-950/20 ring-1 ring-amber-200 dark:ring-amber-800/40"
            : "border-slate-200/80 dark:border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            p95 Latency
          </span>
          <div
            className={`p-2 rounded-xl transition-colors ${
              currentMetric.p95 > 500
                ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                : "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 group-hover:bg-amber-100"
            }`}
          >
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={`text-3xl font-bold font-mono tracking-tight ${
              currentMetric.p95 > 500 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {currentMetric.p95}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">ms</span>
        </div>

        <div className="mt-3.5 flex items-center justify-between text-xs">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              currentMetric.p95 > 500
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            }`}
          >
            {currentMetric.p95 > 500 ? "SLO Target Exceeded" : "Target < 500ms"}
          </span>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            p50: {currentMetric.p50}ms
          </span>
        </div>
      </div>

      {/* 3. Error Rate */}
      <div
        className={`bg-white dark:bg-[#1e293b] p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all relative overflow-hidden group ${
          currentMetric.errorRate > 0
            ? "border-red-300 dark:border-red-700 bg-red-50/20 dark:bg-red-950/20 ring-1 ring-red-200 dark:ring-red-800/40"
            : "border-slate-200/80 dark:border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Error Rate
          </span>
          <div
            className={`p-2 rounded-xl transition-colors ${
              currentMetric.errorRate > 0
                ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100"
            }`}
          >
            {currentMetric.errorRate > 0 ? (
              <AlertTriangle className="w-4 h-4 text-red-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={`text-3xl font-bold font-mono tracking-tight ${
              currentMetric.errorRate > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {currentMetric.errorRate}%
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">HTTP 5xx</span>
        </div>

        <div className="mt-3.5 flex items-center justify-between text-xs">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              currentMetric.errorRate > 0
                ? "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-800/60"
            }`}
          >
            {currentMetric.errorRate > 0
              ? `Breach: ${currentMetric.status5xx} failed`
              : "Nominal 0.0%"}
          </span>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            5xx: {currentMetric.status5xx}
          </span>
        </div>
      </div>

      {/* 4. Active Alerts & Health */}
      <div
        className={`bg-white dark:bg-[#1e293b] p-5 rounded-2xl border shadow-sm hover:shadow-md transition-all relative overflow-hidden group ${
          firingAlertCount > 0
            ? "border-red-300 dark:border-red-700 bg-red-50/20 dark:bg-red-950/20 ring-1 ring-red-200 dark:ring-red-800/40"
            : "border-slate-200/80 dark:border-slate-800"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active Incidents
          </span>
          <div
            className={`p-2 rounded-xl transition-colors ${
              firingAlertCount > 0
                ? "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100"
            }`}
          >
            {firingAlertCount > 0 ? (
              <ShieldAlert className="w-4 h-4 text-red-500" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            )}
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span
            className={`text-3xl font-bold font-mono tracking-tight ${
              firingAlertCount > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {firingAlertCount}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">firing</span>
        </div>

        <div className="mt-3.5 flex items-center justify-between text-xs">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              firingAlertCount > 0
                ? "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-800/60"
            }`}
          >
            {firingAlertCount > 0 ? "Action Required" : "All Rules Clear"}
          </span>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Prometheus :9090
          </span>
        </div>
      </div>
    </div>
  );
};

export const RedMetrics: React.FC<RedMetricsProps> = ({
  currentMetric,
  history,
  selectedService,
  setSelectedService,
  firingAlertCount = 0,
}) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const gridColor = isDark ? "#334155" : "#f1f5f9";
  const axisColor = isDark ? "#64748b" : "#94a3b8";
  const tooltipBg = isDark ? "#1e293b" : "#ffffff";
  const tooltipBorder = isDark ? "#334155" : "#e2e8f0";
  const tooltipText = isDark ? "#f1f5f9" : "#0f172a";

  return (
    <div className="space-y-6">
      {/* Top Row KPI Cards */}
      <RedMetricCards currentMetric={currentMetric} firingAlertCount={firingAlertCount} />

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Request Rate & Status Breakdown */}
        <div className="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                Live Request Throughput
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Continuous requests per second scraped via Prometheus
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/70 dark:border-emerald-800/60 flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 2xx: {currentMetric.status2xx}
              </span>
              <span className="text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md border border-red-200/70 dark:border-red-800/60 flex items-center gap-1 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 5xx: {currentMetric.status5xx}
              </span>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rateGradientSaaS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="timeLabel" stroke={axisColor} fontSize={10} tickLine={false} />
                <YAxis stroke={axisColor} fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: "12px",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
                    fontSize: "12px",
                    color: tooltipText,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="rate"
                  name="Rate (req/s)"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#rateGradientSaaS)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Latency Percentiles (p50, p95, p99) */}
        <div className="bg-white dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Latency Percentiles (p50, p95, p99)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                End-to-end request duration histogram buckets (ms)
              </p>
            </div>
            <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
              p95: {currentMetric.p95}ms
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="timeLabel" stroke={axisColor} fontSize={10} tickLine={false} />
                <YAxis stroke={axisColor} fontSize={10} unit="ms" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBg,
                    borderColor: tooltipBorder,
                    borderRadius: "12px",
                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.2)",
                    fontSize: "12px",
                    color: tooltipText,
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="p50"
                  name="p50 Latency"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  name="p95 Latency"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p99"
                  name="p99 Latency"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
