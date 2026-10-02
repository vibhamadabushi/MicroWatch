import React, { useState, useEffect, useCallback } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { Sidebar } from "./components/Sidebar";
import { Navbar } from "./components/Navbar";
import { RedMetrics, RedMetricCards } from "./components/RedMetrics";
import { TopologyGraph } from "./components/TopologyGraph";
import { TraceViewer } from "./components/TraceViewer";
import { SloMonitor } from "./components/SloMonitor";
import { IncidentTimeline } from "./components/IncidentTimeline";
import { FaultInjectionPanel } from "./components/FaultInjectionPanel";
import { LogsViewer } from "./components/LogsViewer";
import { api } from "./services/api";
import {
  ServiceHealth,
  REDMetricPoint,
  Trace,
  SLOStatus,
  Incident,
  LogEntry,
} from "./types";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";

const DashboardContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [refreshInterval, setRefreshInterval] = useState<number>(2000);
  const [selectedService, setSelectedService] = useState<string>("all");
  const [selectedEnv, setSelectedEnv] = useState<string>("production");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Observability State
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [currentMetric, setCurrentMetric] = useState<REDMetricPoint>({
    timestamp: new Date().toISOString(),
    timeLabel: new Date().toLocaleTimeString(),
    rate: 5.2,
    errorRate: 0,
    p50: 160,
    p90: 230,
    p95: 260,
    p99: 340,
    status2xx: 16,
    status4xx: 0,
    status5xx: 0,
  });
  const [history, setHistory] = useState<REDMetricPoint[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [slos, setSlos] = useState<SLOStatus[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeFaults, setActiveFaults] = useState<Record<string, any>>({});
  const [isBursting, setIsBursting] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type?: "success" | "error" | "info";
  } | null>(null);

  const showToast = (text: string, type: "success" | "error" | "info" = "info") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Primary Polling Function
  const fetchAllData = useCallback(async () => {
    try {
      const [svcData, metricData, traceData] = await Promise.all([
        api.getServicesStatus(),
        api.getREDMetrics(activeFaults),
        api.getTraces(activeFaults),
      ]);

      setServices(svcData);
      setCurrentMetric(metricData.current);
      setHistory(metricData.history);
      setTraces(traceData);

      // Evaluate SLOs and Incidents dynamically based on latest metrics & faults
      const calculatedSlos = api.getSLOStatus(metricData.current);
      setSlos(calculatedSlos);

      const calculatedIncidents = await api.getIncidents(activeFaults, metricData.current);
      setIncidents(calculatedIncidents);

      const logData = await api.getLogs();
      setLogs(logData);
    } catch (err) {
      console.error("Polling error in dashboard:", err);
    }
  }, [activeFaults]);

  // Polling loop
  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAllData, refreshInterval]);

  // Global system status
  const systemStatus =
    incidents.some((i) => i.status === "FIRING" && i.severity === "critical")
      ? "DOWN"
      : incidents.some((i) => i.status === "FIRING") || Object.values(activeFaults).some(Boolean)
      ? "DEGRADED"
      : "UP";

  const firingAlertCount = incidents.filter((i) => i.status === "FIRING").length;
  const activeFaultCount = Object.values(activeFaults).filter(Boolean).length;

  // Actions
  const handleTriggerTraffic = async () => {
    setIsBursting(true);
    showToast("Dispatched 20 checkout requests across microservices mesh...", "info");
    try {
      const res = await api.triggerTrafficBurst(20);
      showToast(`Completed 20 concurrent requests (Status: ${res.completed || 20} OK)`, "success");
      await fetchAllData();
    } catch (e: any) {
      showToast("Traffic burst completed", "info");
    } finally {
      setIsBursting(false);
    }
  };

  const handleToggleFault = async (key: string, enabled: boolean, params: any = {}) => {
    const updated = { ...activeFaults, [key]: enabled ? (params.delayMs || true) : false };
    setActiveFaults(updated);

    let target = "gateway";
    let body: any = { enabled };

    if (key === "payment-delay") {
      target = "payment";
      body = { type: "delay", enabled, delayMs: params.delayMs || 5000 };
    } else if (key === "payment-error") {
      target = "payment";
      body = { type: "error", enabled };
    } else if (key === "order-db") {
      target = "order";
      body = { type: "dbError", enabled };
    } else if (key === "order-delay") {
      target = "order";
      body = { type: "delay", enabled, delayMs: params.delayMs || 3000 };
    } else if (key === "notif-delay") {
      target = "notification";
      body = { type: "queueDelay", enabled, delayMs: params.delayMs || 2500 };
    } else if (key === "notif-error") {
      target = "notification";
      body = { type: "retryError", enabled };
    } else if (key === "gateway-error") {
      target = "gateway";
      body = { type: "error", enabled, errorCode: 504 };
    }

    try {
      await api.injectFault(target, body);
      showToast(
        enabled
          ? `Fault activated on ${target}: ${key}`
          : `Fault cleared on ${target}: ${key}`,
        enabled ? "error" : "success"
      );
      await fetchAllData();
    } catch (e: any) {
      showToast(`Fault state updated for ${target}`, "info");
    }
  };

  const handleResetFaults = async () => {
    setActiveFaults({});
    await api.resetAllFaults();
    showToast("All injected faults have been reset to normal.", "success");
    await fetchAllData();
  };

  const handleFilterTrace = (traceId: string) => {
    setActiveTab("traces");
    setSearchQuery(traceId);
  };

  const handleSelectIncident = (incident: Incident) => {
    setActiveTab("incidents");
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 flex font-sans antialiased transition-colors duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-white dark:bg-[#1e293b] px-4 py-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 shadow-xl flex items-center gap-2.5 animate-in slide-in-from-bottom-2 duration-200">
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : toastMessage.type === "error" ? (
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Slim Left Sidebar Vertical Dock */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        systemStatus={systemStatus}
        firingAlertCount={firingAlertCount}
        activeFaultCount={activeFaultCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <Navbar
          selectedService={selectedService}
          setSelectedService={setSelectedService}
          selectedEnv={selectedEnv}
          setSelectedEnv={setSelectedEnv}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
          isBursting={isBursting}
          onTriggerTraffic={handleTriggerTraffic}
          onResetFaults={handleResetFaults}
          firingAlertCount={firingAlertCount}
          activeFaultCount={activeFaultCount}
          incidents={incidents}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSelectIncident={handleSelectIncident}
        />

        {/* Dynamic Main Body Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
          {/* Default / Primary 2-Column Unified SaaS Dashboard View */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Top Row: RED Metric Cards */}
              <RedMetricCards
                currentMetric={currentMetric}
                firingAlertCount={firingAlertCount}
              />

              {/* Main Content Grid (2 Columns) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column (Primary): Topology Graph + Distributed Trace Breakdown */}
                <div className="lg:col-span-7 flex flex-col space-y-6 min-w-0">
                  {/* Microservice Topology Graph / Request Flow */}
                  <TopologyGraph
                    services={services}
                    activeFaults={activeFaults}
                    onOpenFaults={(svc) => setActiveTab("faults")}
                  />

                  {/* Distributed Trace Breakdown */}
                  <TraceViewer
                    traces={traces}
                    activeFaults={activeFaults}
                    onRefreshTraces={fetchAllData}
                  />
                </div>

                {/* Right Column (Secondary): SLO Error Budget Donuts, Incident Feed, Fault Toggles */}
                <div className="lg:col-span-5 flex flex-col space-y-6 min-w-0">
                  {/* SLO Error Budget Donuts */}
                  <SloMonitor slos={slos} currentMetric={currentMetric} compact={true} />

                  {/* Incident Feed */}
                  <IncidentTimeline
                    incidents={incidents}
                    onSelectServiceTab={(svc) => {
                      setSelectedService(svc);
                    }}
                    compact={true}
                  />

                  {/* Fault Injection Quick Toggles */}
                  <FaultInjectionPanel
                    activeFaults={activeFaults}
                    onToggleFault={handleToggleFault}
                    onResetAll={handleResetFaults}
                    compact={true}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Dedicated Full Views when clicking sidebar navigation */}
          {activeTab === "topology" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <TopologyGraph
                services={services}
                activeFaults={activeFaults}
                onOpenFaults={(svc) => setActiveTab("faults")}
              />
            </div>
          )}

          {activeTab === "traces" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <TraceViewer
                traces={traces}
                activeFaults={activeFaults}
                onRefreshTraces={fetchAllData}
              />
            </div>
          )}

          {activeTab === "slos" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <SloMonitor slos={slos} currentMetric={currentMetric} />
            </div>
          )}

          {activeTab === "incidents" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <IncidentTimeline
                incidents={incidents}
                onSelectServiceTab={(svc) => {
                  setSelectedService(svc);
                  setActiveTab("overview");
                }}
              />
            </div>
          )}

          {activeTab === "faults" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <FaultInjectionPanel
                activeFaults={activeFaults}
                onToggleFault={handleToggleFault}
                onResetAll={handleResetFaults}
              />
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <LogsViewer
                logs={logs}
                onRefresh={fetchAllData}
                onFilterTrace={handleFilterTrace}
              />
            </div>
          )}
        </main>

        {/* Minimalist SaaS Footer */}
        <footer className="border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#1e293b] py-3.5 px-4 sm:px-6 text-xs text-slate-500 dark:text-slate-400 mt-auto transition-colors duration-200">
          <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">MicroWatch Telemetry Stack</span>
              <span>•</span>
              <span>OpenTelemetry + Prometheus + Jaeger + Loki</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Gateway :8080
              </span>
              <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Order :3002
              </span>
              <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Payment :3000
              </span>
              <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                Notification :3003
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <DashboardContent />
    </ThemeProvider>
  );
};

export default App;
