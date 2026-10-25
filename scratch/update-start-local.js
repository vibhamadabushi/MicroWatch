const fs = require('fs');
let code = fs.readFileSync('start-local.js', 'utf8');
code = code.replace(
  '{ name: "NOTIFICATION", dir: "notification-service", cmd: "node", args: ["index.js"], color: "\\x1b[36m" }',
  '{ name: "NOTIFICATION", dir: "notification-service", cmd: "node", args: ["index.js"], color: "\\x1b[36m", env: { NODE_PATH: path.resolve(__dirname, "order-service", "node_modules") } }'
);
code = code.replace(
  '{ name: "GATEWAY     ", dir: "api-gateway", cmd: "node", args: ["index.js"], color: "\\x1b[34m", env: { PORT: "8088" } }',
  '{ name: "GATEWAY     ", dir: "api-gateway", cmd: "node", args: ["index.js"], color: "\\x1b[34m", env: { PORT: "8088", NODE_PATH: path.resolve(__dirname, "inventory-service", "node_modules") } }'
);
fs.writeFileSync('start-local.js', code, 'utf8');
console.log('Updated start-local.js');
