import { Server, type DefaultEventsMap, type Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifyAccessContext } from "../../core/permission/access-context";
import { AppError } from "../../core/exceptions";
import { ErrorCode } from "../../core/utils/error.codes";
import { getAllowedOrigins, env } from "../../core/config";
import { logger } from "../logger";
import { redis } from "../redis";
import type { AuthUser } from "../../core/types/express";
import { SocketEvent } from "./socket.events";
import { joinRoom, registerRoomGuard, ROOM } from "./socket.rooms";
import { socketConnections, socketAdapterUp } from "../metrics";
import { registerPermissionGuards } from "./socket.guards";
import { registerRateLimiter, clearRateLimit } from "./socket.ratelimit";
import { registryAdd, registryRemove, buildConnectionInfo } from "./socket.registry";
import { SOCKET_IO_REDIS_KEY } from "./socket.bridge";
import { registerSocketBridgeListeners } from "./socket.bridge.listener";
import { registerRoomHandlers } from "./handlers/room.handler";
import { registerAuthHandlers, scheduleSessionExpiring, cancelSessionExpiring } from "./handlers/auth.handler";
import { registerPresenceHandlers } from "./handlers/presence.handler";
import { registerTypingHandlers } from "./handlers/typing.handler";
import { registerQuizHandlers } from "./handlers/quiz.handler";
import { dropViewing } from "./socket.viewing";
import { onDeviceDisconnect, presenceJoinRooms } from "../../modules/presence/presence.service";

/** Gắn `data.code` vào Error — Socket.IO gửi field này cho client qua `connect_error`. */
function withErrorCode(message: string, code: string): Error & { data: { code: string } } {
  return Object.assign(new Error(message), { data: { code } });
}

const PLATFORMS = ["ANDROID", "IOS", "WEB"] as const;
export type Platform = (typeof PLATFORMS)[number];

/** ≤ 64 ký tự (be.md §3 handshake) — thiếu/không hợp lệ → `undefined`, nơi gọi tự sinh `anon-{socketId}`. */
function sanitizeDeviceId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 64 ? trimmed : undefined;
}

/** Giá trị lạ/thiếu (thường gặp ở admin web không gửi `platform`) → mặc định `WEB`. */
function parsePlatform(value: unknown): Platform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value)
    ? (value as Platform)
    : "WEB";
}

function sanitizeAppVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 32 ? trimmed : undefined;
}

/** Server-side socket data gắn vào mỗi socket */
export interface SocketData {
  user: AuthUser;
  /** ≤ 64 ký tự — thiếu ở handshake → `anon-{socketId}` (be.md §3, thường gặp ở admin web). */
  deviceId: string;
  platform: Platform;
  appVersion?: string;
  /** `exp` (giây, UNIX) của access token đang dùng — nguồn lịch `session:expiring` (`auth.handler.ts`). */
  exp?: number;
}

export type AppServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

let ioInstance: AppServer | null = null;

/**
 * Phần CHẬM của `connection`: join `user:{id}` + room `presenceJoinRooms` (đọc DB) + ghi connection registry. Listener C→S và
 * `disconnect` đã đăng ký từ trước nên sự kiện đến sớm vẫn được xử lý; client ngắt giữa chừng thì KHÔNG join/ghi tiếp — `socket.join`
 * trên socket đã đóng để lại thành viên "ma" trong adapter, `registryAdd` sau `registryRemove` để lại bản ghi mồ côi tới hết TTL.
 * Lỗi → ngắt để client tự kết nối lại (socket thiếu room `user:{id}` sẽ im lặng mất mọi sự kiện gửi riêng).
 */
async function bootstrapConnection(socket: AppSocket): Promise<void> {
  const user = socket.data.user;
  try {
    // Mỗi user tự join room riêng để nhận emitToUser/emitToUsers
    await joinRoom(socket, ROOM.user(user.id));
    socket.emit(SocketEvent.USER_CONNECTED, { userId: user.id });

    // be.md §5.1 — Phase 1 đăng ký (`registerPresenceJoinRooms`) để tự join
    // thêm `ws:*` của workspace ACTIVE; Phase 0 chưa có registrar → rỗng.
    const extraRooms = await presenceJoinRooms(user.id);
    if (socket.disconnected) return;
    await Promise.all(extraRooms.map((room) => joinRoom(socket, room)));

    await registryAdd(user.id, socket.id, buildConnectionInfo(socket.data.deviceId, socket.data.platform));
    if (socket.disconnected) {
      // `disconnect` (registryRemove) có thể đã chạy TRƯỚC khi bản ghi vừa rồi hạ cánh — xoá lại cho chắc.
      await registryRemove(user.id, socket.id);
      return;
    }

    scheduleSessionExpiring(socket);
  } catch (error) {
    logger.warn(`[Socket] Khởi tạo kết nối lỗi, ngắt để client kết nối lại: ${user.id} (${socket.id})`, {
      error: error instanceof Error ? error.message : String(error),
    });
    socket.disconnect(true);
  }
}

