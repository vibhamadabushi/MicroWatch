@echo off
title MicroWatch Launcher
echo ============================================================
echo           Launching MicroWatch Observability Suite
echo ============================================================

start "Payment Service (3000)" cmd /k "cd payment-service && node index.js"
start "Notification Service (3003)" cmd /k "cd notification-service && node index.js"
start "Order Service (3002)" cmd /k "cd order-service && node index.js"
start "API Gateway (8080)" cmd /k "cd api-gateway && node index.js"
start "React Dashboard (5173)" cmd /k "cd dashboard && npm run dev"

echo All services launched in separate windows!
echo API Gateway: http://localhost:8080
echo Dashboard:   http://localhost:5173
pause
