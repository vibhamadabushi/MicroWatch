import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Package,
  Boxes,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowUpDown,
  ShieldAlert,
  ShieldCheck,
  Zap,
  ZapOff,
  ExternalLink,
  Clock,
  Server,
  BarChart3,
  FileText,
  ListTree,
  Send,
  RotateCcw,
  Info,
} from "lucide-react";
import { api } from "../services/api";
import {
  InventoryItem,
  InventoryVerifyRequest,
  InventoryVerifyResult,
  InventoryFaultStatus,
  ServiceHealth,
  LogEntry,
} from "../types";

interface InventoryControlCenterProps {
  onFilterTrace?: (traceId: string) => void;
}

interface SessionEvent {
  id: string;
  timestamp: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  details?: string;
  traceId?: string;
}

export const InventoryControlCenter: React.FC<InventoryControlCenterProps> = ({
  onFilterTrace,
}) => {
  // Inventory Data State
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [totalProducts, setTotalProducts] = useState<number>(7);
  const [isLoadingStock, setIsLoadingStock] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [serviceHealth, setServiceHealth] = useState<ServiceHealth>({
    name: "inventory-service",
    url: "http://localhost:8004",
    status: "UP",
    latencyMs: 12,
  });

  // Table Filters & Sorting
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [stockLevelFilter, setStockLevelFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"id" | "name" | "stock">("id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Stock Verification Form State
  const [selectedItemSku, setSelectedItemSku] = useState<string>("PROD-101");
  const [verifyQuantity, setVerifyQuantity] = useState<number>(2);
  const [orderId, setOrderId] = useState<string>(
    `ORD-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [customerId, setCustomerId] = useState<string>("CUST-1042");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] =
    useState<InventoryVerifyResult | null>(null);

  // Fault Injection Lab State
  const [faultStatus, setFaultStatus] = useState<InventoryFaultStatus>({
    simulateServiceUnavailable: false,
    errorCode: 503,
  });
  const [isUpdatingFault, setIsUpdatingFault] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [pendingFaultAction, setPendingFaultAction] = useState<"enable" | "disable" | null>(null);

  // Session Activity Audit Log
  const [sessionEvents, setSessionEvents] = useState<SessionEvent[]>([
    {
      id: "evt-init",
      timestamp: new Date().toLocaleTimeString(),
      type: "info",
      title: "Inventory Control Center initialized",
      details: "Connected to inventory-service:8004 via MicroWatch telemetry mesh.",
    },
  ]);

  // Observability State
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);

  const addSessionEvent = useCallback((event: Omit<SessionEvent, "id" | "timestamp">) => {
    setSessionEvents((prev) => [
      {
        ...event,
        id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
      },
      ...prev.slice(0, 19),
    ]);
  }, []);

  // Fetch full inventory stock
  const loadInventoryData = useCallback(async () => {
    setIsLoadingStock(true);
    try {
      const data = await api.getInventoryStock();
      if (data && data.stock) {
        const productList: InventoryItem[] = Object.entries(data.stock).map(
          ([key, val]) => {
            let category = "Demo Catalog";
            if (val.id.startsWith("PROD-")) category = "Telemetry Hardware";
            else if (val.id.startsWith("ITEM-1")) category = "Sensors & Probes";
            else if (val.id.includes("PIZZA")) category = "Food App Catalog";

            return {
              id: val.id || key,
              name: val.name || key,
              stock: Number(val.stock) || 0,
              category,
            };
          }
        );
        setItems(productList);
        setTotalProducts(data.totalProducts || productList.length);
      }
    } catch {
      // Fallback
    } finally {
      setIsLoadingStock(false);
      setLastRefreshed(new Date());
    }
  }, []);

  // Fetch fault status
  const loadFaultStatus = useCallback(async () => {
    try {
      const status = await api.getInventoryFaultConfig();
      setFaultStatus(status);
    } catch {}
  }, []);

  // Fetch health
  const checkServiceHealth = useCallback(async () => {
    try {
      const services = await api.getServicesStatus();
      const inv = services.find((s) => s.name === "inventory-service");
      if (inv) {
        setServiceHealth(inv);
      }
    } catch {}
  }, []);

  // Fetch recent Loki logs for inventory-service
  const loadInventoryLogs = useCallback(async () => {
    setIsLoadingLogs(true);
    try {
      const logs = await api.getLogs({ "inventory-error": faultStatus.simulateServiceUnavailable });
      const invLogs = logs.filter((l) => l.service === "inventory-service");
      setRecentLogs(invLogs.slice(0, 8));
    } catch {} finally {
      setIsLoadingLogs(false);
    }
  }, [faultStatus.simulateServiceUnavailable]);

  // Combined refresh
  const handleFullRefresh = useCallback(async () => {
    await Promise.allSettled([
      loadInventoryData(),
      loadFaultStatus(),
      checkServiceHealth(),
      loadInventoryLogs(),
    ]);
  }, [loadInventoryData, loadFaultStatus, checkServiceHealth, loadInventoryLogs]);

  useEffect(() => {
    handleFullRefresh();
    const interval = setInterval(handleFullRefresh, 5000);
    return () => clearInterval(interval);
  }, [handleFullRefresh]);

  // Handle Stock Verification Submit
  const handleVerifyStock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedItemSku || verifyQuantity < 1 || isVerifying) return;

    setIsVerifying(true);
    setVerificationResult(null);

    const payload: InventoryVerifyRequest = {
      item: selectedItemSku,
      quantity: Number(verifyQuantity),
      orderId: orderId.trim() || `ORD-${Math.floor(1000 + Math.random() * 9000)}`,
      customerId: customerId.trim() || "CUST-1042",
    };

    try {
      const res = await api.verifyInventoryStock(payload);
      setVerificationResult(res);

      if (res.statusCode === 200) {
        addSessionEvent({
          type: "success",
          title: `Stock Verified: ${selectedItemSku} (Qty: ${verifyQuantity})`,
          details: `Order: ${payload.orderId} - HTTP 200 OK. Remaining stock: ${res.items?.[0]?.availableStock ?? "verified"}.`,
          traceId: res.traceId,
        });
      } else if (res.statusCode === 422) {
        addSessionEvent({
          type: "warning",
          title: `Stock Insufficient: ${selectedItemSku}`,
          details: res.message || "Requested quantity exceeds available stock.",
          traceId: res.traceId,
        });
      } else if (res.statusCode === 503) {
        addSessionEvent({
          type: "error",
          title: `Fault Triggered: HTTP 503 Outage`,
          details: `Verification failed due to simulated database connection pool failure on inventory-service.`,
          traceId: res.traceId,
        });
      } else {
        addSessionEvent({
          type: "error",
          title: `Verification Error (HTTP ${res.statusCode})`,
          details: res.message,
          traceId: res.traceId,
        });
      }

      // Refresh stock table after successful order verification
      if (res.statusCode === 200) {
        loadInventoryData();
      }
    } catch (err: any) {
      setVerificationResult({
        success: false,
        statusCode: 500,
        message: err.message || "Network error while connecting to inventory service",
        orderId: payload.orderId,
        timestamp: new Date().toISOString(),
      });
      addSessionEvent({
        type: "error",
        title: "Verification Request Failed",
        details: err.message,
      });
    } finally {
      setIsVerifying(false);
      checkServiceHealth();
      loadInventoryLogs();
    }
  };

  // Fault Toggle Handlers
  const triggerFaultAction = async (action: "enable" | "disable") => {
    setIsUpdatingFault(true);
    setShowConfirmModal(false);
    setPendingFaultAction(null);

    const isEnabling = action === "enable";

    try {
      await api.toggleInventoryFault(isEnabling);
      setFaultStatus({
        simulateServiceUnavailable: isEnabling,
        errorCode: 503,
      });

      addSessionEvent({
        type: isEnabling ? "error" : "success",
        title: isEnabling
          ? "Injected Chaos Fault: HTTP 503 Service Unavailable"
          : "Fault Cleared: Normal Service Restored",
        details: isEnabling
          ? "Simulated infrastructure outage activated. Stock verification calls will now return HTTP 503 and trigger error spans in Jaeger."
          : "All stock verification faults cleared. Database connection pool simulated as restored.",
      });

      // Quick refresh to update health badge and observability signals
      setTimeout(() => {
        checkServiceHealth();
        loadFaultStatus();
        loadInventoryLogs();
      }, 500);
    } catch (err: any) {
      addSessionEvent({
        type: "error",
        title: "Failed to toggle fault",
        details: err.message,
      });
    } finally {
      setIsUpdatingFault(false);
    }
  };

  // Derived Summary Metrics
  const totalStockUnits = useMemo(() => {
    return items.reduce((acc, curr) => acc + (Number(curr.stock) || 0), 0);
  }, [items]);

  const lowStockCount = useMemo(() => {
    return items.filter((item) => item.stock <= 100).length;
  }, [items]);

  const uniqueCategories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [items]);

  // Filtered & Sorted Stock Table Items
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const matchesQuery =
          item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory =
          categoryFilter === "ALL" || item.category === categoryFilter;
        const matchesStock =
          stockLevelFilter === "ALL" ||
          (stockLevelFilter === "LOW" && item.stock <= 100) ||
          (stockLevelFilter === "NORMAL" && item.stock > 100);

        return matchesQuery && matchesCategory && matchesStock;
      })
      .sort((a, b) => {
        let valA: string | number = a[sortBy] ?? "";
        let valB: string | number = b[sortBy] ?? "";

        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();

        if (valA < valB) return sortOrder === "asc" ? -1 : 1;
        if (valA > valB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [items, searchQuery, categoryFilter, stockLevelFilter, sortBy, sortOrder]);

  const toggleSort = (column: "id" | "name" | "stock") => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Confirmation Modal for Fault Triggering */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Confirm Chaos Injection
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Simulate HTTP 503 Infrastructure Outage
                </p>
              </div>
            </div>

            <div className="bg-amber-50/50 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-200/60 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-300 space-y-2">
              <p>
                This will trigger an artificial <strong>HTTP 503 Service Unavailable</strong> error on{" "}
                <code className="font-mono text-[11px] bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">
                  POST /api/inventory/verify
                </code>.
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                ⚠️ All downstream checkout orders verifying stock will fail immediately until disabled.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  setPendingFaultAction(null);
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => triggerFaultAction("enable")}
                className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm shadow-red-500/20"
              >
                Inject Fault Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors duration-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                  Inventory Control Center
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-semibold">
                  Port :8004
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Real-time stock catalog management, fulfillment verification, and chaos resilience lab.
              </p>
            </div>
          </div>
        </div>

        {/* Right Badges & Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Real Service Health Indicator */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
              serviceHealth.status === "UP" && !faultStatus.simulateServiceUnavailable
                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60"
                : serviceHealth.status === "DEGRADED" || faultStatus.simulateServiceUnavailable
                ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/60"
                : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/60"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                serviceHealth.status === "UP" && !faultStatus.simulateServiceUnavailable
                  ? "bg-emerald-500 animate-pulse"
                  : serviceHealth.status === "DEGRADED" || faultStatus.simulateServiceUnavailable
                  ? "bg-amber-500 animate-pulse"
                  : "bg-red-500"
              }`}
            />
            <span>
              {faultStatus.simulateServiceUnavailable
                ? "DEGRADED (Fault Active)"
                : serviceHealth.status === "UP"
                ? "SERVICE UP"
                : "SERVICE DEGRADED"}
            </span>
            <span className="text-[10px] font-mono opacity-80">
              ({serviceHealth.latencyMs}ms)
            </span>
          </div>

          {/* Last Refreshed */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>{lastRefreshed.toLocaleTimeString()}</span>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={handleFullRefresh}
            disabled={isLoadingStock}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-sm"
            title="Refresh Stock & Reliability Signals"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 ${
                isLoadingStock ? "animate-spin" : ""
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Overview Cards (4 Grid Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Service Status */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm space-y-2 transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Service Uptime</span>
            <Server className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {faultStatus.simulateServiceUnavailable ? "503 Fault" : "100% UP"}
            </span>
            <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
              Port :8004
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Prometheus scraped every 5s • Express Node.js
          </p>
        </div>

        {/* Card 2: Total SKUs */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm space-y-2 transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Catalog SKUs</span>
            <Package className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {totalProducts}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              unique products
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Verified items in backend memory store
          </p>
        </div>

        {/* Card 3: Total Stock Units */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm space-y-2 transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Available Stock</span>
            <Boxes className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {totalStockUnits.toLocaleString()}
            </span>
            <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
              units
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Aggregated warehouse quantities
          </p>
        </div>

        {/* Card 4: Low Stock Warnings */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-sm space-y-2 transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Low Stock Alerts</span>
            <AlertTriangle
              className={`w-4 h-4 ${
                lowStockCount > 0 ? "text-amber-500" : "text-slate-400"
              }`}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              {lowStockCount}
            </span>
            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
              items ≤ 100 units
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {lowStockCount > 0
              ? "Reorder recommended for flagged SKUs"
              : "Healthy inventory margins"}
          </p>
        </div>
      </div>

      {/* Main Content Grid: Stock Catalog Table (Left) + Interactive Verification Form (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Stock Management Table */}
        <div className="lg:col-span-7 bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden transition-colors duration-200">
          {/* Table Header & Search/Filter Controls */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Product Inventory Catalog
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Data sourced live from <code className="font-mono text-[10px]">GET /api/inventory/stock</code>
                </p>
              </div>

              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {filteredItems.length} of {items.length} items
              </span>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by SKU or Product name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-1.5">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">All Categories</option>
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                {/* Stock Level Filter */}
                <select
                  value={stockLevelFilter}
                  onChange={(e) => setStockLevelFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="ALL">All Stock</option>
                  <option value="NORMAL">In Stock (&gt;100)</option>
                  <option value="LOW">Low Stock (≤100)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Body */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800 select-none">
                <tr>
                  <th
                    onClick={() => toggleSort("id")}
                    className="py-2.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    <div className="flex items-center gap-1">
                      <span>SKU</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort("name")}
                    className="py-2.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    <div className="flex items-center gap-1">
                      <span>Product Name</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th
                    onClick={() => toggleSort("stock")}
                    className="py-2.5 px-4 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    <div className="flex items-center gap-1">
                      <span>Available</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {isLoadingStock && items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-blue-500" />
                      Loading catalog from inventory service...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No products match your current search and filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isLow = item.stock <= 100;
                    const isSelected = selectedItemSku === item.id;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors ${
                          isSelected ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-blue-600 dark:text-blue-400">
                          {item.id}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {item.name}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            {item.category}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {item.stock}
                            </span>
                            <div className="w-16 bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  isLow ? "bg-amber-500" : "bg-emerald-500"
                                }`}
                                style={{
                                  width: `${Math.min(100, (item.stock / 500) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isLow
                                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                            }`}
                          >
                            {isLow ? "LOW STOCK" : "IN STOCK"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedItemSku(item.id);
                              setVerifyQuantity(1);
                            }}
                            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors border border-blue-200 dark:border-blue-900/60"
                          >
                            Select & Verify
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (5 cols): Interactive Stock Verification Form & Result */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-4 transition-colors duration-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Live Stock Verification Form
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Dispatches a verification transaction to{" "}
                <code className="font-mono text-[10px]">POST /api/inventory/verify</code>
              </p>
            </div>

            <form onSubmit={handleVerifyStock} className="space-y-3.5 text-xs">
              {/* Product SKU Selector */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Target Product SKU
                </label>
                <select
                  value={selectedItemSku}
                  onChange={(e) => setSelectedItemSku(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} — {item.name} ({item.stock} in stock)
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity and Order ID */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99999"
                    value={verifyQuantity}
                    onChange={(e) => setVerifyQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>Order ID</span>
                    <button
                      type="button"
                      onClick={() => setOrderId(`ORD-${Math.floor(1000 + Math.random() * 9000)}`)}
                      className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Randomize
                    </button>
                  </label>
                  <input
                    type="text"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Customer ID */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-700 dark:text-slate-300">
                  Customer ID
                </label>
                <input
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm shadow-blue-500/20 disabled:opacity-50"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Stock with Microservice...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Verify Stock & Reserve</span>
                  </>
                )}
              </button>
            </form>

            {/* Live Result Panel */}
            {verificationResult && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 animate-in fade-in duration-150 ${
                  verificationResult.statusCode === 200
                    ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                    : verificationResult.statusCode === 422
                    ? "bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200"
                    : "bg-red-50/50 dark:bg-red-950/20 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold">
                    {verificationResult.statusCode === 200 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : verificationResult.statusCode === 422 ? (
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    )}
                    <span>
                      {verificationResult.statusCode === 200
                        ? "Verification Succeeded (200 OK)"
                        : verificationResult.statusCode === 422
                        ? "Insufficient Stock (422)"
                        : `Service Failure (${verificationResult.statusCode})`}
                    </span>
                  </div>

                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white/70 dark:bg-black/30">
                    HTTP {verificationResult.statusCode}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed">
                  {verificationResult.message}
                </p>

                {/* Details Breakdown */}
                {verificationResult.items && verificationResult.items.length > 0 && (
                  <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800/60 font-mono text-[10px] space-y-1">
                    {verificationResult.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{it.item} (Qty: {it.quantity})</span>
                        <span className="font-bold">Stock Remaining: {it.availableStock}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Trace ID & Links */}
                {verificationResult.traceId && (
                  <div className="pt-2 border-t border-slate-200/40 dark:border-slate-800/40 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                      Trace: {verificationResult.traceId}
                    </span>
                    <a
                      href={`http://localhost:16686/trace/${verificationResult.traceId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1 shrink-0"
                    >
                      <span>View in Jaeger</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chaos & Fault-Injection Lab (Judges Core Feature) */}
      <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-5 transition-colors duration-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ZapOff className="w-4 h-4 text-red-500" />
              Inventory Chaos & Fault-Injection Lab
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Live chaos demonstration for judges: simulate infrastructure-level service outage and verify automated telemetry detection.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                faultStatus.simulateServiceUnavailable
                  ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-300 dark:border-red-800 animate-pulse"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  faultStatus.simulateServiceUnavailable ? "bg-red-500" : "bg-emerald-500"
                }`}
              />
              <span>
                {faultStatus.simulateServiceUnavailable
                  ? "OUTAGE ACTIVE (HTTP 503)"
                  : "BASELINE HEALTH (NORMAL)"}
              </span>
            </span>
          </div>
        </div>

        {/* 2-Column Chaos Control + Presentation Script */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left: Active Controls */}
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-red-500" />
                    Simulate Database Connection Failure (HTTP 503)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Target: <code className="font-mono text-[10px]">inventory-service:8004/api/fault/...</code>
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Injects simulated connection pool exhaustion during stock verification. When active, all incoming{" "}
                <code className="font-mono text-[11px]">/api/inventory/verify</code> calls immediately fail with HTTP 503, increment Prometheus error counters, and stream ERROR logs to Loki.
              </p>

              <div className="pt-2 flex items-center gap-3">
                {faultStatus.simulateServiceUnavailable ? (
                  <button
                    onClick={() => triggerFaultAction("disable")}
                    disabled={isUpdatingFault}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm shadow-emerald-500/20"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Disable Fault & Restore Normal Operation</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowConfirmModal(true)}
                    disabled={isUpdatingFault}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-colors shadow-sm shadow-red-500/20"
                  >
                    <ZapOff className="w-4 h-4" />
                    <span>Inject HTTP 503 Infrastructure Outage</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick presentation tip */}
            <div className="bg-blue-50/50 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-200/60 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">Mentor Evaluation Note:</span>
                <p className="text-[11px] text-blue-700 dark:text-blue-400">
                  Notice how the fault is toggled dynamically in the running container without restarting Docker. Prometheus automatically scrapes the error state on its next 5-second evaluation loop.
                </p>
              </div>
            </div>
          </div>

          {/* Right: Step-by-Step Interactive Demo Walkthrough */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                Live Demonstration Sequence for Mentors
              </h4>

              <ol className="text-xs space-y-2.5 text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    1
                  </span>
                  <span>
                    <strong>Baseline Check:</strong> Submit a stock verification above. Note the green HTTP 200 result and generated W3C trace ID.
                  </span>
                </li>

                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    2
                  </span>
                  <span>
                    <strong>Chaos Injection:</strong> Click "Inject HTTP 503 Outage". The service health indicator immediately shifts to DEGRADED.
                  </span>
                </li>

                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    3
                  </span>
                  <span>
                    <strong>Telemetry Correlation:</strong> Submit another verification. It fails with HTTP 503. Check the Loki logs panel below to see the instant error entry.
                  </span>
                </li>

                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    4
                  </span>
                  <span>
                    <strong>Full Recovery:</strong> Click "Disable Fault". Subsequent requests succeed instantly with no container restarts required.
                  </span>
                </li>
              </ol>
            </div>

            {/* Direct Tool Links */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-semibold text-blue-600 dark:text-blue-400">
              <a
                href="http://localhost:9090/graph?g0.expr=inventory_requests_failed_total"
                target="_blank"
                rel="noreferrer"
                className="hover:underline flex items-center gap-1"
              >
                <span>Prometheus Metric Query</span>
                <ExternalLink className="w-3 h-3" />
              </a>

              <a
                href="http://localhost:16686/search?service=inventory-service"
                target="_blank"
                rel="noreferrer"
                className="hover:underline flex items-center gap-1"
              >
                <span>Jaeger Spans</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Observability Section: Session Activity Log + Live Loki Structured Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session Activity Audit Log */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-3 transition-colors duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              Session Event & Chaos Audit Log
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              {sessionEvents.length} events logged
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {sessionEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-xs space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        evt.type === "success"
                          ? "bg-emerald-500"
                          : evt.type === "warning"
                          ? "bg-amber-500"
                          : evt.type === "error"
                          ? "bg-red-500"
                          : "bg-blue-500"
                      }`}
                    />
                    {evt.title}
                  </span>
                  <span className="font-mono text-slate-400 text-[10px]">
                    {evt.timestamp}
                  </span>
                </div>

                {evt.details && (
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 pl-3.5 leading-relaxed">
                    {evt.details}
                  </p>
                )}

                {evt.traceId && (
                  <div className="pl-3.5 text-[10px] font-mono text-blue-600 dark:text-blue-400">
                    <a
                      href={`http://localhost:16686/trace/${evt.traceId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline flex items-center gap-1"
                    >
                      <span>Trace: {evt.traceId}</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Loki Structured Logs for inventory-service */}
        <div className="bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-3 transition-colors duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              Loki Telemetry Logs (<code className="font-mono text-[11px]">inventory-service</code>)
            </h3>

            <button
              onClick={loadInventoryLogs}
              disabled={isLoadingLogs}
              className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingLogs ? "animate-spin" : ""}`} />
              <span>Fetch Logs</span>
            </button>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto font-mono text-[11px]">
            {recentLogs.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No recent logs found for inventory-service in Loki.
              </div>
            ) : (
              recentLogs.map((log, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-lg border flex items-start gap-2 ${
                    log.level === "error"
                      ? "bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 text-red-900 dark:text-red-300"
                      : log.level === "warn"
                      ? "bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-300"
                      : "bg-slate-50 dark:bg-slate-900/60 border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase shrink-0 ${
                      log.level === "error"
                        ? "bg-red-600 text-white"
                        : log.level === "warn"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-slate-400 text-[10px] shrink-0">
                    {log.timestamp}
                  </span>
                  <span className="truncate flex-1" title={log.message}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
