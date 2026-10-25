const { spawn, execSync } = require('child_process');
const path = require('path');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(url, timeoutMs = 10000) {
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

function cleanupPorts() {
  if (process.platform === 'win32') {
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
  }
}

async function run() {
  cleanupPorts();
  await wait(500);

  const procs = [];
  const start = (dir, args, env = {}) => {
    const p = spawn('node', args, {
      cwd: path.resolve(__dirname, '..', dir),
      shell: process.platform === 'win32',
      env: { ...process.env, ...env },
      stdio: 'ignore'
    });
    procs.push(p);
    return p;
  };

  try {
    console.log("Starting microservices for drill verification...");
    start('inventory-service', ['index.js'], { PORT: '8004' });
    start('payment-service', ['index.js'], { PORT: '8002' });
    start('order-service', ['index.js'], { PORT: '3002', INVENTORY_SERVICE_URL: 'http://localhost:8004', PAYMENT_SERVICE_URL: 'http://localhost:8002' });
    start('api-gateway', ['index.js'], { PORT: '8088', INVENTORY_SERVICE_URL: 'http://localhost:8004', PAYMENT_SERVICE_URL: 'http://localhost:8002', ORDER_SERVICE_URL: 'http://localhost:3002' });

    await waitForServer('http://localhost:8088/health');
    console.log("Gateway ready on port 8088. Running inventory drill test...");

    const drillProc = spawn('node', ['load-test.js', '--drill', 'inventory-error', '--duration', '4', '--rps', '3'], {
      cwd: path.resolve(__dirname, '..'),
      shell: process.platform === 'win32',
      env: { ...process.env, GATEWAY_URL: 'http://localhost:8088' },
      stdio: 'inherit'
    });

    await new Promise((resolve) => drillProc.on('close', resolve));
    console.log("Drill test execution completed successfully.");
  } finally {
    for (const p of procs) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', p.pid, '/f', '/t'], { stdio: 'ignore' });
        } else {
          p.kill();
        }
      } catch (e) {}
    }
    cleanupPorts();
  }
}

run();
