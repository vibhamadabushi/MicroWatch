import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Wrench,
  ShieldAlert,
} from "lucide-react";
import { Incident } from "../types";

interface IncidentTimelineProps {
  incidents: Incident[];
  onSelectServiceTab?: (svc: string) => void;
  compact?: boolean;
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({
  incidents,
  onSelectServiceTab,
  compact = false,
}) => {
  const [filter, setFilter] = useState<"ALL" | "FIRING" | "RESOLVED">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(
    incidents.length > 0 ? incidents[0].id : null
  );

  const filteredIncidents = incidents.filter((inc) => {
    if (filter === "FIRING") return inc.status === "FIRING";
    if (filter === "RESOLVED") return inc.status === "RESOLVED";
    return true;
  });

  const firingCount = incidents.filter((i) => i.status === "FIRING").length;

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-colors duration-200">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            Prometheus Incident Feed
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Real-time threshold breaches & automated alert manager states
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl text-xs">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              filter === "ALL"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            All ({incidents.length})
          </button>
          <button
            onClick={() => setFilter("FIRING")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              filter === "FIRING"
                ? "bg-red-500 text-white shadow-sm"
                : "text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span>Firing ({firingCount})</span>
          </button>
          <button
            onClick={() => setFilter("RESOLVED")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
              filter === "RESOLVED"
                ? "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            Resolved
          </button>
        </div>
      </div>

      {/* Incident List */}
      <div className="p-4 sm:p-5 space-y-3 max-h-[420px] overflow-y-auto">
        {filteredIncidents.length > 0 ? (
          filteredIncidents.map((incident) => {
            const isExpanded = expandedId === incident.id;
            const isFiring = incident.status === "FIRING";

            return (
              <div
                key={incident.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  isFiring
                    ? incident.severity === "critical"
                      ? "border-red-300 dark:border-red-900/60 bg-red-50/20 dark:bg-red-950/20"
                      : "border-amber-300 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/20"
                    : "border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-[#1e293b]"
                }`}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : incident.id)}
                  className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${
                        isFiring
                          ? incident.severity === "critical"
                            ? "bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400"
                            : "bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400"
                          : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {isFiring ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-xs font-mono">
                          {incident.alertName}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold uppercase ${
                            isFiring
                              ? "bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
                              : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                          }`}
                        >
                          {incident.status}
                        </span>
                        <span
                          className={`hidden sm:inline-block px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold uppercase ${
                            incident.severity === "critical"
                              ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                              : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {incident.severity}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
                        {incident.summary}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline-block text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      {incident.resolvedAt ? `Resolved: ${incident.resolvedAt}` : incident.startedAt}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 space-y-2.5 text-xs animate-in fade-in">
                    <div>
                      <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 block mb-1">
                        Root Cause Diagnostics
                      </span>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 font-mono leading-relaxed">
                        {incident.description}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                        <Wrench className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                        Remediation Action
                      </span>
                      <div className="text-[11px] text-emerald-800 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-2.5 rounded-lg leading-relaxed">
                        {incident.remediation}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      <span>Service: <strong className="text-slate-700 dark:text-slate-300">{incident.service}</strong></span>
                      <a
                        href="http://localhost:9090/alerts"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 font-semibold"
                      >
                        Prometheus Rule
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="py-10 text-center text-xs text-slate-400 dark:text-slate-500">
            No incidents found for this filter.
          </div>
        )}
      </div>
    </div>
  );
};
