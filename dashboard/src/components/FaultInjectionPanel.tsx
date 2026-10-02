import React, { useState } from "react";
import {
  ZapOff,
  RotateCcw,
  CreditCard,
  Database,
  Mail,
  Server,
} from "lucide-react";

interface FaultInjectionPanelProps {
  activeFaults: Record<string, any>;
  onToggleFault: (key: string, enabled: boolean, params?: any) => void;
  onResetAll: () => void;
  compact?: boolean;
}

export const FaultInjectionPanel: React.FC<FaultInjectionPanelProps> = ({
  activeFaults,
  onToggleFault,
  onResetAll,
  compact = false,
}) => {
  const [paymentDelayVal, setPaymentDelayVal] = useState(5000);
  const [orderDelayVal, setOrderDelayVal] = useState(3000);
  const [queueDelayVal, setQueueDelayVal] = useState(2500);

  const activeCount = Object.values(activeFaults).filter(Boolean).length;

  return (
    <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-colors duration-200">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ZapOff className="w-4 h-4 text-red-500" />
            Chaos & Fault Injection
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Inject runtime failure modes to trigger Prometheus alerts, SLO burns & trace errors
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              {activeCount} active
            </span>
          )}
          <button
            onClick={onResetAll}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
            title="Reset all faults to normal"
          >
            <RotateCcw className="w-3 h-3 text-slate-500 dark:text-slate-400" />
            <span className="text-[11px]">Reset</span>
          </button>
        </div>
      </div>

      {/* Grid of Fault Controls */}
      <div className={`p-4 sm:p-5 ${compact ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 gap-4"}`}>
        {/* 1. Payment Service Faults */}
        <div
          className={`p-3.5 rounded-xl border transition-all ${
            activeFaults["payment-delay"] || activeFaults["payment-error"]
              ? "border-amber-300 dark:border-amber-700 bg-amber-50/20 dark:bg-amber-950/20"
              : "border-slate-200/80 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <CreditCard className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Payment Service (:3000 / :8002)
              </span>
            </div>
            {(activeFaults["payment-delay"] || activeFaults["payment-error"]) && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.2 rounded">
                Active
              </span>
            )}
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Payment Delay */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] block">
                    Simulate Latency Delay
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Artificially stalls checkout transaction
                  </span>
                </div>

                {/* iOS Style Switch */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(activeFaults["payment-delay"])}
                    onChange={(e) =>
                      onToggleFault("payment-delay", e.target.checked, { delayMs: paymentDelayVal })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {activeFaults["payment-delay"] && (
                <div className="pt-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    {paymentDelayVal}ms
                  </span>
                  <input
                    type="range"
                    min="1000"
                    max="8000"
                    step="500"
                    value={paymentDelayVal}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setPaymentDelayVal(val);
                      onToggleFault("payment-delay", true, { delayMs: val });
                    }}
                    className="flex-1 accent-blue-600 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Payment 503 Error */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <div>
                <span className="font-semibold text-red-700 dark:text-red-400 text-[11px] block">
                  Simulate HTTP 503 Failure
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Throws 503 Payment Gateway Unavailable
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(activeFaults["payment-error"])}
                  onChange={(e) => onToggleFault("payment-error", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* 2. Order Service Faults */}
        <div
          className={`p-3.5 rounded-xl border transition-all ${
            activeFaults["order-db"] || activeFaults["order-delay"]
              ? "border-amber-300 dark:border-amber-700 bg-amber-50/20 dark:bg-amber-950/20"
              : "border-slate-200/80 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <Database className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Order Service (:3002 / :8001)
              </span>
            </div>
            {(activeFaults["order-db"] || activeFaults["order-delay"]) && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.2 rounded">
                Active
              </span>
            )}
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Database Connection Timeout */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-red-700 dark:text-red-400 text-[11px] block">
                  Simulate DB Timeout
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Fails order persistence to database
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(activeFaults["order-db"])}
                  onChange={(e) => onToggleFault("order-db", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>

            {/* Order Service Delay */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] block">
                    Coordination Delay
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Coordinator latency before downstream
                  </span>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(activeFaults["order-delay"])}
                    onChange={(e) =>
                      onToggleFault("order-delay", e.target.checked, { delayMs: orderDelayVal })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {activeFaults["order-delay"] && (
                <div className="pt-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    {orderDelayVal}ms
                  </span>
                  <input
                    type="range"
                    min="1000"
                    max="6000"
                    step="500"
                    value={orderDelayVal}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setOrderDelayVal(val);
                      onToggleFault("order-delay", true, { delayMs: val });
                    }}
                    className="flex-1 accent-blue-600 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Notification Service Faults */}
        <div
          className={`p-3.5 rounded-xl border transition-all ${
            activeFaults["notif-delay"] || activeFaults["notif-error"]
              ? "border-amber-300 dark:border-amber-700 bg-amber-50/20 dark:bg-amber-950/20"
              : "border-slate-200/80 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400">
                <Mail className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                Notification Service (:3003 / :8003)
              </span>
            </div>
            {(activeFaults["notif-delay"] || activeFaults["notif-error"]) && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.2 rounded">
                Active
              </span>
            )}
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Queue Backlog Delay */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] block">
                    Queue Backlog Delay
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Artificially buffers async dispatch
                  </span>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(activeFaults["notif-delay"])}
                    onChange={(e) =>
                      onToggleFault("notif-delay", e.target.checked, { delayMs: queueDelayVal })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {activeFaults["notif-delay"] && (
                <div className="pt-1.5 flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    {queueDelayVal}ms
                  </span>
                  <input
                    type="range"
                    min="1000"
                    max="5000"
                    step="500"
                    value={queueDelayVal}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setQueueDelayVal(val);
                      onToggleFault("notif-delay", true, { delayMs: val });
                    }}
                    className="flex-1 accent-blue-600 h-1 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Queue Worker Error */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <div>
                <span className="font-semibold text-red-700 dark:text-red-400 text-[11px] block">
                  Retry Exhaustion
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Dead-letter exchange rejection
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={Boolean(activeFaults["notif-error"])}
                  onChange={(e) => onToggleFault("notif-error", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* 4. API Gateway Faults */}
        <div
          className={`p-3.5 rounded-xl border transition-all ${
            activeFaults["gateway-error"]
              ? "border-amber-300 dark:border-amber-700 bg-amber-50/20 dark:bg-amber-950/20"
              : "border-slate-200/80 dark:border-slate-700/80 bg-slate-50/40 dark:bg-slate-900/40"
          }`}
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-800 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <Server className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                API Gateway (:8080 / :8000)
              </span>
            </div>
            {activeFaults["gateway-error"] && (
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.2 rounded">
                Active
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="font-semibold text-red-700 dark:text-red-400 text-[11px] block">
                HTTP 504 Gateway Timeout
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Aborts incoming requests at ingress
              </span>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={Boolean(activeFaults["gateway-error"])}
                onChange={(e) => onToggleFault("gateway-error", e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-600"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