/**
 * Khởi tạo Socket.IO server và attach vào http.Server.
 * Gọi 1 lần duy nhất trong server.ts.
 */
export function initSocketServer(httpServer: HttpServer): Server {
  const io: AppServer = new Server(httpServer, {
    cors: {
      origin: getAllowedOrigins(),
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    // be.md p0-03 §9 — cùng nhịp với app (heartbeat 30s, lease 90s) + chặn
    // payload C→S vượt `LIMITS.realtime.clientEventMaxBytes` (16 KiB) ở tầng
    // engine.io trước cả khi tới `socket.ratelimit.ts`.
    pingInterval: 25_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 64 * 1024,
    // connectionStateRecovery CỐ Ý không bật — dùng resync theo `afterSeq`
    // (module chat, P1) thay vì tin đã giao đủ event qua buffer recovery.
  });

  // SOCKET_ADAPTER=memory (dev/test 1 instance) → bỏ qua hẳn, không thử kết
  // nối Redis. "redis" (mặc định, bắt buộc ở prod — `validate-runtime.ts`).
  if (env.SOCKET_ADAPTER === "redis") {
    void (async () => {
      try {
        const baseClient = await redis.connect();
        const pubClient = baseClient.duplicate();
        const subClient = baseClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);
        // `key` DÙNG CHUNG với emitter của worker (`socket.bridge.ts`) — lệch nhau là sự kiện từ worker không tới client.
        io.adapter(createAdapter(pubClient, subClient, { key: SOCKET_IO_REDIS_KEY }));
        socketAdapterUp.set(1);
        logger.info("[Socket] Đã gắn Redis Adapter để chạy đa server");
      } catch (error) {
        socketAdapterUp.set(0);
        logger.warn("[Socket] Không thể gắn Redis Adapter, chạy chế độ single instance:", error);
      }
    })();
  } else {
    socketAdapterUp.set(0);
    logger.info("[Socket] SOCKET_ADAPTER=memory — chạy chế độ single-instance (dev/test)");
  }

  // Lệnh cấp cụm từ worker (`serverSideEmit`, chỉ `emitToScope({ recheck })`) — xem `socket.bridge.listener.ts`.
  registerSocketBridgeListeners(io);

  // ─── Middleware: xác thực JWT từ handshake.auth.token ───────────────────────
  // Dùng chung `verifyAccessContext` với `authenticateToken` (HTTP) — token
  // bị blacklist/tài khoản khoá/sessionVersion lệch bị từ chối GIỐNG HỆT trên
  // cả 2 kênh, không lệch nhau.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth["token"] as string | undefined;
    if (!token) {
      next(withErrorCode("Không có token xác thực", ErrorCode.AUTH_002));
      return;
    }
    try {
      const ctx = await verifyAccessContext(token);
      socket.data.user = ctx.user;
      socket.data.exp = ctx.exp;
      socket.data.deviceId = sanitizeDeviceId(socket.handshake.auth["deviceId"]) ?? `anon-${socket.id}`;
      socket.data.platform = parsePlatform(socket.handshake.auth["platform"]);
      socket.data.appVersion = sanitizeAppVersion(socket.handshake.auth["appVersion"]);
      next();
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Token không hợp lệ hoặc đã hết hạn";
      const code = err instanceof AppError ? err.errorCode : ErrorCode.AUTH_002;
      next(withErrorCode(message, code));
    }
  });

  // Room "user:{id}" luôn hợp lệ khi chính chủ tự join — mọi module khác đăng
  // ký guard riêng cho tiền tố của mình lúc khởi tạo (vd "ch" → channelAccess).
  registerRoomGuard("user", (user, id) => Promise.resolve(user.id === id));
  // ws/ch/conv/call/meet → PermissionService (p0-02 §6). Đăng ký ở đây (không
  // side-effect import) vì gắn với vòng đời `initSocketServer()`, gọi lại mỗi
  // lần server test khởi tạo cũng vô hại (Map ghi đè theo key).
  registerPermissionGuards();

  // ─── Connection handler ──────────────────────────────────────────────────────
  // ⛔ ĐỒNG BỘ, KHÔNG `await` trước khi đăng ký xong mọi listener. Socket.IO không đệm sự kiện cho socket chưa có listener:
  // client emit `room:join`/`presence:heartbeat` ngay khi nhận `connect` sẽ tới server lúc handler còn đang chờ join room/đọc DB
  // → sự kiện bị rớt im lặng, ack không bao giờ về. `disconnect` phát ra trong lúc đó cũng lọt (gauge `socketConnections`
  // không giảm, registry/timer rò). Phần chậm nằm ở `bootstrapConnection`, chạy SAU khi listener đã sẵn sàng.
  io.on("connection", (socket) => {
    const user = socket.data.user;
    logger.info(`[Socket] User connected: ${user.id} (${socket.id})`);
    socketConnections.inc();

    // Chặn payload quá khổ/spam TRƯỚC khi tới bất kỳ handler nào bên dưới.
    registerRateLimiter(socket);
    registerRoomHandlers(io, socket);
    registerAuthHandlers(io, socket);
    registerPresenceHandlers(io, socket);
    registerTypingHandlers(io, socket);
    registerQuizHandlers(io, socket);

    // ─── Disconnect ──────────────────────────────────────────────────────────
    // KHÔNG io.emit toàn cục — lộ presence của mọi user cho mọi user khác.
    // Presence: xoá lease thiết bị này để `presence.reap` phát hiện sớm hơn,
    // KHÔNG phát OFFLINE ngay (be.md §5.1 "không hứa tức thì").
    // p1-07 §9 — `disconnecting` (không phải `disconnect`) vì lúc đó `socket.rooms` còn nguyên;
    // dropViewing chỉ dùng bookkeeping theo socketId nên an toàn ở cả 2 thời điểm.
    socket.on("disconnecting", () => {
      void dropViewing(socket.id, user.id);
    });
    socket.on("disconnect", (reason) => {
      logger.info(`[Socket] User disconnected: ${user.id} — reason: ${reason}`);
      socketConnections.dec();
      clearRateLimit(socket.id);
      cancelSessionExpiring(socket);
      void registryRemove(user.id, socket.id);
      void onDeviceDisconnect(user.id, socket.data.deviceId);
    });

    void bootstrapConnection(socket);
  });

  ioInstance = io;
  logger.info("[Socket] Socket.IO server đã khởi tạo");
  return io;
}

