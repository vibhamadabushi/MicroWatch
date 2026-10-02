import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 5 },  // Warm up
    { duration: '30s', target: 15 }, // Baseline load
    { duration: '10s', target: 30 }, // Burst spike
    { duration: '10s', target: 0 },  // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
    http_req_failed: ['rate<0.05'],   // Error rate should stay below 5%
  },
};

const BASE_URL = __ENV.GATEWAY_URL || 'http://localhost:8080';

export default function () {
  const payload = JSON.stringify({
    customerId: `CUST-${__VU * 100 + __ITER}`,
    items: [{ id: 'ITEM-1', name: 'MicroWatch IoT Sensor', price: 99.0, quantity: 1 }],
    totalAmount: 99.0,
    paymentMethod: 'CREDIT_CARD',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(`${BASE_URL}/api/checkout`, payload, params);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has transactionId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && body.transactionId !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  sleep(0.5);
}
