import winston from "winston";
import { env } from "../../core/config";
import { redactSensitive } from "./redact";
import { resolveLogOutput } from "./logger-config";
import { injectRequestContext } from "./request-context-format";

// Đầu ra log theo env (p0-11): `LOG_STDOUT=true` (production trên Railway/PaaS/compose) → chỉ JSON ra stdout, không tạo file; `LOG_FORMAT`/`LOG_TO_FILE` ghi đè.
// Không đặt hai biến mới thì hành vi y hệt trước đây — xem `logger-config.ts`.
const output = resolveLogOutput({ nodeEnv: env.NODE_ENV, logStdout: env.LOG_STDOUT, logToFile: env.LOG_TO_FILE, logFormat: env.LOG_FORMAT });

const transports: winston.transport[] = [];
if (output.file) {
  transports.push(
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" })
  );
}
if (output.console) {
  transports.push(
    new winston.transports.Console(
      output.consoleFormat === "pretty" ? { format: winston.format.combine(winston.format.colorize(), winston.format.simple()) } : {}
    )
  );
}

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    // Gắn `requestId`/`userId` của request đang xử lý (AsyncLocalStorage) vào mọi dòng log — TRƯỚC `redactSensitive` để mọi khoá đều đi qua chốt che.
    injectRequestContext(),
    // Chốt chặn che `password`/`secret`/`*token`… trong meta cho MỌI transport (p0-01 §12, p0-13 BIO-20) — chạy ở cấp logger nên cả child logger đều được che.
    redactSensitive(),
    winston.format.json()
  ),
  defaultMeta: { service: env.APP_NAME },
  transports,
});

/**
 * Tạo child logger với context (requestId, userId, ...).
 * Dùng trong controller/service khi cần trace request cụ thể.
 *
 * @example
 * const log = createContextLogger({ requestId: req.requestId, userId: req.user?.id });
 * log.info("Processing order", { orderId: "123" });
 * // → { requestId: "uuid", userId: "abc", message: "Processing order", orderId: "123" }
 */
export function createContextLogger(context: Record<string, unknown>): winston.Logger {
  return logger.child(context);
}

export default logger;
