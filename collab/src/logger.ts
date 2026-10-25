/**
 * Logger JSON-lines tối giản (stdout) — collab/ không kéo winston/pino để image nhẹ.
 * Không bao giờ log token/secret: caller chỉ truyền id + mã lỗi (xem README "Bảo mật").
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export type LogMeta = Record<string, unknown>;

export interface Logger {
  debug(msg: string, meta?: LogMeta): void;
  info(msg: string, meta?: LogMeta): void;
  warn(msg: string, meta?: LogMeta): void;
  error(msg: string, meta?: LogMeta): void;
  child(bindings: LogMeta): Logger;
}

export type LogSink = (line: string) => void;

const stdoutSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

/** Chuẩn hoá `Error`/giá trị lạ thành object JSON được (stack chỉ ghi ở mức error). */
export function errorMeta(err: unknown): LogMeta {
  if (err instanceof Error) return { error: err.message, errorName: err.name, ...(err.stack ? { stack: err.stack } : {}) };
  return { error: String(err) };
}

export function createLogger(level: LogLevel, bindings: LogMeta = {}, sink: LogSink = stdoutSink): Logger {
  const min = ORDER[level];
  const write = (lvl: LogLevel, msg: string, meta?: LogMeta): void => {
    if (ORDER[lvl] < min) return;
    sink(JSON.stringify({ ts: new Date().toISOString(), level: lvl, msg, ...bindings, ...meta }));
  };
  return {
    debug: (msg, meta) => write("debug", msg, meta),
    info: (msg, meta) => write("info", msg, meta),
    warn: (msg, meta) => write("warn", msg, meta),
    error: (msg, meta) => write("error", msg, meta),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink),
  };
}

/** Logger im lặng cho test. */
export const silentLogger: Logger = createLogger("error", {}, () => undefined);
