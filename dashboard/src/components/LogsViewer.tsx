import React, { useState } from "react";
import {
  FileText,
  Search,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { LogEntry } from "../types";

interface LogsViewerProps {
  logs: LogEntry[];
  onRefresh: () => void;
  onFilterTrace: (traceId: string) => void;
}

export const LogsViewer: React.FC<LogsViewerProps> = ({
  logs,
  onRefresh,
  onFilterTrace,
}) => {
  const [selectedService, setSelectedService] = useState<string>("ALL");
  const [selectedLevel, setSelectedLevel] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLogs = logs.filter((log) => {
    if (selectedService !== "ALL" && log.service !== selectedService) return false;
    if (selectedLevel !== "ALL" && log.level !== selectedLevel.toLowerCase()) return false;
    if (
      searchQuery &&
      !log.message.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !log.traceId?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const getLevelBadge = (level: string) => {
    switch (level) {
      case "error":
        return "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800";
      case "warn":
        return "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800";
      default:
        return "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    }
  };

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col space-y-0 transition-colors duration-200">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Loki Structured Logs & Correlation
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Real-time JSON logs indexed by service label and correlated with active trace IDs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-[220px]">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search log messages or trace IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL" className="dark:bg-slate-900">All Services</option>
            <option value="api-gateway" className="dark:bg-slate-900">api-gateway</option>
            <option value="order-service" className="dark:bg-slate-900">order-service</option>
            <option value="payment-service" className="dark:bg-slate-900">payment-service</option>
            <option value="notification-service" className="dark:bg-slate-900">notification-service</option>
          </select>

          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="ALL" className="dark:bg-slate-900">All Levels</option>
            <option value="INFO" className="dark:bg-slate-900">INFO</option>
            <option value="WARN" className="dark:bg-slate-900">WARN</option>
            <option value="ERROR" className="dark:bg-slate-900">ERROR</option>
          </select>
        </div>
      </div>

      {/* Logs Stream Container */}
      <div className="p-4 bg-[#f8fafc] dark:bg-[#0b0f19] font-mono text-xs max-h-[500px] overflow-y-auto space-y-2 transition-colors duration-200">
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200/80 dark:border-slate-700/80 shadow-2xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors flex flex-col sm:flex-row sm:items-start justify-between gap-2"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-slate-400 dark:text-slate-500 text-[11px] whitespace-nowrap pt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold border ${getLevelBadge(
                    log.level
                  )}`}
                >
                  {log.level}
                </span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-[11px] whitespace-nowrap pt-0.5">
                  [{log.service}]
                </span>
                <span className="text-slate-800 dark:text-slate-200 break-all text-[11px]">{log.message}</span>
              </div>

              {log.traceId && (
                <button
                  onClick={() => onFilterTrace(log.traceId!)}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md whitespace-nowrap self-start sm:self-auto font-semibold"
                >
                  trace: {log.traceId.slice(0, 8)}...
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500">
            No log entries match the current filter.
          </div>
        )}
      </div>
    </div>
  );
};
