type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function shouldLog(level: Level) {
  const configured = (process.env.LOG_LEVEL as Level) || "info";
  return order[level] >= (order[configured] ?? 20);
}

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(data ? { data } : {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  debug: (msg: string, data?: Record<string, unknown>) => emit("debug", msg, data),
  info: (msg: string, data?: Record<string, unknown>) => emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit("error", msg, data),
};
