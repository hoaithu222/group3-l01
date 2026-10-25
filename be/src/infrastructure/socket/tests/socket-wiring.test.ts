import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Test TĨNH giữ dây nối của cầu nối worker → socket (p0-03) — import `worker.ts`/`server.ts` kéo cả ứng dụng (DB, Redis, BullMQ) nên đọc mã nguồn.
 * Nếu ai đó gỡ `initSocketBridge()` khỏi `worker.ts`, mọi emit trong job (call:*, message:*, permission:revoked…) lặng lẽ ném lỗi/bị bỏ ở
 * production (worker riêng); nếu ai đó tự `getIO()` ở module nghiệp vụ, code đó lại hỏng ở worker.
 */
const SRC = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" || entry.name === "node_modules" ? [] : listSourceFiles(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

describe("nối dây cầu nối worker → socket", () => {
  const worker = read("worker.ts");

  it("worker.ts bật cầu nối TRƯỚC khi đăng ký/khởi động job, và đóng SAU closeWorkers, TRƯỚC khi ngắt Redis", () => {
    const init = worker.indexOf("initSocketBridge();");
    expect(init).toBeGreaterThan(-1);
    expect(init).toBeLessThan(worker.indexOf("await registerAllJobs();"));
    expect(init).toBeLessThan(worker.indexOf("startWorkers();"));

    const closeWorkersAt = worker.indexOf("closeWorkers(workers)");
    const closeBridgeAt = worker.indexOf("closeSocketBridge()");
    expect(closeBridgeAt).toBeGreaterThan(closeWorkersAt); // job đã xong hết mới đóng cầu nối (lệnh PUBLISH cuối còn được chờ)
    expect(closeBridgeAt).toBeLessThan(worker.indexOf("redis.disconnect()")); // …và TRƯỚC khi đóng client Redis dùng chung
  });

  it("server.ts (API/all) KHÔNG bật cầu nối — đã có Server Socket.IO, phát trực tiếp", () => {
    expect(read("server.ts")).not.toContain("initSocketBridge");
  });

  it("adapter API và emitter worker dùng CÙNG khoá kênh; instance API đăng ký listener lệnh recheck", () => {
    const server = read("infrastructure/socket/socket.server.ts");
    expect(server).toContain("createAdapter(pubClient, subClient, { key: SOCKET_IO_REDIS_KEY })");
    expect(server).toContain("registerSocketBridgeListeners(io)");
  });

  it("module nghiệp vụ/core KHÔNG import getIO để emit (worker không có Server) — chỉ 2 chỗ ĐỌC trạng thái phòng (fetchSockets) ở API được phép", () => {
    // Cần ĐỌC danh sách socket (`fetchSockets`) — cầu nối là MỘT CHIỀU nên các chỗ này chỉ chạy đúng ở tiến trình API và tự xử lý khi thiếu Server.
    const ALLOWED = new Set(["modules/live-quiz/realtime/live-quiz.presence.ts", "modules/notifications/services/delivery.policy.ts"]);
    const importsGetIO = /import\s*\{[^}]*\bgetIO\b[^}]*\}\s*from\s*["'][^"']*infrastructure\/socket[^"']*["']/;

    const offenders = ["modules", "core"]
      .flatMap((dir) => listSourceFiles(join(SRC, dir)))
      .filter((file) => importsGetIO.test(readFileSync(file, "utf8")))
      .map((file) => relative(SRC, file).split(sep).join("/"))
      .filter((file) => !ALLOWED.has(file));

    // Emit/leave/join/disconnect PHẢI đi qua emitToRoom/emitToUsers/emitToScope/emitToAll/leaveRooms/joinRooms/disconnectUserSockets (`socket.emit.ts`).
    expect(offenders).toEqual([]);
  });
});
