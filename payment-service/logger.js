const winston = require("winston");
const LokiTransport = require("winston-loki");

const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),

    new LokiTransport({
      host: "http://localhost:3100",
      labels: {
        service: "payment-service",
      },

      json: true,

      format: winston.format.json(),

      replaceTimestamp: true,
    }),
  ],
});

module.exports = logger;
