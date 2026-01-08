// server/lib/logger.js
const pino = require("pino");

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Pretty & colourised logs in local/dev, pure JSON in production
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
});

// Optional helper for HTTP-style child loggers later
function withRequest(req) {
  if (!req) return logger;
  const { method, originalUrl, url, user } = req;
  return logger.child({
    method,
    path: originalUrl || url,
    userId: user?.uid || null,
  });
}

module.exports = {
  logger,
  withRequest,
};
