const winston = require("winston");
const LokiTransport = require("winston-loki");

const lokiHost = process.env.LOKI_HOST || "http://localhost:3100";

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(
        ({ level, message, timestamp, ...meta }) =>
          `[${timestamp}] [api-gateway] ${level}: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta) : ""
          }`
      )
    ),
  }),
];

try {
  const loki = new LokiTransport({
    host: lokiHost,
    labels: {
      service: "api-gateway",
    },
    json: true,
    format: winston.format.json(),
    replaceTimestamp: true,
    handleExceptions: false,
  });
  loki.on("error", (err) => {
    // Gracefully report loki connection issues without crashing service
    // console.warn("[api-gateway logger] Loki connection notice:", err.message);
  });
  transports.push(loki);
} catch (e) {
  console.warn("[api-gateway logger] Failed to initialize Loki transport:", e.message);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports,
});

module.exports = logger;
