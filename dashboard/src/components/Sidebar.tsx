import React from "react";
import {
  Activity,
  Layers,
  ListTree,
  ShieldCheck,
  ShieldAlert,
  ZapOff,
  FileText,
  Server,
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  systemStatus: "UP" | "DEGRADED" | "DOWN";
  firingAlertCount: number;
  activeFaultCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  systemStatus,
  firingAlertCount,
  activeFaultCount,
}) => {
  const navItems = [
    {
      id: "overview",
      label: "Dashboard",
      icon: Activity,
      tooltip: "Unified 2-Column RED Overview",
    },
    {
      id: "topology",
      label: "Topology",
      icon: Layers,
      tooltip: "Microservice Dependency Mesh",
    },
    {
      id: "traces",
      label: "Traces",
      icon: ListTree,
      tooltip: "Distributed Waterfall Traces",
    },
    {
      id: "slos",
      label: "SLOs",
      icon: ShieldCheck,
      tooltip: "Error Budget Burn Rates",
    },
    {
      id: "incidents",
      label: "Alerts",
      icon: ShieldAlert,
      tooltip: "Prometheus Incident Timeline",
      badge: firingAlertCount,
      badgeColor: "bg-red-500 text-white",
    },
    {
      id: "faults",
      label: "Chaos Lab",
      icon: ZapOff,
      tooltip: "Fault Injection Controls",
      badge: activeFaultCount,
      badgeColor: "bg-amber-500 text-white",
    },
    {
      id: "logs",
      label: "Logs",
      icon: FileText,
      tooltip: "Loki Structured Logs",
    },
  ];

  return (
    <aside className="w-16 md:w-56 bg-white dark:bg-[#1e293b] border-r border-slate-200/80 dark:border-slate-800 flex flex-col justify-between shrink-0 select-none z-30 transition-colors duration-200">
      {/* Top Section: Brand & Icon Navigation */}
      <div className="flex flex-col">
        {/* Brand / Logo Header */}
        <div className="h-16 flex items-center px-4 md:px-5 border-b border-slate-100 dark:border-slate-800 gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20 shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="hidden md:flex flex-col">
            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight flex items-center gap-1.5">
              MicroWatch
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                SaaS
              </span>
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              Observability
            </span>
          </div>
        </div>

        {/* Icon-First Navigation Dock */}
        <nav className="p-2 md:p-3 space-y-1">
          <div className="hidden md:block px-3 py-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Navigation
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={item.tooltip}
                className={`w-full flex items-center justify-center md:justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all group relative ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-l-4 md:border-l-0 md:border border-blue-200/90 dark:border-blue-700/60 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200"
                    }`}
                  />
                  <span className="hidden md:inline font-medium">{item.label}</span>
                </div>

                {/* Badge for Alerts & Faults */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`hidden md:inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      item.badgeColor || "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {/* Mobile / Collapsed Dot Indicator */}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="md:hidden absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Health & Ports Section */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="hidden md:flex items-center justify-between text-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Mesh Health</span>
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              systemStatus === "UP"
                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
                : systemStatus === "DEGRADED"
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
                : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/60"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                systemStatus === "UP"
                  ? "bg-emerald-500 animate-pulse"
                  : systemStatus === "DEGRADED"
                  ? "bg-amber-500 animate-pulse"
                  : "bg-red-500 animate-pulse"
              }`}
            />
            {systemStatus === "UP" ? "Operational" : systemStatus === "DEGRADED" ? "Degraded" : "Incident"}
          </span>
        </div>

        <div className="hidden md:flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono pt-1 border-t border-slate-200/60 dark:border-slate-800">
          <span>Ports</span>
          <span className="text-slate-600 dark:text-slate-400">:8080 :3000 :3002</span>
        </div>

        {/* Mobile Status Dot */}
        <div className="md:hidden flex justify-center py-1">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              systemStatus === "UP"
                ? "bg-emerald-500"
                : systemStatus === "DEGRADED"
                ? "bg-amber-500"
                : "bg-red-500"
            }`}
          />
        </div>
      </div>
    </aside>
  );
};
