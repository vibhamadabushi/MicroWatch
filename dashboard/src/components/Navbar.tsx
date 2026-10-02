import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Bell,
  Zap,
  RotateCcw,
  ChevronDown,
  Layers,
  Globe,
  CheckCircle2,
  AlertTriangle,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { Incident } from "../types";
import { useTheme } from "../context/ThemeContext";

interface NavbarProps {
  selectedService: string;
  setSelectedService: (svc: string) => void;
  selectedEnv: string;
  setSelectedEnv: (env: string) => void;
  refreshInterval: number;
  setRefreshInterval: (ms: number) => void;
  isBursting: boolean;
  onTriggerTraffic: () => void;
  onResetFaults: () => void;
  firingAlertCount: number;
  activeFaultCount: number;
  incidents: Incident[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSelectIncident?: (incident: Incident) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  selectedService,
  setSelectedService,
  selectedEnv,
  setSelectedEnv,
  refreshInterval,
  setRefreshInterval,
  isBursting,
  onTriggerTraffic,
  onResetFaults,
  firingAlertCount,
  activeFaultCount,
  incidents,
  searchQuery,
  setSearchQuery,
  onSelectIncident,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showIntervalMenu, setShowIntervalMenu] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<HTMLDivElement>(null);

  const firingIncidents = incidents.filter((i) => i.status === "FIRING");

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (intervalRef.current && !intervalRef.current.contains(e.target as Node)) {
        setShowIntervalMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const serviceOptions = [
    { id: "all", label: "All Services (Mesh)" },
    { id: "api-gateway", label: "API Gateway (:8080)" },
    { id: "order-service", label: "Order Service (:3002)" },
    { id: "payment-service", label: "Payment Service (:3000)" },
    { id: "notification-service", label: "Notification Service (:3003)" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 h-16 flex items-center px-4 sm:px-6 justify-between gap-4 transition-colors duration-200">
      {/* Left: Environment Pill & Contextual Service Selector */}
      <div className="flex items-center gap-3">
        {/* Environment Selector Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300">
          <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <select
            value={selectedEnv}
            onChange={(e) => setSelectedEnv(e.target.value)}
            className="bg-transparent border-none text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer pr-1"
          >
            <option value="production" className="dark:bg-slate-900">Prod (us-east-1)</option>
            <option value="staging" className="dark:bg-slate-900">Staging (eu-west-1)</option>
            <option value="local" className="dark:bg-slate-900">Local Mesh</option>
          </select>
        </div>

        {/* Contextual Service Selector */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs">
          <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="bg-transparent border-none text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
          >
            {serviceOptions.map((opt) => (
              <option key={opt.id} value={opt.id} className="dark:bg-slate-900">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Real-time Sync Status Pill */}
        <div className="relative" ref={intervalRef}>
          <button
            onClick={() => setShowIntervalMenu(!showIntervalMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 text-xs font-medium hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 transition-colors"
            title="Adjust scraping frequency"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden md:inline">Live Scrape</span>
            <span className="font-mono text-[11px] font-semibold">{refreshInterval / 1000}s</span>
            <ChevronDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 opacity-70" />
          </button>

          {showIntervalMenu && (
            <div className="absolute left-0 mt-1 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-1 z-50 text-xs animate-in fade-in">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase">
                Scrape Interval
              </div>
              {[
                { label: "Fast (1 sec)", val: 1000 },
                { label: "Normal (2 sec)", val: 2000 },
                { label: "Slow (5 sec)", val: 5000 },
              ].map((item) => (
                <button
                  key={item.val}
                  onClick={() => {
                    setRefreshInterval(item.val);
                    setShowIntervalMenu(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center justify-between ${
                    refreshInterval === item.val
                      ? "bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <span>{item.label}</span>
                  {refreshInterval === item.val && (
                    <CheckCircle2 className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Middle: Search Bar with Keyboard Shortcut */}
      <div className="hidden lg:flex items-center flex-1 max-w-md mx-2">
        <div className="relative w-full">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search traces, endpoints, alerts, or services..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-14 py-1.5 text-xs bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          <div className="absolute right-2.5 top-2 flex items-center">
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-400 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right: Actions, Theme Switcher & Notifications */}
      <div className="flex items-center gap-2">
        {/* Trigger Traffic Burst Button */}
        <button
          onClick={onTriggerTraffic}
          disabled={isBursting}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm active:scale-95 ${
            isBursting
              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 animate-pulse"
              : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
          }`}
          title="Send 20 concurrent requests across microservices"
        >
          <Zap className={`w-3.5 h-3.5 ${isBursting ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{isBursting ? "Bursting..." : "Simulate Traffic"}</span>
        </button>

        {/* Reset Faults Button */}
        <button
          onClick={onResetFaults}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-sm transition-all active:scale-95"
          title="Reset all artificial faults across all microservices"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span className="hidden md:inline">Reset</span>
        </button>

        {/* Light/Dark Mode Switcher */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 transition-colors"
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-amber-400 animate-in spin-in-180 duration-200" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600 animate-in spin-in-180 duration-200" />
          )}
        </button>

        {/* Notification Bell with Dropdown Popover */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 relative transition-colors"
            title="Active Incidents & Alerts"
          >
            <Bell className="w-4 h-4" />
            {firingAlertCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-3 z-50 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  Active Prometheus Alerts ({firingAlertCount})
                </span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
                {firingIncidents.length > 0 ? (
                  firingIncidents.map((inc) => (
                    <div
                      key={inc.id}
                      onClick={() => {
                        if (onSelectIncident) onSelectIncident(inc);
                        setShowNotifications(false);
                      }}
                      className="p-2.5 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200/80 dark:border-red-900/50 hover:bg-red-100/60 dark:hover:bg-red-900/30 cursor-pointer transition-colors text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-red-900 dark:text-red-300 font-mono text-[11px]">
                          {inc.alertName}
                        </span>
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase">
                          {inc.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5 line-clamp-1">
                        {inc.summary}
                      </p>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1 block">
                        Service: {inc.service} • Started {inc.startedAt}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                    All systems healthy. No active alerts firing.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
