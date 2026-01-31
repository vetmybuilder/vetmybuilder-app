import pino from "pino";

const isCI = process.env.CI === "true" || process.env.CI === "1";

const level = process.env.E2E_LOG_LEVEL || process.env.LOG_LEVEL || "info";
const pretty =
  (process.env.E2E_LOG_PRETTY || "").toLowerCase() === "true" ||
  process.env.E2E_LOG_PRETTY === "1" ||
  (!isCI && process.env.E2E_LOG_PRETTY !== "0");

export const logger = pino(
  { name: "vmb-e2e", level },
  pretty
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname",
          singleLine: true,
        },
      })
    : undefined,
);

export default logger;
