const fs = require('fs');
let code = fs.readFileSync('api-gateway/index.js', 'utf8');
code = code.replace(
  'app.all("/api/inventory*", async (req, res) => {',
  'app.use("/api/inventory", async (req, res) => {'
);
code = code.replace(
  'const targetUrl = `${INVENTORY_SERVICE_URL}${req.originalUrl}`;',
  'const subpath = req.url.startsWith("/") ? req.url : `/${req.url}`;\n    const targetUrl = `${INVENTORY_SERVICE_URL}/api/inventory${subpath}`;'
);
fs.writeFileSync('api-gateway/index.js', code, 'utf8');
console.log('Successfully updated api-gateway/index.js');
