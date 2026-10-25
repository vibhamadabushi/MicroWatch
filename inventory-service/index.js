const {
  exporter,
  totalRequestsCounter,
  failedRequestsCounter,
  stockCheckDuration,
  stockRejectionsCounter,
  stockAdjustmentsCounter,
} = require("./telemetry");
const logger = require("./logger");

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { trace, context } = require("@opentelemetry/api");

const app = express();
app.use(cors());
app.use(express.json());

// Persistent Data Storage Paths
const DATA_DIR = path.join(__dirname, "data");
const STOCK_FILE = path.join(DATA_DIR, "inventory-stock.json");
const HISTORY_FILE = path.join(DATA_DIR, "inventory-history.json");

// Default initial seed catalog (preserving all existing IDs and names)
const initialSeedCatalog = {
  "PROD-101": {
    id: "PROD-101",
    name: "High-Frequency Telemetry Probe",
    category: "Telemetry Hardware",
    price: 89.99,
    stock: 150,
    reorderThreshold: 25,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "PROD-102": {
    id: "PROD-102",
    name: "OTel Distributed Span Collector",
    category: "Observability Agents",
    price: 120.00,
    stock: 120,
    reorderThreshold: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "PROD-103": {
    id: "PROD-103",
    name: "Prometheus Metric Scraper Node",
    category: "Monitoring Nodes",
    price: 45.50,
    stock: 80,
    reorderThreshold: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "PROD-104": {
    id: "PROD-104",
    name: "Loki Log Aggregator Agent",
    category: "Observability Agents",
    price: 65.00,
    stock: 200,
    reorderThreshold: 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "ITEM-1": {
    id: "ITEM-1",
    name: "MicroWatch Pro Sensor",
    category: "Sensors & Probes",
    price: 49.99,
    stock: 350,
    reorderThreshold: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "Standard Item": {
    id: "ITEM-STD",
    name: "Standard Item",
    category: "Demo Catalog",
    price: 29.99,
    stock: 500,
    reorderThreshold: 50,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "Test Pizza": {
    id: "ITEM-PIZZA",
    name: "Test Pizza",
    category: "Food App Catalog",
    price: 18.99,
    stock: 100,
    reorderThreshold: 20,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "FOOD-101": {
    id: "FOOD-101",
    name: "Margherita Artisan Pizza",
    category: "Food App Catalog",
    price: 14.99,
    stock: 8,
    reorderThreshold: 10,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  "FOOD-102": {
    id: "FOOD-102",
    name: "Truffle Tagliatelle",
    category: "Food App Catalog",
    price: 24.50,
    stock: 0,
    reorderThreshold: 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
};

// In-memory runtime state
let inventoryStock = {};
let adjustmentHistory = [];
const orderReservations = {};

// Persistence Helpers
function initPersistence() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STOCK_FILE)) {
      const data = fs.readFileSync(STOCK_FILE, "utf-8");
      inventoryStock = JSON.parse(data);
      logger.info(`Loaded ${Object.keys(inventoryStock).length} products from disk.`);
    } else {
      inventoryStock = JSON.parse(JSON.stringify(initialSeedCatalog));
      fs.writeFileSync(STOCK_FILE, JSON.stringify(inventoryStock, null, 2), "utf-8");
      logger.info("Initialized inventory data file with seed catalog.");
    }

    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, "utf-8");
      adjustmentHistory = JSON.parse(data);
    } else {
      adjustmentHistory = [
        {
          id: "adj-seed-01",
          sku: "FOOD-101",
          productName: "Margherita Artisan Pizza",
          previousQuantity: 15,
          newQuantity: 8,
          change: -7,
          reason: "Demo stock deduction (Low stock indicator demo)",
          timestamp: new Date().toISOString(),
        },
        {
          id: "adj-seed-02",
          sku: "FOOD-102",
          productName: "Truffle Tagliatelle",
          previousQuantity: 10,
          newQuantity: 0,
          change: -10,
          reason: "Inventory depletion (Out of stock indicator demo)",
          timestamp: new Date().toISOString(),
        },
      ];
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(adjustmentHistory, null, 2), "utf-8");
    }
  } catch (err) {
    logger.error(`Failed to initialize persistence: ${err.message}. Falling back to in-memory.`);
    inventoryStock = JSON.parse(JSON.stringify(initialSeedCatalog));
  }
}

function saveStateToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STOCK_FILE, JSON.stringify(inventoryStock, null, 2), "utf-8");
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(adjustmentHistory, null, 2), "utf-8");
  } catch (err) {
    logger.error(`Error saving inventory state to disk: ${err.message}`);
  }
}

