const fs = require('fs');
let code = fs.readFileSync('api-gateway/index.js', 'utf8');

const routeToAdd = `// 5.5. Inventory Routes Forwarder
app.all("/api/inventory*", async (req, res) => {
  try {
    const targetUrl = \`\${INVENTORY_SERVICE_URL}\${req.originalUrl}\`;
    const options = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body && Object.keys(req.body).length > 0) {
      options.body = JSON.stringify(req.body);
    }
    const result = await forwardRequest(targetUrl, options);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return res.status(503).json({
      error: "Inventory Service Unavailable",
      message: err.message,
    });
  }
});

`;

if (!code.includes('/api/inventory*')) {
  const target = '// 6. Unified Fault Injection Router';
  if (code.includes('\r\n')) {
    code = code.replace(target, routeToAdd.replace(/\n/g, '\r\n') + target);
  } else {
    code = code.replace(target, routeToAdd + target);
  }
  fs.writeFileSync('api-gateway/index.js', code, 'utf8');
  console.log('Successfully updated api-gateway/index.js with inventory forwarding');
} else {
  console.log('Already includes inventory forwarding');
}
