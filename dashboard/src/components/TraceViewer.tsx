import React, { useState } from "react";
import {
  ListTree,
  Search,
  Filter,
  ExternalLink,
  Copy,
  Info,
} from "lucide-react";
import { Trace, Span } from "../types";

interface TraceViewerProps {
  traces: Trace[];
  activeFaults: Record<string, any>;
  onRefreshTraces?: () => void;
  compact?: boolean;
}

export const TraceViewer: React.FC<TraceViewerProps> = ({
  traces,
  activeFaults,
  onRefreshTraces,
  compact = false,
}) => {
  const [selectedTrace, setSelectedTrace] = useState<Trace | null>(
    traces.length > 0 ? traces[0] : null
  );
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterErrorOnly, setFilterErrorOnly] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync selected trace if null
  React.useEffect(() => {
    if (!selectedTrace && traces.length > 0) {
      setSelectedTrace(traces[0]);
    }
  }, [traces, selectedTrace]);

  const filteredTraces = traces.filter((t) => {
    if (filterErrorOnly && !t.hasError) return false;
    if (
      searchQuery &&
      !t.traceId.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !t.rootOperation.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getServiceBadgeStyle = (svc: string) => {
    switch (svc) {
      case "api-gateway":
        return "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60";
      case "order-service":
        return "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60";
      case "payment-service":
        return "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60";
      case "notification-service":
        return "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/60";
      default:
        return "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700";
    }
  };

  const getSpanColor = (span: Span) => {
    if (span.hasError) return "bg-red-500";
    if (span.serviceName === "api-gateway") return "bg-blue-600";
    if (span.serviceName === "order-service") return "bg-indigo-600";
    if (span.serviceName === "payment-service") return "bg-emerald-600";
    if (span.serviceName === "notification-service") return "bg-cyan-600";
    return "bg-slate-400";
  };

  const maxTraceDuration = selectedTrace ? selectedTrace.totalDurationMs : 100;

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col space-y-0 transition-colors duration-200">
      {/* Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ListTree className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Distributed Tracing Waterfall
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            OpenTelemetry W3C trace correlation extracted from Jaeger Collector
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="http://localhost:16686"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Jaeger UI</span>
          </a>
          {onRefreshTraces && (
            <button
              onClick={onRefreshTraces}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-700/60 hover:bg-blue-100/70 transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Main Layout: Split Trace List (5 cols) & Waterfall Gantt (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[460px]">
        {/* Left Side: Trace List */}
        <div className="lg:col-span-5 p-4 border-b lg:border-b-0 lg:border-r border-slate-200/80 dark:border-slate-800 flex flex-col space-y-3 bg-slate-50/40 dark:bg-slate-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Traces ({filteredTraces.length})
            </span>
            <button
              onClick={() => setFilterErrorOnly(!filterErrorOnly)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                filterErrorOnly
                  ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>Errors Only</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search trace ID or route..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {/* Trace Items Scroll Area */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[380px]">
            {filteredTraces.map((trace) => {
              const isSelected = selectedTrace?.traceId === trace.traceId;
              return (
                <div
                  key={trace.traceId}
                  onClick={() => {
                    setSelectedTrace(trace);
                    setSelectedSpan(null);
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-50/70 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 shadow-sm"
                      : "bg-white dark:bg-[#1e293b] border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/80 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                      {trace.rootOperation}
                    </span>
                    {trace.hasError ? (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                        ERROR
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        200 OK
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span className="truncate max-w-[140px] text-slate-400 dark:text-slate-500">
                      {trace.traceId.slice(0, 14)}...
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold">
                      {trace.totalDurationMs}ms
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                    <span>{trace.spans.length} spans</span>
                    <span>{trace.startTime}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Waterfall Gantt Chart & Details */}
        <div className="lg:col-span-7 p-4 sm:p-5 flex flex-col space-y-4 bg-white dark:bg-[#1e293b]">
          {selectedTrace ? (
            <div className="space-y-4">
              {/* Selected Trace Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {selectedTrace.rootOperation}
                    </h4>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                        selectedTrace.hasError
                          ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
                          : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                      }`}
                    >
                      {selectedTrace.hasError ? "Failed Span" : "Success"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    <span>ID: {selectedTrace.traceId.slice(0, 16)}...</span>
                    <button
                      onClick={() => copyToClipboard(selectedTrace.traceId)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700"
                      title="Copy full trace ID"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {copiedId && (
                      <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">Copied!</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase">Duration</span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{selectedTrace.totalDurationMs} ms</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 block uppercase">Spans</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{selectedTrace.spans.length}</span>
                  </div>
                </div>
              </div>

              {/* Waterfall Timeline Labels */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono px-1">
                <span>Span Operation</span>
                <span>Timeline (0ms — {maxTraceDuration.toFixed(0)}ms)</span>
              </div>

              {/* Waterfall Gantt Rows */}
              <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
                {selectedTrace.spans.map((span) => {
                  const offsetPercent = Math.min(
                    92,
                    (span.startTime / (maxTraceDuration || 1)) * 100
                  );
                  const widthPercent = Math.max(
                    6,
                    Math.min(100 - offsetPercent, (span.duration / (maxTraceDuration || 1)) * 100)
                  );
                  const isSpanSelected = selectedSpan?.spanId === span.spanId;

                  return (
                    <div
                      key={span.spanId}
                      onClick={() => setSelectedSpan(span)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSpanSelected
                          ? "bg-blue-50/80 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 shadow-sm"
                          : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800/70"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                        <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border ${getServiceBadgeStyle(
                              span.serviceName
                            )}`}
                          >
                            {span.serviceName}
                          </span>
                          <span className="text-slate-800 dark:text-slate-200 font-semibold truncate text-[11px]">
                            {span.operationName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-semibold text-[11px] ${
                              span.hasError ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {span.duration.toFixed(1)}ms
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              span.hasError
                                ? "bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400"
                                : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400"
                            }`}
                          >
                            {span.statusCode}
                          </span>
                        </div>
                      </div>

                      {/* Visual Gantt Bar */}
                      <div className="h-2.5 w-full bg-slate-200/70 dark:bg-slate-700/80 rounded-full overflow-hidden relative">
                        <div
                          style={{
                            marginLeft: `${offsetPercent}%`,
                            width: `${widthPercent}%`,
                          }}
                          className={`h-full rounded-full transition-all duration-300 ${getSpanColor(
                            span
                          )} ${span.hasError ? "animate-pulse" : ""}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Span Attributes Inspector Box */}
              {selectedSpan && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Span Metadata: <code className="text-blue-600 dark:text-blue-400 font-mono">{selectedSpan.spanId}</code>
                    </span>
                    <button
                      onClick={() => setSelectedSpan(null)}
                      className="text-xs text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                    <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] block">Service</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold">{selectedSpan.serviceName}</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] block">Duration</span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">{selectedSpan.duration}ms</span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] block">Status</span>
                      <span className={selectedSpan.hasError ? "text-red-600 font-bold" : "text-emerald-600"}>
                        HTTP {selectedSpan.statusCode}
                      </span>
                    </div>
                    <div className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <span className="text-slate-400 text-[10px] block">Parent</span>
                      <span className="text-slate-500 dark:text-slate-400">{selectedSpan.parentSpanId?.slice(0, 8) || "root"}</span>
                    </div>
                  </div>

                  {/* Attributes list */}
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-600 dark:text-slate-300 max-h-24 overflow-y-auto space-y-1">
                    {Object.entries(selectedSpan.tags).map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-slate-100 dark:border-slate-700/60 pb-0.5">
                        <span className="text-blue-600 dark:text-blue-400">{k}:</span>
                        <span className="text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-xs text-slate-400 dark:text-slate-500">
              Select a trace from the left panel to inspect waterfall spans.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