initPersistence();

// Product Lookup & Summary Helpers
function findInventoryItem(idOrName) {
  if (!idOrName) return null;
  const rawKey = String(idOrName).trim();
  if (inventoryStock[rawKey]) return inventoryStock[rawKey];

  const lower = rawKey.toLowerCase();
  for (const item of Object.values(inventoryStock)) {
    if (item.id && item.id.toLowerCase() === lower) return item;
    if (item.name && item.name.toLowerCase() === lower) return item;
  }
  for (const item of Object.values(inventoryStock)) {
    if (item.name && item.name.toLowerCase().includes(lower)) return item;
  }
  return null;
}

function calculateStockSummary() {
  const items = Object.values(inventoryStock);
  let totalUnits = 0;
  let lowStockProducts = 0;
  let outOfStockProducts = 0;
  let inStockProducts = 0;

  for (const item of items) {
    const qty = Number(item.stock) || 0;
    const threshold = Number(item.reorderThreshold) || 10;
    totalUnits += qty;

    if (qty === 0) {
      outOfStockProducts++;
    } else if (qty <= threshold) {
      lowStockProducts++;
    } else {
      inStockProducts++;
    }
  }

  return {
    totalProducts: items.length,
    totalUnits,
    lowStockProducts,
    outOfStockProducts,
    inStockProducts,
  };
}

