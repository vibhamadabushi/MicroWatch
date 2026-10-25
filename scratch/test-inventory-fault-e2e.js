const http = require("http");

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on("error", reject);
    if (postData) {
      req.write(typeof postData === "string" ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runValidation() {
  console.log("================================================================================");
  console.log("       🧪 MICROWATCH INVENTORY SERVICE & FAULT INJECTION VALIDATION SUITE        ");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, testName, details = "") {
    total++;
    if (condition) {
      passed++;
      console.log(`✅ [PASS] Test ${total}: ${testName}`);
      if (details) console.log(`   └─ ${details}`);
    } else {
      console.error(`❌ [FAIL] Test ${total}: ${testName}`);
      if (details) console.error(`   └─ ${details}`);
    }
  }

  // TEST 1: Inventory Service Health
  try {
    const r = await makeRequest({ host: "localhost", port: 8004, path: "/health", method: "GET" });
    assert(r.status === 200 && r.data.service === "inventory-service", "Inventory Service Healthcheck", `Status: ${r.status}, Service: ${r.data.service}`);
  } catch (e) {
    assert(false, "Inventory Service Healthcheck", e.message);
  }

  // Ensure baseline: fault disabled
  await makeRequest({ host: "localhost", port: 8004, path: "/api/fault/disable", method: "POST" });

  // TEST 2: Inventory Service returns HTTP 200 when fault injection is disabled
  try {
    const r = await makeRequest(
      { host: "localhost", port: 8004, path: "/api/inventory/verify", method: "POST", headers: { "Content-Type": "application/json" } },
      { item: "PROD-101", quantity: 1, orderId: "ORD-VAL-NORMAL" }
    );
    assert(
      r.status === 200 && r.data.verified === true,
      "Inventory Service Stock Verification (Normal Flow - Fault OFF)",
      `Status: ${r.status}, Verified: ${r.data.verified}, TraceId: ${r.data.traceId}`
    );
  } catch (e) {
    assert(false, "Inventory Service Stock Verification (Normal Flow)", e.message);
  }

  // TEST 3: Business-level stock check (Insufficient stock vs infrastructure outage)
  try {
    const r = await makeRequest(
      { host: "localhost", port: 8004, path: "/api/inventory/verify", method: "POST", headers: { "Content-Type": "application/json" } },
      { item: "PROD-101", quantity: 99999, orderId: "ORD-VAL-OUTOFSTOCK" }
    );
    assert(
      r.status === 422 && r.data.error === "InsufficientStock",
      "Business-level Insufficient Stock returns HTTP 422 (Distinct from Infrastructure 503)",
      `Status: ${r.status}, Error: ${r.data.error}, Message: ${r.data.message}`
    );
  } catch (e) {
    assert(false, "Business-level Insufficient Stock Check", e.message);
  }

  // TEST 4: End-to-end Order Service checkout when Inventory fault is disabled (Normal Flow)
  try {
    const r = await makeRequest(
      { host: "localhost", port: 3002, path: "/api/order", method: "POST", headers: { "Content-Type": "application/json" } },
      { item: "PROD-101", quantity: 1, totalAmount: 89.99, customerId: "CUST-ALICE" }
    );
    assert(
      r.status === 200 && r.data.success === true && r.data.order.status === "CONFIRMED",
      "Order Service Checkout with Inventory Verification (Normal Flow)",
      `Status: ${r.status}, OrderId: ${r.data.order.orderId}, Status: ${r.data.order.status}, TxnId: ${r.data.order.transactionId}`
    );
  } catch (e) {
    assert(false, "Order Service Checkout (Normal Flow)", e.message);
  }

  // TEST 5: Enable Inventory Fault (HTTP 503 Service Unavailable)
  try {
    const r = await makeRequest({ host: "localhost", port: 8004, path: "/api/fault/enable", method: "POST", headers: { "Content-Type": "application/json" } });
    assert(
      r.status === 200 && r.data.currentConfig.simulateServiceUnavailable === true,
      "Enable Inventory Fault Injection via /api/fault/enable",
      `Status: ${r.status}, simulateServiceUnavailable: ${r.data.currentConfig.simulateServiceUnavailable}`
    );
  } catch (e) {
    assert(false, "Enable Inventory Fault", e.message);
  }

  // TEST 6: Direct Inventory Service verification returns HTTP 503 when fault enabled
  try {
    const r = await makeRequest(
      { host: "localhost", port: 8004, path: "/api/inventory/verify", method: "POST", headers: { "Content-Type": "application/json" } },
      { item: "PROD-101", quantity: 1, orderId: "ORD-VAL-FAULT" }
    );
    assert(
      r.status === 503 && r.data.error === "ServiceUnavailable",
      "Inventory Service returns HTTP 503 Service Unavailable when fault is enabled",
      `Status: ${r.status}, Error: ${r.data.error}, Message: ${r.data.message}`
    );
  } catch (e) {
    assert(false, "Inventory Service 503 Response", e.message);
  }

  // TEST 7: Order Service aborts transaction when Inventory Service returns 503
  try {
    const r = await makeRequest(
      { host: "localhost", port: 3002, path: "/api/order", method: "POST", headers: { "Content-Type": "application/json" } },
      { item: "PROD-101", quantity: 1, totalAmount: 89.99, customerId: "CUST-BOB" }
    );
    assert(
      r.status === 503 && r.data.status === "FAILED_INVENTORY_UNAVAILABLE",
      "Order Service Aborts Order when Stock Verification Fails (Does not confirm order)",
      `Status: ${r.status}, OrderId: ${r.data.orderId}, Status: ${r.data.status}, Message: ${r.data.message}`
    );
  } catch (e) {
    assert(false, "Order Service Aborts on Inventory Failure", e.message);
  }

  // TEST 8: Disable Inventory Fault and confirm recovery
  try {
    const r = await makeRequest({ host: "localhost", port: 8004, path: "/api/fault/disable", method: "POST", headers: { "Content-Type": "application/json" } });
    assert(
      r.status === 200 && r.data.currentConfig.simulateServiceUnavailable === false,
      "Disable Inventory Fault Injection via /api/fault/disable",
      `Status: ${r.status}, simulateServiceUnavailable: ${r.data.currentConfig.simulateServiceUnavailable}`
    );

    const rOrder = await makeRequest(
      { host: "localhost", port: 3002, path: "/api/order", method: "POST", headers: { "Content-Type": "application/json" } },
      { item: "PROD-101", quantity: 1, totalAmount: 89.99, customerId: "CUST-CHARLIE" }
    );
    assert(
      rOrder.status === 200 && rOrder.data.order.status === "CONFIRMED",
      "Order Placement Resumes Successfully after Fault Disabled",
      `Status: ${rOrder.status}, OrderId: ${rOrder.data.order.orderId}, OrderStatus: ${rOrder.data.order.status}`
    );
  } catch (e) {
    assert(false, "Fault Recovery Check", e.message);
  }

  // TEST 9: Prometheus Metrics Verification on Inventory Service (:8004/metrics)
  try {
    const r = await makeRequest({ host: "localhost", port: 8004, path: "/metrics", method: "GET" });
    const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data);
    const hasTotalReq = text.includes("inventory_requests_total");
    const hasFailedReq = text.includes("inventory_requests_failed_total");
    const hasDuration = text.includes("inventory_request_duration_seconds");
    const hasHttp503 = text.includes('http_response_status_code="503"');

    assert(
      hasTotalReq && hasFailedReq && hasDuration && hasHttp503,
      "Prometheus Metrics Expose Total, Failed (HTTP 503), and Latency Metrics",
      `TotalCounter: ${hasTotalReq}, FailedCounter: ${hasFailedReq}, DurationHistogram: ${hasDuration}, HTTP 503 Label: ${hasHttp503}`
    );
  } catch (e) {
    assert(false, "Prometheus Metrics Check", e.message);
  }

  // TEST 10: Vite Dashboard Proxy & Fault Integration (:5173/api/inventory/fault/...)
  try {
    const rStatus = await makeRequest({ host: "localhost", port: 5173, path: "/api/inventory/fault/status", method: "GET" });
    assert(
      rStatus.status === 200 && typeof rStatus.data.simulateServiceUnavailable === "boolean",
      "Vite Proxy: GET /api/inventory/fault/status",
      `Status: ${rStatus.status}, simulateServiceUnavailable: ${rStatus.data.simulateServiceUnavailable}`
    );

    const rEnable = await makeRequest(
      { host: "localhost", port: 5173, path: "/api/inventory/fault/enable", method: "POST", headers: { "Content-Type": "application/json" } },
      {}
    );
    assert(
      rEnable.status === 200 && rEnable.data.currentConfig.simulateServiceUnavailable === true,
      "Vite Proxy: POST /api/inventory/fault/enable",
      `Status: ${rEnable.status}, Config: ${JSON.stringify(rEnable.data.currentConfig)}`
    );

    const rDisable = await makeRequest(
      { host: "localhost", port: 5173, path: "/api/inventory/fault/disable", method: "POST", headers: { "Content-Type": "application/json" } },
      {}
    );
    assert(
      rDisable.status === 200 && rDisable.data.currentConfig.simulateServiceUnavailable === false,
      "Vite Proxy: POST /api/inventory/fault/disable",
      `Status: ${rDisable.status}, Config: ${JSON.stringify(rDisable.data.currentConfig)}`
    );
  } catch (e) {
    assert(false, "Vite Proxy Check", e.message);
  }

  // TEST 11: Regression check - Payment Service fault scenarios still work
  try {
    // Enable payment error
    await makeRequest({ host: "localhost", port: 8002, path: "/api/fault/enable?type=error", method: "POST" });
    const rPayFail = await makeRequest(
      { host: "localhost", port: 3002, path: "/api/order", method: "POST", headers: { "Content-Type": "application/json" } },
      { item: "Standard Item", quantity: 1, totalAmount: 49.99 }
    );
    assert(
      rPayFail.status === 503 && rPayFail.data.status === "PAYMENT_REJECTED",
      "Existing Payment Fault Scenario (Payment 503 rejects order)",
      `Status: ${rPayFail.status}, OrderStatus: ${rPayFail.data.status}`
    );

    // Disable payment error
    await makeRequest({ host: "localhost", port: 8002, path: "/api/fault/disable", method: "POST" });
    const rPayOk = await makeRequest(
      { host: "localhost", port: 3002, path: "/api/order", method: "POST", headers: { "Content-Type": "application/json" } },
      { item: "Standard Item", quantity: 1, totalAmount: 49.99 }
    );
    assert(
      rPayOk.status === 200 && rPayOk.data.order.status === "CONFIRMED",
      "Payment Recovery (Orders succeed after payment fault cleared)",
      `Status: ${rPayOk.status}, OrderStatus: ${rPayOk.data.order.status}`
    );
  } catch (e) {
    assert(false, "Payment Regression Check", e.message);
  }

  console.log("\n================================================================================");
  console.log(`🏁 VALIDATION COMPLETE: ${passed}/${total} TESTS PASSED (${((passed / total) * 100).toFixed(0)}%)`);
  console.log("================================================================================\n");

  process.exit(passed === total ? 0 : 1);
}

runValidation().catch((err) => {
  console.error("FATAL ERROR in validation suite:", err);
  process.exit(1);
});
