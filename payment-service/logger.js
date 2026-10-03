const winston = require("winston");
const LokiTransport = require("winston-loki");

const lokiHost = process.env.LOKI_HOST || "http://loki:3100";

const transports = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `[${timestamp}] ${level}: ${message}`;
      })
    ),
  }),
];

try {
  transports.push(
    new LokiTransport({
      host: lokiHost,
      labels: {
        service: "payment-service",
      },
      json: true,
      format: winston.format.json(),
      replaceTimestamp: true,
      onConnectionError: (err) => {
        // Suppress unhandled network error logs while Loki initializes
      },
    })
  );
} catch (e) {
  console.warn("Could not initialize Loki transport:", e.message);
}

const logger = winston.createLogger({
  transports,
});

module.exports = logger;