function recordStockAdjustment(sku, productName, previousQuantity, newQuantity, reason, orderId = null) {
  const change = newQuantity - previousQuantity;
  const entry = {
    id: `adj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    sku,
    productName,
    previousQuantity,
    newQuantity,
    change,
    reason: reason || "Manual stock adjustment",
    orderId,
    timestamp: new Date().toISOString(),
  };

  adjustmentHistory.unshift(entry);
  if (adjustmentHistory.length > 200) adjustmentHistory.pop();
  stockAdjustmentsCounter.add(1);
  return entry;
}

// Fault Injection Configuration
let faultConfig = {
  simulateServiceUnavailable: false,
  errorCode: 503,
};

// Middleware: Trace context extraction and correlation
app.use((req, res, next) => {
  const currentSpan = trace.getSpan(context.active());
  const traceId = currentSpan ? currentSpan.spanContext().traceId : null;
  const spanId = currentSpan ? currentSpan.spanContext().spanId : null;

  req.traceId = traceId;
  req.spanId = spanId;

  if (traceId) {
    res.setHeader("x-trace-id", traceId);
  }

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      traceId,
      spanId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
    });
  });

  next();
});

// 0. Prometheus Metrics Endpoint
app.get("/metrics", (req, res) => {
  exporter.getMetricsRequestHandler(req, res);
});

// 1. Health Endpoints
app.get(["/health", "/api/inventory/health", "/api/health"], (req, res) => {
  const summary = calculateStockSummary();
  const isDegraded = faultConfig.simulateServiceUnavailable;
  const statusCode = isDegraded ? 503 : 200;

  res.status(statusCode).json({
    status: isDegraded ? "DEGRADED" : "UP",
    service: "inventory-service",
    itemCount: summary.totalProducts,
    totalUnits: summary.totalUnits,
    lowStockCount: summary.lowStockProducts,
    outOfStockCount: summary.outOfStockProducts,
    faultConfig,
    timestamp: new Date().toISOString(),
  });
});

// 2. Fault Config & Control Endpoints
app.get(["/api/fault-config", "/api/fault/status"], (req, res) => {
  res.json(faultConfig);
});

app.post("/api/fault/enable", (req, res) => {
  faultConfig.simulateServiceUnavailable = true;
  faultConfig.errorCode = 503;

  logger.warn("Inventory service fault injection enabled: HTTP 503 Service Unavailable", {
    service: "inventory-service",
    faultType: "service_unavailable",
    statusCode: 503,
  });

  res.json({
    success: true,
    message: "Inventory stock verification fault (HTTP 503) enabled",
    currentConfig: faultConfig,
  });
});

app.post("/api/fault/disable", (req, res) => {
  faultConfig.simulateServiceUnavailable = false;

  logger.info("Inventory service fault injection disabled: normal operation resumed", {
    service: "inventory-service",
    faultType: "service_unavailable",
  });

  res.json({
    success: true,
    message: "Inventory stock verification fault disabled",
    currentConfig: faultConfig,
  });
});

// Backwards-compatible /api/fault-inject
app.post("/api/fault-inject", (req, res) => {
  const { type, enabled } = req.body || {};

  if (type === "serviceUnavailable" || type === "error" || type === "inventory-error") {
    faultConfig.simulateServiceUnavailable = Boolean(enabled);
  } else if (type === "reset" || type === "all") {
    faultConfig.simulateServiceUnavailable = false;
  }

  logger.info(`[inventory-service] Fault config updated: ${JSON.stringify(faultConfig)}`);

  res.json({
    service: "inventory-service",
    message: "Fault configuration updated",
    currentConfig: faultConfig,
  });
});

// 3. Stock Inventory Overview Route (Backward-Compatible with MicroWatch Dashboard)
app.get(["/api/inventory/stock", "/api/inventory/overview"], (req, res) => {
  const summary = calculateStockSummary();
  res.json({
    service: "inventory-service",
    totalProducts: summary.totalProducts,
    totalUnits: summary.totalUnits,
    lowStockProducts: summary.lowStockProducts,
    outOfStockProducts: summary.outOfStockProducts,
    inStockProducts: summary.inStockProducts,
    items: Object.values(inventoryStock),
    stock: inventoryStock,
  });
});

// 4. Inventory CRUD Endpoints

// List all inventory items with optional search, category, and status filter
app.get("/api/inventory/items", (req, res) => {
  const { search, category, status, sortBy, sortOrder } = req.query;
  let items = Object.values(inventoryStock);

  if (search) {
    const q = search.toLowerCase();
    items = items.filter(
      (it) =>
        (it.name && it.name.toLowerCase().includes(q)) ||
        (it.id && it.id.toLowerCase().includes(q)) ||
        (it.category && it.category.toLowerCase().includes(q))
    );
  }

  if (category && category !== "ALL") {
    items = items.filter((it) => it.category && it.category.toLowerCase() === category.toLowerCase());
  }

  if (status && status !== "ALL") {
    items = items.filter((it) => {
      const qty = Number(it.stock) || 0;
      const th = Number(it.reorderThreshold) || 10;
      if (status === "OUT_OF_STOCK") return qty === 0;
      if (status === "LOW_STOCK") return qty > 0 && qty <= th;
      if (status === "IN_STOCK") return qty > th;
      return true;
    });
  }

  if (sortBy) {
    const order = sortOrder === "desc" ? -1 : 1;
    items.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name) * order;
      if (sortBy === "price") return ((Number(a.price) || 0) - (Number(b.price) || 0)) * order;
      if (sortBy === "stock") return ((Number(a.stock) || 0) - (Number(b.stock) || 0)) * order;
      if (sortBy === "id") return a.id.localeCompare(b.id) * order;
      return 0;
    });
  }

  res.json({
    success: true,
    summary: calculateStockSummary(),
    count: items.length,
    items,
  });
});

// Get single inventory item by ID/SKU
app.get("/api/inventory/items/:id", (req, res) => {
  const item = findInventoryItem(req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, error: "ItemNotFound", message: "Inventory item not found" });
  }

  const history = adjustmentHistory.filter((h) => h.sku === item.id);
  res.json({ success: true, item, history });
});

// Create a new inventory item
app.post("/api/inventory/items", (req, res) => {
  const { id, sku, name, category, price, stock, reorderThreshold } = req.body || {};
  const productSku = (sku || id || "").trim().toUpperCase();
  const productName = (name || "").trim();
  const productCategory = (category || "General").trim();
  const numPrice = Number(price);
  const numStock = Number(stock);
  const numThreshold = Number(reorderThreshold !== undefined ? reorderThreshold : 10);

  // Validation
  if (!productSku) {
    return res.status(400).json({ success: false, error: "ValidationError", message: "SKU or Product ID is required" });
  }
  if (!productName) {
    return res.status(400).json({ success: false, error: "ValidationError", message: "Product name is required" });
  }
  if (isNaN(numPrice) || numPrice <= 0) {
    return res.status(400).json({ success: false, error: "ValidationError", message: "Price must be a positive number" });
  }
  if (isNaN(numStock) || numStock < 0 || !Number.isInteger(numStock)) {
    return res.status(400).json({ success: false, error: "ValidationError", message: "Available stock must be a non-negative integer" });
  }
  if (isNaN(numThreshold) || numThreshold < 0 || !Number.isInteger(numThreshold)) {
    return res.status(400).json({ success: false, error: "ValidationError", message: "Reorder threshold must be a non-negative integer" });
  }

  // Check unique SKU
  const existing = findInventoryItem(productSku);
  if (existing) {
    return res.status(409).json({ success: false, error: "DuplicateSKU", message: `A product with SKU '${productSku}' already exists.` });
  }

  const newItem = {
    id: productSku,
    name: productName,
    category: productCategory,
    price: Number(numPrice.toFixed(2)),
    stock: numStock,
    reorderThreshold: numThreshold,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  inventoryStock[productSku] = newItem;
  recordStockAdjustment(productSku, productName, 0, numStock, "Initial product creation");
  saveStateToDisk();

  logger.info(`Created new inventory item: ${productSku} - ${productName}`, {
    service: "inventory-service",
    sku: productSku,
    stock: numStock,
    price: numPrice,
  });

  res.status(201).json({
    success: true,
    message: `Product '${productName}' (${productSku}) created successfully`,
    item: newItem,
  });
});

// Update product metadata (name, category, price, reorderThreshold)
app.put("/api/inventory/items/:id", (req, res) => {
  const item = findInventoryItem(req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, error: "ItemNotFound", message: "Inventory item not found" });
  }

  const { name, category, price, reorderThreshold } = req.body || {};
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) return res.status(400).json({ success: false, error: "ValidationError", message: "Name cannot be empty" });
    item.name = trimmed;
  }
  if (category !== undefined) {
    const trimmed = String(category).trim();
    if (!trimmed) return res.status(400).json({ success: false, error: "ValidationError", message: "Category cannot be empty" });
    item.category = trimmed;
  }
  if (price !== undefined) {
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ success: false, error: "ValidationError", message: "Price must be a positive number" });
    }
    item.price = Number(numPrice.toFixed(2));
  }
  if (reorderThreshold !== undefined) {
    const numThreshold = Number(reorderThreshold);
    if (isNaN(numThreshold) || numThreshold < 0 || !Number.isInteger(numThreshold)) {
      return res.status(400).json({ success: false, error: "ValidationError", message: "Reorder threshold must be a non-negative integer" });
    }
    item.reorderThreshold = numThreshold;
  }

  item.updatedAt = new Date().toISOString();
  saveStateToDisk();

  logger.info(`Updated product details for ${item.id}`, { service: "inventory-service", item });
  res.json({ success: true, message: `Product '${item.name}' updated successfully`, item });
});

// Adjust stock quantity (replenish, reduce, set)
app.post("/api/inventory/items/:id/stock", (req, res) => {
  const item = findInventoryItem(req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, error: "ItemNotFound", message: "Inventory item not found" });
  }

  const { action = "replenish", quantity, reason } = req.body || {};
  const numQty = Number(quantity);

  if (isNaN(numQty) || numQty < 0 || !Number.isInteger(numQty)) {
    return res.status(400).json({ success: false, error: "ValidationError", message: "Quantity must be a non-negative integer" });
  }

  const previousQuantity = item.stock;
  let newQuantity = previousQuantity;

  if (action === "replenish" || action === "add") {
    if (numQty === 0) return res.status(400).json({ success: false, error: "ValidationError", message: "Replenish quantity must be greater than 0" });
    newQuantity = previousQuantity + numQty;
  } else if (action === "reduce" || action === "subtract") {
    if (numQty === 0) return res.status(400).json({ success: false, error: "ValidationError", message: "Reduction quantity must be greater than 0" });
    if (previousQuantity - numQty < 0) {
      return res.status(422).json({
        success: false,
        error: "InsufficientStock",
        message: `Cannot reduce stock by ${numQty}: only ${previousQuantity} available. Negative stock is prevented.`,
        available: previousQuantity,
        requestedReduction: numQty,
      });
    }
    newQuantity = previousQuantity - numQty;
  } else if (action === "set") {
    newQuantity = numQty;
  } else {
    return res.status(400).json({ success: false, error: "InvalidAction", message: "Action must be 'replenish', 'reduce', or 'set'" });
  }

  item.stock = newQuantity;
  item.updatedAt = new Date().toISOString();

  const adjustment = recordStockAdjustment(
    item.id,
    item.name,
    previousQuantity,
    newQuantity,
    reason || `Stock ${action}: ${numQty} units`
  );
  saveStateToDisk();

  logger.info(`Stock adjusted for ${item.id} (${previousQuantity} -> ${newQuantity})`, {
    service: "inventory-service",
    sku: item.id,
    previousQuantity,
    newQuantity,
    action,
    reason,
  });

  res.json({
    success: true,
    message: `Stock updated for '${item.name}' (${previousQuantity} -> ${newQuantity})`,
    item,
    adjustment,
  });
});

// Delete an inventory item
app.delete("/api/inventory/items/:id", (req, res) => {
  const item = findInventoryItem(req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, error: "ItemNotFound", message: "Inventory item not found" });
  }

  const sku = item.id;
  const name = item.name;
  const prevStock = item.stock;

  // Remove from repository (check both SKU key and any alias)
  for (const [key, val] of Object.entries(inventoryStock)) {
    if (val.id === sku) {
      delete inventoryStock[key];
    }
  }

  recordStockAdjustment(sku, name, prevStock, 0, "Product deleted from catalog");
  saveStateToDisk();

  logger.info(`Deleted product ${sku} (${name}) from inventory`, { service: "inventory-service", sku });
  res.json({ success: true, message: `Product '${name}' (${sku}) removed from catalog`, id: sku });
});

// Stock Adjustment History Endpoint
app.get("/api/inventory/history", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  res.json({
    success: true,
    totalAdjustments: adjustmentHistory.length,
    history: adjustmentHistory.slice(0, limit),
  });
});

// 5. Stock Verification & Reservation Handler (Phase 4 Order Service Integration)
const handleStockVerification = async (req, res) => {
  const startTime = Date.now();
  const { items, item, quantity = 1, orderId, customerId, reserve = true } = req.body || {};
  const activeSpan = trace.getSpan(context.active());
  const currentTraceId = req.traceId || (activeSpan ? activeSpan.spanContext().traceId : null);

  totalRequestsCounter.add(1, {
    method: "POST",
    route: "/api/inventory/verify",
  });

  logger.info(`Stock verification requested for order ${orderId || "N/A"}`, {
    service: "inventory-service",
    endpoint: req.originalUrl,
    traceId: currentTraceId,
    spanId: req.spanId,
    orderId,
    customerId: customerId || "guest",
    reserve,
  });

  // FAULT INJECTION CHECK: Infrastructure-level HTTP 503 failure
  if (faultConfig.simulateServiceUnavailable) {
    failedRequestsCounter.add(1, {
      method: "POST",
      route: "/api/inventory/verify",
      reason: "service_unavailable",
      status_code: "503",
    });

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    stockCheckDuration.record(elapsedSeconds, {
      status: "503",
      route: "/api/inventory/verify",
    });

    logger.error("ERROR Inventory service unavailable", {
      service: "inventory-service",
      endpoint: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      traceId: currentTraceId,
      spanId: req.spanId,
      orderId,
      statusCode: 503,
      error: "ServiceUnavailable",
      details: "Database connection pool exhausted during stock check",
    });

    if (activeSpan) {
      activeSpan.setStatus({
        code: 2, // SpanStatusCode.ERROR
        message: "Inventory service unavailable",
      });
      activeSpan.setAttribute("error", true);
      activeSpan.setAttribute("http.status_code", 503);
      activeSpan.setAttribute("inventory.fault_injected", true);
      activeSpan.recordException(new Error("Inventory service unavailable"));
    }

    return res.status(503).json({
      success: false,
      error: "ServiceUnavailable",
      message: "Inventory service unavailable: stock verification failed due to infrastructure service outage",
      orderId,
      statusCode: 503,
      traceId: currentTraceId,
      timestamp: new Date().toISOString(),
    });
  }

  // IDEMPOTENCY CHECK: If this order has already reserved or confirmed stock, return existing status
  if (orderId && orderReservations[orderId]) {
    const existingRes = orderReservations[orderId];
    if (existingRes.status === "CONFIRMED" || existingRes.status === "RESERVED") {
      logger.info(`Idempotent stock check for order ${orderId} (${existingRes.status})`, {
        service: "inventory-service",
        orderId,
        status: existingRes.status,
      });

      const elapsedSeconds = (Date.now() - startTime) / 1000;
      stockCheckDuration.record(elapsedSeconds, { status: "200", route: "/api/inventory/verify" });

      return res.status(200).json({
        success: true,
        verified: true,
        idempotent: true,
        reservationStatus: existingRes.status,
        message: `Order stock already ${existingRes.status.toLowerCase()} (idempotent response)`,
        orderId,
        items: existingRes.items,
        traceId: currentTraceId,
      });
    }
  }

  // Normalize items to inspect
  const itemsToCheck = items && Array.isArray(items) && items.length > 0
    ? items
    : [{ id: item || "Standard Item", name: item || "Standard Item", quantity: Number(quantity) || 1 }];

  let isStockAvailable = true;
  let rejectionReason = null;
  const verifiedItems = [];
  const matchedRecords = [];

  for (const itm of itemsToCheck) {
    const key = itm.id || itm.name;
    const reqQty = Number(itm.quantity) || 1;
    const inventoryRecord = findInventoryItem(key);

    if (!inventoryRecord) {
      isStockAvailable = false;
      rejectionReason = {
        name: key,
        error: "ProductNotFound",
        message: `Product '${key}' is not available in the inventory catalog`,
        requested: reqQty,
        available: 0,
      };
      break;
    }

    const availableStock = Number(inventoryRecord.stock) || 0;

    if (availableStock < reqQty) {
      isStockAvailable = false;
      rejectionReason = {
        name: inventoryRecord.name,
        sku: inventoryRecord.id,
        error: "InsufficientStock",
        requested: reqQty,
        available: availableStock,
      };
      break;
    }

    matchedRecords.push({ record: inventoryRecord, quantity: reqQty });
    verifiedItems.push({
      item: inventoryRecord.name,
      sku: inventoryRecord.id,
      quantity: reqQty,
      availableStock,
      status: "IN_STOCK",
    });
  }

  // Insufficient stock rejection (HTTP 422)
  if (!isStockAvailable) {
    stockRejectionsCounter.add(1);
    failedRequestsCounter.add(1, {
      method: "POST",
      route: "/api/inventory/verify",
      reason: "insufficient_stock",
      status_code: "422",
    });

    logger.warn(`Insufficient stock for order ${orderId}: ${rejectionReason.name}`, {
      service: "inventory-service",
      traceId: currentTraceId,
      orderId,
      details: rejectionReason,
    });

    const elapsedSeconds = (Date.now() - startTime) / 1000;
    stockCheckDuration.record(elapsedSeconds, {
      status: "422",
      route: "/api/inventory/verify",
    });

    if (activeSpan) {
      activeSpan.setAttribute("inventory.rejected", true);
      activeSpan.setAttribute("inventory.reason", rejectionReason.error);
    }

    return res.status(422).json({
      success: false,
      error: rejectionReason.error,
      message: `Item ${rejectionReason.name} has insufficient stock (Requested: ${rejectionReason.requested}, Available: ${rejectionReason.available})`,
      orderId,
      details: rejectionReason,
      traceId: currentTraceId,
    });
  }

  // Stock Reservation (Phase 4 requirement: hold stock during checkout)
  if (reserve && orderId) {
    for (const { record, quantity } of matchedRecords) {
      record.stock -= quantity;
      record.updatedAt = new Date().toISOString();
    }

    orderReservations[orderId] = {
      orderId,
      items: verifiedItems,
      status: "RESERVED",
      createdAt: new Date().toISOString(),
    };

    saveStateToDisk();

    logger.info(`Stock reserved for order ${orderId} (${verifiedItems.length} items)`, {
      service: "inventory-service",
      orderId,
      items: verifiedItems,
    });
  }

  const elapsedSeconds = (Date.now() - startTime) / 1000;
  stockCheckDuration.record(elapsedSeconds, {
    status: "200",
    route: "/api/inventory/verify",
  });

  logger.info(`Stock verification successful for order ${orderId || "N/A"}`, {
    service: "inventory-service",
    traceId: currentTraceId,
    spanId: req.spanId,
    orderId,
    itemsVerified: verifiedItems.length,
    reserved: Boolean(reserve && orderId),
  });

  if (activeSpan) {
    activeSpan.setAttribute("inventory.verified", true);
    activeSpan.setAttribute("inventory.items_count", verifiedItems.length);
    activeSpan.setAttribute("inventory.reserved", Boolean(reserve && orderId));
  }

  return res.status(200).json({
    success: true,
    verified: true,
    reserved: Boolean(reserve && orderId),
    message: "Product stock verified and reserved successfully",
    orderId,
    items: verifiedItems,
    timestamp: new Date().toISOString(),
    traceId: currentTraceId,
  });
};

app.post(
  ["/api/inventory/verify", "/api/inventory/check", "/api/inventory/verify-stock"],
  handleStockVerification
);

// 6. Confirm Stock Deduction (Called after successful payment)
app.post("/api/inventory/confirm", (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) {
    return res.status(400).json({ success: false, error: "MissingOrderId", message: "orderId is required" });
  }

  const reservation = orderReservations[orderId];
  if (!reservation) {
    return res.json({ success: true, message: `No pending reservation for order ${orderId}` });
  }

  if (reservation.status === "CONFIRMED") {
    return res.json({ success: true, message: `Reservation for order ${orderId} already confirmed` });
  }

  reservation.status = "CONFIRMED";
  reservation.confirmedAt = new Date().toISOString();

  // Log stock adjustments for each item
  for (const itm of reservation.items) {
    const item = findInventoryItem(itm.sku || itm.item);
    if (item) {
      recordStockAdjustment(
        item.id,
        item.name,
        item.stock + itm.quantity,
        item.stock,
        `Order fulfillment (${orderId})`,
        orderId
      );
    }
  }

  saveStateToDisk();

  logger.info(`Stock reservation confirmed for order ${orderId}`, {
    service: "inventory-service",
    orderId,
  });

  res.json({
    success: true,
    message: `Stock deduction confirmed for order ${orderId}`,
    orderId,
  });
});

// 7. Release Stock Reservation (Called if payment or checkout fails)
app.post("/api/inventory/release", (req, res) => {
  const { orderId, reason } = req.body || {};
  if (!orderId) {
    return res.status(400).json({ success: false, error: "MissingOrderId", message: "orderId is required" });
  }

  const reservation = orderReservations[orderId];
  if (!reservation || reservation.status !== "RESERVED") {
    return res.json({
      success: true,
      message: `No active reservation to release for order ${orderId}`,
    });
  }

  // Restore reserved quantities
  for (const itm of reservation.items) {
    const item = findInventoryItem(itm.sku || itm.item);
    if (item) {
      const prevStock = item.stock;
      item.stock += itm.quantity;
      item.updatedAt = new Date().toISOString();
      recordStockAdjustment(
        item.id,
        item.name,
        prevStock,
        item.stock,
        `Rollback: ${reason || "Checkout aborted"} (${orderId})`,
        orderId
      );
    }
  }

  reservation.status = "RELEASED";
  reservation.releasedAt = new Date().toISOString();
  reservation.releaseReason = reason;

  saveStateToDisk();

  logger.warn(`Stock reservation rolled back for order ${orderId}: ${reason || "Aborted"}`, {
    service: "inventory-service",
    orderId,
    reason,
  });

  res.json({
    success: true,
    message: `Stock reservation released for order ${orderId}`,
    orderId,
    reason,
  });
});

// 8. Root status info or UI
app.get("/", (req, res) => {
  if (req.accepts("html") && !req.xhr) {
    const htmlPath = path.join(__dirname, "index.html");
    if (fs.existsSync(htmlPath)) {
      return res.sendFile(htmlPath);
    }
  }

  const summary = calculateStockSummary();
  res.json({
    service: "inventory-service",
    status: faultConfig.simulateServiceUnavailable ? "DEGRADED" : "UP",
    port: PORT,
    summary,
    endpoints: {
      metrics: "GET /metrics",
      health: "GET /health",
      stock: "GET /api/inventory/stock",
      items: "GET /api/inventory/items",
      addItem: "POST /api/inventory/items",
      updateItem: "PUT /api/inventory/items/:id",
      adjustStock: "POST /api/inventory/items/:id/stock",
      deleteItem: "DELETE /api/inventory/items/:id",
      history: "GET /api/inventory/history",
      verify: "POST /api/inventory/verify",
      confirm: "POST /api/inventory/confirm",
      release: "POST /api/inventory/release",
      faultEnable: "POST /api/fault/enable",
      faultDisable: "POST /api/fault/disable",
      faultStatus: "GET /api/fault/status",
      faultInject: "POST /api/fault-inject",
    },
  });
});

const PORT = parseInt(process.env.PORT || "8004", 10);

app.listen(PORT, "0.0.0.0", () => {
  logger.info(`📦 Inventory Service running on http://0.0.0.0:${PORT}`);
  logger.info(`📊 Prometheus Metrics available at http://0.0.0.0:${PORT}/metrics`);
});
