const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== TEST 1: Disable fault directly on Order Service :3002 ===');
  let r = await makeRequest({ host: 'localhost', port: 3002, path: '/api/fault/disable', method: 'POST', headers: { 'Content-Type': 'application/json' } }, {});
  console.log('Status:', r.status, 'Response:', r.data);

  console.log('\n=== TEST 2: Read status from Order Service :3002 ===');
  r = await makeRequest({ host: 'localhost', port: 3002, path: '/api/fault/status', method: 'GET' });
  console.log('Order Service status:', r.status, 'Config:', r.data);

  console.log('\n=== TEST 3: Read status via Vite Proxy :5173 (/api/order/fault/status) ===');
  r = await makeRequest({ host: 'localhost', port: 5173, path: '/api/order/fault/status', method: 'GET' });
  console.log('Vite Proxy status:', r.status, 'Config:', r.data);

  console.log('\n=== TEST 4: Enable fault via Vite Proxy :5173 (/api/order/fault/enable) ===');
  r = await makeRequest({ host: 'localhost', port: 5173, path: '/api/order/fault/enable', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { type: 'database' });
  console.log('Enable via Vite Proxy status:', r.status, 'Response:', r.data);

  console.log('\n=== TEST 5: Verify Order Service :3002 updated to ENABLED ===');
  r = await makeRequest({ host: 'localhost', port: 3002, path: '/api/fault/status', method: 'GET' });
  console.log('Order Service status:', r.status, 'Config:', r.data);

  console.log('\n=== TEST 6: Place Order with Fault ENABLED ===');
  r = await makeRequest({ host: 'localhost', port: 3002, path: '/api/order', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { item: 'Test Pizza', quantity: 1 });
  console.log('Place order (Fault ON) status:', r.status, 'Response:', r.data);

  console.log('\n=== TEST 7: Disable fault via Vite Proxy :5173 (/api/order/fault/disable) ===');
  r = await makeRequest({ host: 'localhost', port: 5173, path: '/api/order/fault/disable', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { type: 'database' });
  console.log('Disable via Vite Proxy status:', r.status, 'Response:', r.data);

  console.log('\n=== TEST 8: Verify Order Service :3002 updated to DISABLED ===');
  r = await makeRequest({ host: 'localhost', port: 3002, path: '/api/fault/status', method: 'GET' });
  console.log('Order Service status:', r.status, 'Config:', r.data);

  console.log('\n=== TEST 9: Place Order with Fault DISABLED ===');
  r = await makeRequest({ host: 'localhost', port: 3002, path: '/api/order', method: 'POST', headers: { 'Content-Type': 'application/json' } }, { item: 'Test Pizza', quantity: 1 });
  console.log('Place order (Fault OFF) status:', r.status, 'Response:', r.data);

  console.log('\n=== TEST 10: Check Prometheus metrics endpoint :3002/metrics ===');
  r = await makeRequest({ host: 'localhost', port: 3002, path: '/metrics', method: 'GET' });
  console.log('Prometheus metrics status:', r.status, 'Length:', r.data.length);
}

runTests().catch(console.error);
