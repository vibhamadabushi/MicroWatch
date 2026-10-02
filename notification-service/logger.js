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
          `[${timestamp}] [notification-service] ${level}: ${message} ${
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
      service: "notification-service",
    },
    json: true,
    format: winston.format.json(),
    replaceTimestamp: true,
    handleExceptions: false,
  });
  loki.on("error", (err) => {
    // Loki offline handler
  });
  transports.push(loki);
} catch (e) {
  console.warn("[notification-service logger] Failed to initialize Loki transport:", e.message);
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports,
});

module.exports = logger;
