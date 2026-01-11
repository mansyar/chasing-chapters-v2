type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production, only log warnings and errors
// In development, log everything
const MIN_LOG_LEVEL: LogLevel =
  process.env.NODE_ENV === "production" ? "warn" : "debug";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

/**
 * Production-safe logger that reduces log volume in production.
 * - Production: Only logs warn and error levels
 * - Development: Logs everything
 */
export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog("debug")) {
      console.log(message, ...args);
    }
  },

  info: (message: string, ...args: unknown[]) => {
    if (shouldLog("info")) {
      console.log(message, ...args);
    }
  },

  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog("warn")) {
      console.warn(message, ...args);
    }
  },

  error: (message: string, ...args: unknown[]) => {
    if (shouldLog("error")) {
      console.error(message, ...args);
    }
  },
};
