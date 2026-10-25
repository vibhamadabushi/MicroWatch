const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'order-service', 'index.js');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add reserve: true
code = code.replace(
  'quantity: quantity || 1,\r\n        }),',
  'quantity: quantity || 1,\r\n          reserve: true,\r\n        }),'
);
code = code.replace(
  'quantity: quantity || 1,\n        }),',
  'quantity: quantity || 1,\n          reserve: true,\n        }),'
);

// 2. Add rollback on payment unreachable
const errSearchCRLF = 'orders.unshift(failedOrder);\r\n    return res.status(502)';
const errSearchLF = 'orders.unshift(failedOrder);\n    return res.status(502)';
const rollbackUnreachable = `    // Rollback reserved stock
    try {
      await callService(\`\${INVENTORY_SERVICE_URL}/api/inventory/release\`, {
        method: "POST",
        body: JSON.stringify({ orderId, reason: "Payment service unreachable" }),
      });
    } catch (e) {
      logger.error(\`Failed to rollback inventory for order \${orderId}: \${e.message}\`);
    }
`;

if (code.includes(errSearchCRLF)) {
  code = code.replace(errSearchCRLF, rollbackUnreachable.replace(/\n/g, '\r\n') + '    ' + errSearchCRLF);
} else if (code.includes(errSearchLF)) {
  code = code.replace(errSearchLF, rollbackUnreachable + '    ' + errSearchLF);
}

// 3. Add rollback on payment rejected
const rejSearchCRLF = 'orders.unshift(failedOrder);\r\n    return res.status(paymentResult.status)';
const rejSearchLF = 'orders.unshift(failedOrder);\n    return res.status(paymentResult.status)';
const rollbackRejected = `    // Rollback reserved stock
    try {
      await callService(\`\${INVENTORY_SERVICE_URL}/api/inventory/release\`, {
        method: "POST",
        body: JSON.stringify({ orderId, reason: "Payment rejected" }),
      });
    } catch (e) {
      logger.error(\`Failed to rollback inventory for order \${orderId}: \${e.message}\`);
    }
`;

if (code.includes(rejSearchCRLF)) {
  code = code.replace(rejSearchCRLF, rollbackRejected.replace(/\n/g, '\r\n') + '    ' + rejSearchCRLF);
} else if (code.includes(rejSearchLF)) {
  code = code.replace(rejSearchLF, rollbackRejected + '    ' + rejSearchLF);
}

// 4. Add confirm on order completion
const confirmSearch = '// Record successful order';
const confirmCall = `  // Step 4: Confirm inventory reservation
  try {
    await callService(\`\${INVENTORY_SERVICE_URL}/api/inventory/confirm\`, {
      method: "POST",
      body: JSON.stringify({ orderId }),
    });
  } catch (e) {
    logger.error(\`Failed to confirm inventory deduction for order \${orderId}: \${e.message}\`);
  }

`;

if (code.includes('\r\n')) {
  code = code.replace(confirmSearch, confirmCall.replace(/\n/g, '\r\n') + '  ' + confirmSearch);
} else {
  code = code.replace(confirmSearch, confirmCall + '  ' + confirmSearch);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated order-service/index.js');
