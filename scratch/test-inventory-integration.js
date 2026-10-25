const { spawn, execSync } = require('child_process');
const path = require('path');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status === 200 || res.status === 503) return true;
    } catch (e) {}
    await wait(300);
  }
  return false;
}

// Clean any leftover processes on target ports
function cleanupPorts() {
  if (process.platform === 'win32') {
    try {
      const ports = [3001, 3002, 8002, 8004, 8088];
      for (const p of ports) {
        try {
          const out = execSync(`netstat -ano | findstr :${p}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
          const lines = out.split('\n').filter(Boolean);
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0' && pid !== process.pid.toString()) {
              try { execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' }); } catch (e) {}
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
}

async function runTests() {
  console.log("============================================================");
  console.log("   🧪 MICROWATCH INVENTORY INTEGRATION TEST SUITE 🧪        ");
  console.log("============================================================\n");

  cleanupPorts();
  await wait(500);

  const processes = [];
  const startProc = (dir, cmd, args, env = {}) => {
    const isWin = process.platform === 'win32';
    const proc = spawn(cmd, args, {
      cwd: path.resolve(__dirname, '..', dir),
      shell: isWin,
      env: { ...process.env, FORCE_COLOR: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg && !msg.includes('DeprecationWarning')) {
        // console.error(`[${dir} ERR] ${msg}`);
      }
    });

    processes.push(proc);
    return proc;
  };

  const results = [];
  const assert = (name, condition, extra = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${name} ${extra ? `(${extra})` : ''}`);
      results.push({ name, pass: true });
    } else {
      console.error(`❌ [FAIL] ${name} ${extra ? `(${extra})` : ''}`);
      results.push({ name, pass: false, error: extra });
    }
  };

  try {
    console.log("1. Starting Inventory Service (:8004)...");
    let invProc = startProc('inventory-service', 'node', ['index.js'], { PORT: '8004' });
    const invReady = await waitForServer('http://localhost:8004/health');
    assert('Inventory Service Startup (:8004)', invReady);

    console.log("2. Starting Payment Service (:8002)...");
    const payProc = startProc('payment-service', 'node', ['index.js'], { PORT: '8002' });
    const payReady = await waitForServer('http://localhost:8002/health');
    assert('Payment Service Startup (:8002)', payReady);

    console.log("3. Starting Order Service (:3002)...");
    const orderProc = startProc('order-service', 'node', ['index.js'], {
      PORT: '3002',
      INVENTORY_SERVICE_URL: 'http://localhost:8004',
      PAYMENT_SERVICE_URL: 'http://localhost:8002',
    });
    const orderReady = await waitForServer('http://localhost:3002/health');
    assert('Order Service Startup (:3002)', orderReady);

    console.log("4. Starting Food Delivery App (:3001)...");
    const foodProc = startProc('food-delivery-app', 'node', ['index.js'], {
      PORT: '3001',
      INVENTORY_SERVICE_URL: 'http://localhost:8004',
    });
    const foodReady = await waitForServer('http://localhost:3001/services');
    assert('Food Delivery App Startup (:3001)', foodReady);

    console.log("5. Starting API Gateway (:8088)...");
    const gwProc = startProc('api-gateway', 'node', ['index.js'], {
      PORT: '8088',
      NODE_PATH: path.resolve(__dirname, '..', 'inventory-service', 'node_modules'),
      INVENTORY_SERVICE_URL: 'http://localhost:8004',
      PAYMENT_SERVICE_URL: 'http://localhost:8002',
      ORDER_SERVICE_URL: 'http://localhost:3002',
    });
    const gwReady = await waitForServer('http://localhost:8088/health');
    assert('API Gateway Startup (:8088)', gwReady);

    console.log("\n--- Phase 2: Food Delivery App Services Listing ---");
    const foodHtmlRes = await fetch('http://localhost:3001/services');
    const foodHtml = await foodHtmlRes.text();
    assert('Services page contains Inventory card title', foodHtml.includes('Inventory'));
    assert('Services page contains Inventory Service subtitle', foodHtml.includes('Inventory Service'));
    assert('Services page contains warehouse/inventory icon', foodHtml.includes('🏬'));
    assert('Services page navigates to /inventory', foodHtml.includes("navigateTo('/inventory')"));
    assert('Services page displays 4 cards (Restaurant, Order, Payment, Inventory)',
      foodHtml.includes('Restaurant') &&
      foodHtml.includes('Order') &&
      foodHtml.includes('Payment') &&
      foodHtml.includes('Inventory')
    );
    assert('Notification Service backend remains available', foodHtml.includes('Notification Service'));

    console.log("\n--- Phase 3: Complete Inventory Management Page & CRUD ---");
    // Health Check
    const healthRes = await fetch('http://localhost:8004/health');
    const healthData = await healthRes.json();
    assert('Inventory Health Check responds 200 with UP status',
      healthRes.status === 200 && healthData.status === 'UP',
      `itemCount: ${healthData.itemCount}`
    );

    // Overview & Summary
    const stockRes = await fetch('http://localhost:8004/api/inventory/stock');
    const stockData = await stockRes.json();
    assert('Stock overview returns dynamic counts',
      stockData.totalProducts > 0 && stockData.totalUnits > 0,
      `products: ${stockData.totalProducts}, units: ${stockData.totalUnits}`
    );
    assert('Stock overview identifies low-stock and out-of-stock items',
      stockData.lowStockProducts >= 1 && stockData.outOfStockProducts >= 1,
      `lowStock: ${stockData.lowStockProducts}, outOfStock: ${stockData.outOfStockProducts}`
    );
    assert('Stock overview preserves backward-compatible stock dictionary',
      typeof stockData.stock === 'object' && Boolean(stockData.stock['PROD-101'])
    );

    // Proxy verification from Food App (:3001 -> :8004)
    const proxyRes = await fetch('http://localhost:3001/api/inventory/stock');
    const proxyData = await proxyRes.json();
    assert('Food Delivery App proxies /api/inventory/stock cleanly',
      proxyRes.status === 200 && proxyData.totalProducts > 0
    );

    // List items endpoint with sorting & filtering
    const listRes = await fetch('http://localhost:8004/api/inventory/items?category=Food%20App%20Catalog&sortBy=name&sortOrder=asc');
    const listData = await listRes.json();
    assert('List items endpoint supports category filtering and sorting',
      listRes.status === 200 && listData.items.length >= 2,
      `returned: ${listData.items.length} items`
    );

    // CRUD: Add product
    const testSku = `PIZZA-${Date.now().toString().slice(-4)}`;
    const addRes = await fetch('http://localhost:8004/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: testSku,
        name: 'Gourmet Truffle Pizza',
        category: 'Food App Catalog',
        price: 24.99,
        stock: 50,
        reorderThreshold: 10,
      }),
    });
    const addData = await addRes.json();
    assert('CRUD Add: New product created successfully (HTTP 201)',
      addRes.status === 201 && addData.success && addData.item.id === testSku
    );

    // Validation: Duplicate SKU rejected
    const dupRes = await fetch('http://localhost:8004/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: testSku,
        name: 'Duplicate Pizza',
        category: 'Food',
        price: 15,
        stock: 10,
      }),
    });
    assert('Validation: Duplicate SKU rejected (HTTP 409 Conflict)', dupRes.status === 409);

    // Validation: Invalid negative price rejected
    const negPriceRes = await fetch('http://localhost:8004/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: 'NEG-PRICE-01',
        name: 'Negative Price Item',
        category: 'Test',
        price: -12.50,
        stock: 10,
      }),
    });
    assert('Validation: Negative price rejected (HTTP 400 Bad Request)', negPriceRes.status === 400);

    // Validation: Negative stock rejected
    const negStockCreateRes = await fetch('http://localhost:8004/api/inventory/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: 'NEG-STOCK-01',
        name: 'Negative Stock Item',
        category: 'Test',
        price: 10.0,
        stock: -5,
      }),
    });
    assert('Validation: Negative initial stock rejected (HTTP 400)', negStockCreateRes.status === 400);

    // CRUD: Edit product details
    const editRes = await fetch(`http://localhost:8004/api/inventory/items/${testSku}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Gourmet Truffle & Burrata Pizza',
        price: 27.50,
        reorderThreshold: 15,
      }),
    });
    const editData = await editRes.json();
    assert('CRUD Edit: Product details updated successfully (HTTP 200)',
      editRes.status === 200 && editData.item.price === 27.5 && editData.item.reorderThreshold === 15
    );

    // CRUD: Stock replenishment
    const replenishRes = await fetch(`http://localhost:8004/api/inventory/items/${testSku}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'replenish',
        quantity: 20,
        reason: 'Kitchen batch restock #102',
      }),
    });
    const replenishData = await replenishRes.json();
    assert('Stock Management: Replenishment increases stock (50 + 20 = 70)',
      replenishRes.status === 200 && replenishData.item.stock === 70
    );

    // CRUD: Stock reduction
    const reduceRes = await fetch(`http://localhost:8004/api/inventory/items/${testSku}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reduce',
        quantity: 15,
        reason: 'Event catering order deduction',
      }),
    });
    const reduceData = await reduceRes.json();
    assert('Stock Management: Stock reduction decreases stock (70 - 15 = 55)',
      reduceRes.status === 200 && reduceData.item.stock === 55
    );

    // Prevention of negative stock
    const negStockRes = await fetch(`http://localhost:8004/api/inventory/items/${testSku}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reduce',
        quantity: 9999,
        reason: 'Attempted excessive deduction',
      }),
    });
    assert('Stock Management: Negative stock strictly prevented (HTTP 422)', negStockRes.status === 422);

    // Stock adjustment history
    const histRes = await fetch('http://localhost:8004/api/inventory/history');
    const histData = await histRes.json();
    const itemHist = histData.history.filter((h) => h.sku === testSku);
    assert('Stock Management: Stock adjustment audit history recorded',
      itemHist.length >= 3,
      `adjustments tracked: ${itemHist.length}`
    );

    console.log("\n--- Phase 3.E: Data Persistence Across Service Restart ---");
    // Terminate inventory service and restart it
    invProc.kill();
    await wait(1200);
    invProc = startProc('inventory-service', 'node', ['index.js'], { PORT: '8004' });
    await waitForServer('http://localhost:8004/health');

    const persistCheckRes = await fetch(`http://localhost:8004/api/inventory/items/${testSku}`);
    const persistCheckData = await persistCheckRes.json();
    assert('Persistence: Created and updated stock persists across restart (stock: 55)',
      persistCheckRes.status === 200 && persistCheckData.item.stock === 55,
      `persisted stock: ${persistCheckData.item ? persistCheckData.item.stock : 'null'}`
    );

    console.log("\n--- Phase 4: Order Service & Inventory Lifecycle Integration ---");
    // 1. Order with sufficient stock
    const preStockRes = await fetch(`http://localhost:8004/api/inventory/items/${testSku}`);
    const stockBeforeOrder = (await preStockRes.json()).item.stock; // 55

    const orderSuccessRes = await fetch('http://localhost:3002/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: 'CUST-SUFFICIENT',
        item: testSku,
        quantity: 4,
        totalAmount: 27.5 * 4,
      }),
    });
    const orderSuccessData = await orderSuccessRes.json();
    assert('Order Flow: Sufficient stock order completes successfully (HTTP 200)',
      orderSuccessRes.status === 200 && orderSuccessData.success
    );

    const postOrderCheckRes = await fetch(`http://localhost:8004/api/inventory/items/${testSku}`);
    const stockAfterOrder = (await postOrderCheckRes.json()).item.stock;
    assert('Order Flow: Stock permanently deducted following order confirmation (55 - 4 = 51)',
      stockAfterOrder === stockBeforeOrder - 4,
      `stock: ${stockAfterOrder}`
    );

    // 2. Order with insufficient stock
    const overOrderRes = await fetch('http://localhost:3002/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: 'CUST-INSUFFICIENT',
        item: testSku,
        quantity: 5000,
        totalAmount: 5000 * 27.5,
      }),
    });
    assert('Order Flow: Insufficient stock order rejected (HTTP 422)', overOrderRes.status === 422);

    const postOverOrderStock = (await (await fetch(`http://localhost:8004/api/inventory/items/${testSku}`)).json()).item.stock;
    assert('Order Flow: Stock unchanged when order is rejected for insufficient stock (remains 51)',
      postOverOrderStock === 51
    );

    // 3. Rollback on Payment Failure
    console.log("Simulating Payment Service failure to test inventory rollback...");
    await fetch('http://localhost:8002/api/fault/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'error' }),
    });

    const failedPaymentOrderRes = await fetch('http://localhost:3002/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: 'CUST-FAILED-PAY',
        item: testSku,
        quantity: 5,
        totalAmount: 5 * 27.5,
      }),
    });
    assert('Order Flow: Order aborts when payment fails (HTTP 503/error)', failedPaymentOrderRes.status !== 200);

    const postRollbackStock = (await (await fetch(`http://localhost:8004/api/inventory/items/${testSku}`)).json()).item.stock;
    assert('Order Flow: Stock reservation released and restored upon payment failure (remains 51)',
      postRollbackStock === 51
    );

    // Restore payment service to normal
    await fetch('http://localhost:8002/api/fault/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'error' }),
    });

    // 4. Idempotency: Repeated order verification requests
    const idempOrderId = `ORD-IDEMP-${Date.now()}`;
    const v1 = await fetch('http://localhost:8004/api/inventory/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: idempOrderId,
        item: testSku,
        quantity: 2,
        reserve: true,
      }),
    });
    const v1Data = await v1.json();
    assert('Idempotency: First verification reserves stock', v1.status === 200 && v1Data.reserved);

    const v2 = await fetch('http://localhost:8004/api/inventory/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: idempOrderId,
        item: testSku,
        quantity: 2,
        reserve: true,
      }),
    });
    const v2Data = await v2.json();
    assert('Idempotency: Repeated verification does not double-deduct (idempotent)',
      v2.status === 200 && v2Data.idempotent
    );

    // Clean up test reservation
    await fetch('http://localhost:8004/api/inventory/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: idempOrderId, reason: 'Test suite cleanup' }),
    });

    console.log("\n--- Phase 5: Observability, Metrics & Chaos Lab ---");
    // Prometheus Metrics Verification
    const promRes = await fetch('http://localhost:8004/metrics');
    const promText = await promRes.text();
    assert('Observability: Prometheus metrics exposed on :8004/metrics', promRes.status === 200);
    assert('Observability: Request counters active in Prometheus output',
      promText.includes('inventory_requests_total')
    );
    assert('Observability: Stock rejection events tracked in Prometheus',
      promText.includes('inventory_stock_rejections_total')
    );

    // Chaos Lab: Injected Fault
    console.log("Triggering Chaos Lab fault injection on inventory-service...");
    await fetch('http://localhost:8004/api/fault/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const faultedHealthRes = await fetch('http://localhost:8004/health');
    const faultedHealthData = await faultedHealthRes.json();
    assert('Chaos Lab: Health check turns DEGRADED (HTTP 503) during active fault',
      faultedHealthRes.status === 503 && faultedHealthData.status === 'DEGRADED'
    );

    const faultedOrderRes = await fetch('http://localhost:3002/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: 'CUST-CHAOS',
        item: testSku,
        quantity: 1,
      }),
    });
    assert('Chaos Lab: Orders gracefully abort with 503 during inventory fault',
      faultedOrderRes.status === 503
    );

    // Reset Fault
    await fetch('http://localhost:8004/api/fault/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const restoredHealth = await fetch('http://localhost:8004/health');
    const restoredHealthData = await restoredHealth.json();
    assert('Chaos Lab: Reset restores service health to UP (HTTP 200)',
      restoredHealth.status === 200 && restoredHealthData.status === 'UP'
    );

    // CRUD: Delete product
    const delRes = await fetch(`http://localhost:8004/api/inventory/items/${testSku}`, { method: 'DELETE' });
    const delData = await delRes.json();
    assert('CRUD Delete: Test product removed from catalog (HTTP 200)',
      delRes.status === 200 && delData.success
    );

    // API Gateway Forwarding
    const gwStockRes = await fetch('http://localhost:8088/api/inventory/stock');
    const gwStockData = await gwStockRes.json();
    assert('API Gateway: Forwards /api/inventory/stock correctly to inventory-service',
      gwStockRes.status === 200 && gwStockData.totalProducts > 0
    );

  } catch (err) {
    console.error("Test Suite Runtime Error:", err);
    results.push({ name: 'Runtime Failure', pass: false, error: err.message });
  } finally {
    console.log("\n🧹 Gracefully stopping all test microservice processes...");
    for (const p of processes) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', p.pid, '/f', '/t'], { stdio: 'ignore' });
        } else {
          p.kill('SIGKILL');
        }
      } catch (e) {}
    }
    cleanupPorts();
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log("\n============================================================");
  console.log(`📊 FINAL RESULTS: ${results.length} TESTS EXECUTED`);
  console.log(`✅ PASSED: ${passed}`);
  console.log(`❌ FAILED: ${failed}`);
  console.log("============================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