/**
 * Báo cho mọi thiết bị của 1 nhóm user rằng quyền của họ với 1 scope vừa bị
 * thu hồi (vd bị gỡ khỏi kênh, đổi role, khoá tài khoản) — payload khớp
 * be.md p0-02 §6. Core `revokeScope()` (`core/permission/revoke-scope.ts`)
 * gọi qua `RealtimePort.emitToUsers` (generic) thay vì hàm này trực tiếp;
 * hàm này giữ lại cho nơi khác cần emit thẳng (vd script admin) dùng đúng
 * hình dạng payload mà không tự ghép tay.
 */
export function emitPermissionRevoked(
  io: Server,
  userIds: string[],
  scopeType: string,
  scopeId: string,
  version: number,
  reason: string,
  cascade = false
): void {
  const rooms = userIds.map(ROOM.user);
  io.to(rooms).emit(SocketEvent.PERMISSION_REVOKED, {
    v: 1,
    scopeType,
    scopeId,
    version,
    reason,
    cascade,
  });
}

/**
 * Lấy Socket.IO server instance (sau khi đã init).
 *
 * ⛔ Code nghiệp vụ KHÔNG tự gọi `getIO()` để emit: tiến trình worker (`worker.ts`) không có instance này. Mọi emit đi qua
 * `emitToRoom/emitToUsers/emitToScope/emitToAll/leaveRooms/joinRooms` (`socket.emit.ts`) — tự chọn phát trực tiếp (API) hoặc qua cầu nối
 * Redis (worker, `socket.bridge.ts`). `getIO()` chỉ còn cho hạ tầng socket và việc ĐỌC trạng thái phòng (`fetchSockets`) ở tiến trình API.
 */
export function getIO(): Server {
  if (!ioInstance) {
    throw new Error("[Socket] Socket.IO chưa được khởi tạo. Gọi initSocketServer() trước.");
  }
  return ioInstance;
}

/** `null` khi tiến trình này không có Socket.IO (worker, script, test) — dùng để chọn đường phát, không ném lỗi. */
export function tryGetIO(): Server | null {
  return ioInstance;
}
