const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const INVENTORY_SERVICE_URL =
  process.env.INVENTORY_SERVICE_URL || "http://localhost:8004";

// Proxy inventory API requests directly to inventory-service
app.use("/api/inventory", async (req, res) => {
  try {
    const subpath = req.url.startsWith("/") ? req.url : `/${req.url}`;
    const targetUrl = `${INVENTORY_SERVICE_URL}/api/inventory${subpath}`;
    const options = {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body && Object.keys(req.body).length > 0) {
      options.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, options);
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (err) {
    return res.status(503).json({
      success: false,
      error: "InventoryServiceUnavailable",
      message: `Failed to proxy request to Inventory Service at ${INVENTORY_SERVICE_URL}: ${err.message}`,
    });
  }
});

// Serve static assets if any, and serve index.html for UI routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🍔 Food Delivery Application UI running on http://localhost:${PORT}`);
  console.log(`📦 Proxying /api/inventory to ${INVENTORY_SERVICE_URL}`);
});
