/**
 * Quyết định đầu ra log từ env (p0-11 be.md §1/§3) — hàm THUẦN để test được không cần dựng winston.
 *
 * Hành vi cũ được giữ nguyên khi KHÔNG đặt `LOG_FORMAT`/`LOG_TO_FILE`:
 *  · production + `LOG_STDOUT=true`  → chỉ stdout (JSON) — Railway/Docker gom log từ stdout, đĩa container là tạm thời;
 *  · production + `LOG_STDOUT` tắt   → chỉ file `logs/*.log` (docker-compose cũ có volume `./logs`);
 *  · dev/test                        → file + console (định dạng dễ đọc).
 * `LOG_TO_FILE=false` ≡ `LOG_STDOUT=true` (tên theo kế hoạch p0-11); `LOG_FORMAT` chỉ đổi định dạng của console/stdout (file luôn là JSON).
 */
export type LogFormat = "json" | "pretty";

export interface LogOutputInput {
  nodeEnv: string;
  logStdout: boolean;
  logToFile?: boolean;
  logFormat?: LogFormat;
}

export interface LogOutputPlan {
  /** Ghi `logs/error.log` + `logs/combined.log`. */
  file: boolean;
  /** Có transport console/stdout không. */
  console: boolean;
  consoleFormat: LogFormat;
}

export function resolveLogOutput(input: LogOutputInput): LogOutputPlan {
  const production = input.nodeEnv === "production";
  return {
    file: input.logToFile ?? !(production && input.logStdout),
    console: !production || input.logStdout || input.logToFile === false,
    consoleFormat: input.logFormat ?? (production ? "json" : "pretty"),
  };
}
