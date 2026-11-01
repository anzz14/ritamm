type LogContext = Record<string, unknown>;
type LogLevel = "error" | "warn" | "info";

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2 };
const configuredLevel = process.env.LOG_LEVEL as LogLevel | undefined;
const minimumLevel = configuredLevel && configuredLevel in LEVELS ? LEVELS[configuredLevel] : LEVELS.info;
const secretKey = /key|token|secret/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      secretKey.test(key) ? "[REDACTED]" : redact(entry)
    ]));
  }
  return value;
}

function write(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVELS[level] > minimumLevel) {
    return;
  }
  const safeContext = redact(context ?? {}) as LogContext;
  const record = { ts: new Date().toISOString(), level, msg: message, ...safeContext };
  process.stderr.write(`${JSON.stringify(record)}\n`);
}

export const log = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context)
};