import { Writable } from "node:stream";
import winston from "winston";
import { resolveLogOutput } from "../logger-config";
import { injectRequestContext } from "../request-context-format";
import { runWithRequestContext } from "../../../core/middlewares/request-context";

/**
 * p0-11 — đầu ra log: KHÔNG đặt LOG_FORMAT/LOG_TO_FILE thì hành vi y hệt trước đây (Railway `LOG_STDOUT=true` giữ nguyên); có đặt thì ghi đè đúng ý.
 */
describe("resolveLogOutput", () => {
  it.each([
    // [mô tả, đầu vào, file, console, format]
    ["production + LOG_STDOUT=true (Railway/compose): chỉ stdout JSON", { nodeEnv: "production", logStdout: true }, false, true, "json"],
    ["production mặc định (docker-compose cũ): chỉ file, không console", { nodeEnv: "production", logStdout: false }, true, false, "json"],
    ["dev: file + console dễ đọc", { nodeEnv: "development", logStdout: false }, true, true, "pretty"],
    ["test: như dev", { nodeEnv: "test", logStdout: false }, true, true, "pretty"],
    ["dev + LOG_STDOUT=true vẫn ghi file (LOG_STDOUT chỉ có nghĩa ở production)", { nodeEnv: "development", logStdout: true }, true, true, "pretty"],
  ] as const)("%s", (_name, input, file, consoleOn, format) => {
    expect(resolveLogOutput(input)).toEqual({ file, console: consoleOn, consoleFormat: format });
  });

  it("LOG_TO_FILE=false ở production (kế hoạch p0-11) ≡ LOG_STDOUT=true: stdout, không file", () => {
    expect(resolveLogOutput({ nodeEnv: "production", logStdout: false, logToFile: false })).toEqual({ file: false, console: true, consoleFormat: "json" });
  });

  it("LOG_TO_FILE=false ở dev tắt file (CI); LOG_TO_FILE=true ở production bật thêm file", () => {
    expect(resolveLogOutput({ nodeEnv: "development", logStdout: false, logToFile: false }).file).toBe(false);
    expect(resolveLogOutput({ nodeEnv: "production", logStdout: true, logToFile: true })).toEqual({ file: true, console: true, consoleFormat: "json" });
  });

  it("LOG_FORMAT ghi đè định dạng console theo cả hai chiều", () => {
    expect(resolveLogOutput({ nodeEnv: "production", logStdout: true, logFormat: "pretty" }).consoleFormat).toBe("pretty");
    expect(resolveLogOutput({ nodeEnv: "development", logStdout: false, logFormat: "json" }).consoleFormat).toBe("json");
  });
});

describe("injectRequestContext (winston format) — LOG_FORMAT=json in một dòng JSON có requestId", () => {
  async function logLine(meta: Record<string, unknown>, ctx?: { requestId: string; userId?: string }): Promise<Record<string, unknown>> {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = winston.createLogger({
      format: winston.format.combine(winston.format.timestamp(), injectRequestContext(), winston.format.json()),
      transports: [new winston.transports.Stream({ stream })],
    });
    const write = () => logger.info("xin chào", meta);
    if (ctx) runWithRequestContext(ctx, write);
    else write();
    await new Promise((resolve) => setImmediate(resolve));
    logger.close();
    expect(lines).toHaveLength(1);
    return JSON.parse(lines[0]) as Record<string, unknown>;
  }

  it("trong request: gắn requestId và userId từ AsyncLocalStorage", async () => {
    const line = await logLine({}, { requestId: "req-1", userId: "u-9" });
    expect(line).toMatchObject({ message: "xin chào", level: "info", requestId: "req-1", userId: "u-9" });
  });

  it("giá trị call-site đặt sẵn không bị ghi đè", async () => {
    const line = await logLine({ requestId: "explicit", userId: "u-explicit" }, { requestId: "req-1", userId: "u-9" });
    expect(line).toMatchObject({ requestId: "explicit", userId: "u-explicit" });
  });

  it("ngoài request (worker/khởi động): không thêm trường nào", async () => {
    const line = await logLine({});
    expect(line).not.toHaveProperty("requestId");
    expect(line).not.toHaveProperty("userId");
  });

  it("chưa xác thực: có requestId, không có userId", async () => {
    const line = await logLine({}, { requestId: "req-2" });
    expect(line.requestId).toBe("req-2");
    expect(line).not.toHaveProperty("userId");
  });
});
