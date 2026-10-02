import React from "react";
import {
  ShieldCheck,
  AlertTriangle,
  Flame,
  Clock,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import { SLOStatus, REDMetricPoint } from "../types";
import { useTheme } from "../context/ThemeContext";

interface SloMonitorProps {
  slos: SLOStatus[];
  currentMetric: REDMetricPoint;
  compact?: boolean;
}

export const SloDonut: React.FC<{
  percentage: number;
  size?: number;
  strokeWidth?: number;
  status: "HEALTHY" | "WARNING" | "CRITICAL_BURN";
}> = ({ percentage, size = 80, strokeWidth = 8, status }) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  const color =
    status === "CRITICAL_BURN"
      ? "#ef4444"
      : status === "WARNING"
      ? "#f59e0b"
      : "#10b981";

  const trackColor = isDark ? "#334155" : "#f1f5f9";

  return (
    <div className="relative inline-flex items-center justify-center shrink-0">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          className="donut-ring"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 leading-none">
          {percentage}%
        </span>
        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">budget</span>
      </div>
    </div>
  );
};

export const SloMonitor: React.FC<SloMonitorProps> = ({
  slos,
  currentMetric,
  compact = false,
}) => {
  const getBurnRateBadge = (burnRate: number) => {
    if (burnRate > 10) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800/60 animate-pulse">
          <Flame className="w-3 h-3 text-red-600 dark:text-red-400" />
          {burnRate}x Critical Burn
        </span>
      );
    }
    if (burnRate > 2) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
          <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          {burnRate}x Warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        {burnRate}x Nominal
      </span>
    );
  };

  const getProgressBarColor = (pct: number) => {
    if (pct > 60) return "bg-emerald-500";
    if (pct > 25) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-colors duration-200">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            SLO & Error Budget Burn Rates
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Multi-window error budget consumption tracked to Google SRE handbook standards
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 font-mono">
          <span>Window: 30d / 1h</span>
        </div>
      </div>

      {/* Content Cards */}
      <div className={`p-4 sm:p-5 ${compact ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 gap-4"}`}>
        {slos.map((slo) => {
          return (
            <div
              key={slo.name}
              className={`p-4 rounded-xl border transition-all ${
                slo.status === "CRITICAL_BURN"
                  ? "bg-red-50/30 dark:bg-red-950/20 border-red-200 dark:border-red-900/60 ring-1 ring-red-200 dark:ring-red-900/50"
                  : slo.status === "WARNING"
                  ? "bg-amber-50/30 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 ring-1 ring-amber-200 dark:ring-amber-900/50"
                  : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {/* Radial Progress Ring (Circular Donut) */}
                  <SloDonut
                    percentage={slo.budgetRemainingPercent}
                    status={slo.status}
                    size={72}
                    strokeWidth={7}
                  />

                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      {slo.name}
                    </h4>
                    <div className="mt-1 flex items-baseline gap-1 text-xs font-mono">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">Current:</span>
                      <span
                        className={`font-bold ${
                          slo.status === "CRITICAL_BURN"
                            ? "text-red-600 dark:text-red-400"
                            : slo.status === "WARNING"
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        }`}
                      >
                        {slo.current}{slo.unit}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        (target {slo.target}{slo.unit})
                      </span>
                    </div>

                    <div className="mt-1.5">{getBurnRateBadge(slo.burnRate)}</div>
                  </div>
                </div>
              </div>

              {/* Progress Bar & Projected Exhaustion */}
              <div className="mt-3.5 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-500 dark:text-slate-400">Capacity Remaining</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {slo.budgetRemainingPercent}%
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-200/80 dark:bg-slate-700/80 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${Math.max(2, slo.budgetRemainingPercent)}%` }}
                    className={`h-full rounded-full transition-all duration-500 ${getProgressBarColor(
                      slo.budgetRemainingPercent
                    )}`}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                    Exhaustion:
                  </span>
                  <span
                    className={`font-mono font-semibold ${
                      slo.status === "CRITICAL_BURN"
                        ? "text-red-600 dark:text-red-400"
                        : slo.status === "WARNING"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {slo.timeToExhaustion}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="p-4 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2">
          <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            Multi-Window Multi-Burn Rates (1x = 100% budget consumed in 30 days, 14.4x = fast burn triggering automated PagerDuty incidents).
          </p>
        </div>
      )}
    </div>
  );
};
