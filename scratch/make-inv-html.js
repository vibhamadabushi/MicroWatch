const fs = require('fs');
let html = fs.readFileSync('food-delivery-app/index.html', 'utf8');

// Standalone inventory service direct page
html = html.replace('<title>Food Delivery Application — MicroWatch</title>', '<title>MicroWatch Inventory Service</title>');
html = html.replace("document.getElementById('view-landing').classList.add('active');", "document.getElementById('view-inventory').classList.add('active'); loadInventoryData();");
html = html.replace(/navigateTo\('\/services'\)/g, "window.location.href='http://localhost:3001/services'");

fs.writeFileSync('inventory-service/index.html', html, 'utf8');
console.log('Successfully created inventory-service/index.html');
