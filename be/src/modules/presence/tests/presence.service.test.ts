/**
 * presence.service — bảng chân lý `computeState` (README §2) + throttle/audience/
 * HIDDEN (be.md §5.4, RT-03..06). Unit test: mock Redis (fake Map — xem
 * `core/permission/tests/fixtures/fake-redis.ts`) + mock `socket.emit`/`user-status`
 * để tách khỏi hạ tầng Socket.IO/Mongo thật.
 */
jest.mock("../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../../../core/permission/tests/fixtures/fake-redis");
  return createFakeRedisModule();
});
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToRoom: jest.fn() }));
jest.mock("../../../core/permission/user-status", () => ({ getUserStatusCached: jest.fn() }));

import { installFakeRedis, type FakeRedisMock } from "../../../core/permission/tests/fixtures/fake-redis";
import { redis } from "../../../infrastructure/redis";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import {
  computeState,
  heartbeat,
  setDnd,
  recomputeAndMaybeEmit,
  reap,
  getStates,
  registerPresenceAudience,
  clearPresenceAudience,
  onDeviceDisconnect,
  registerPresenceJoinRooms,
  clearPresenceJoinRooms,
  presenceJoinRooms,
} from "../presence.service";

const USER = "u1";

describe("presence.service", () => {
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    (getUserStatusCached as jest.Mock).mockResolvedValue({
      status: "ACTIVE",
      sessionVersion: 1,
      showPresence: true,
    });
    clearPresenceAudience();
  });

  afterEach(() => {
    clearPresenceAudience();
  });

  describe("computeState — bảng chân lý (README §2)", () => {
    it("chưa từng heartbeat → OFFLINE", async () => {
      expect(await computeState(USER)).toBe("OFFLINE");
    });

    it("có heartbeat active gần đây, không DND → ONLINE", async () => {
      await heartbeat(USER, "dev1", true);
      expect(await computeState(USER)).toBe("ONLINE");
    });

    it("có heartbeat nhưng active=false (không tương tác) → IDLE", async () => {
      await heartbeat(USER, "dev1", false);
      expect(await computeState(USER)).toBe("IDLE");
    });

    it("DND bật + còn thiết bị beat → DND (ưu tiên hơn active/idle)", async () => {
      await heartbeat(USER, "dev1", true);
      await setDnd(USER, true);
      expect(await computeState(USER)).toBe("DND");
    });

    it("DND bật nhưng KHÔNG còn thiết bị beat → vẫn OFFLINE (alive check đứng trước DND)", async () => {
      await setDnd(USER, true);
      expect(await computeState(USER)).toBe("OFFLINE");
    });

    it("RT-03: 2 thiết bị, 1 thiết bị hết lease nhưng thiết bị kia còn beat → vẫn ONLINE", async () => {
      await heartbeat(USER, "dev1", true);
      await redis.hset(`presence:dev:${USER}`, "dev2", String(Date.now() - 999_000));
      expect(await computeState(USER)).toBe("ONLINE");
    });

    it("RT-04: mọi thiết bị đều hết lease → OFFLINE", async () => {
      await redis.hset(`presence:dev:${USER}`, "dev1", String(Date.now() - 999_000));
      expect(await computeState(USER)).toBe("OFFLINE");
    });
  });

  describe("recomputeAndMaybeEmit — throttle + audience + HIDDEN", () => {
    it("trạng thái không đổi → KHÔNG emit lại", async () => {
      await heartbeat(USER, "dev1", true);
      (emitToRoom as jest.Mock).mockClear();
      await heartbeat(USER, "dev1", true);
      expect(emitToRoom).not.toHaveBeenCalled();
    });

    it("không có audience đăng ký (Phase 0 mặc định) → KHÔNG emit đi đâu", async () => {
      await heartbeat(USER, "dev1", true);
      expect(emitToRoom).not.toHaveBeenCalled();
    });

    it("có audience đăng ký → emit presence:updated vào đúng room với state thật", async () => {
      registerPresenceAudience(async () => ["ws:test", ROOM.user("peer")]);
      await heartbeat(USER, "dev1", true);
      expect(emitToRoom).toHaveBeenCalledWith("ws:test", "presence:updated", { userId: USER, state: "ONLINE" });
      expect(emitToRoom).toHaveBeenCalledWith(ROOM.user("peer"), "presence:updated", {
        userId: USER,
        state: "ONLINE",
      });
    });

    it("RT-06: showPresence=false → audience thấy HIDDEN dù trạng thái thật là ONLINE", async () => {
      (getUserStatusCached as jest.Mock).mockResolvedValue({
        status: "ACTIVE",
        sessionVersion: 1,
        showPresence: false,
      });
      registerPresenceAudience(async () => ["ws:test"]);
      await heartbeat(USER, "dev1", true);
      expect(emitToRoom).toHaveBeenCalledWith("ws:test", "presence:updated", { userId: USER, state: "HIDDEN" });
    });

    it("throttle 5s: đổi trạng thái lần 2 trong cửa sổ bị chặn; sau khi throttle hết mới emit tiếp", async () => {
      registerPresenceAudience(async () => ["ws:test"]);
      await heartbeat(USER, "dev1", true); // OFFLINE → ONLINE, emit lần 1 (giữ throttle key)
      expect(emitToRoom).toHaveBeenCalledTimes(1);

      await redis.del(`presence:active:${USER}`); // giả lập hết active → sẽ tính ra IDLE
      await recomputeAndMaybeEmit(USER); // đổi thật (ONLINE→IDLE) nhưng còn trong cửa sổ throttle → bỏ qua
      expect(emitToRoom).toHaveBeenCalledTimes(1);

      await redis.del(`presence:throttle:${USER}`); // giả lập TTL throttle đã hết
      await recomputeAndMaybeEmit(USER);
      expect(emitToRoom).toHaveBeenCalledTimes(2);
      expect(emitToRoom).toHaveBeenLastCalledWith("ws:test", "presence:updated", { userId: USER, state: "IDLE" });
    });

    it("OFFLINE luôn được phát ngay, KHÔNG bị throttle chặn", async () => {
      registerPresenceAudience(async () => ["ws:test"]);
      await heartbeat(USER, "dev1", true);
      (emitToRoom as jest.Mock).mockClear();

      await redis.hdel(`presence:dev:${USER}`, "dev1"); // hết lease → OFFLINE
      await redis.setNx(`presence:throttle:${USER}`, "1", 5); // giả lập throttle đang còn hiệu lực

      await recomputeAndMaybeEmit(USER);
      expect(emitToRoom).toHaveBeenCalledWith("ws:test", "presence:updated", { userId: USER, state: "OFFLINE" });
    });
  });

  describe("reap()", () => {
    it("quét presence:state:* khác OFFLINE, phát lại nếu trạng thái đã đổi", async () => {
      registerPresenceAudience(async () => ["ws:test"]);
      await heartbeat(USER, "dev1", true);
      (emitToRoom as jest.Mock).mockClear();

      await redis.hdel(`presence:dev:${USER}`, "dev1"); // hết lease, chưa có trigger nào phát lại

      const recomputed = await reap();
      expect(recomputed).toBeGreaterThanOrEqual(1);
      expect(emitToRoom).toHaveBeenCalledWith("ws:test", "presence:updated", { userId: USER, state: "OFFLINE" });
    });

    it("bỏ qua key đã OFFLINE (không recompute lại lần 2)", async () => {
      registerPresenceAudience(async () => ["ws:test"]);
      await heartbeat(USER, "dev1", true);
      await redis.hdel(`presence:dev:${USER}`, "dev1");
      await reap(); // → OFFLINE lần đầu
      (emitToRoom as jest.Mock).mockClear();

      const recomputedAgain = await reap();
      expect(recomputedAgain).toBe(0);
      expect(emitToRoom).not.toHaveBeenCalled();
    });
  });

  describe("getStates() — GET /presence", () => {
    it("chính chủ luôn thấy trạng thái thật của mình", async () => {
      await heartbeat(USER, "dev1", true);
      const result = await getStates(USER, [USER]);
      expect(result[USER]).toEqual({ state: "ONLINE" });
    });

    it("người khác, không thuộc audience (Phase 0 chưa có resolver) → HIDDEN", async () => {
      await heartbeat("target", "dev1", true);
      const result = await getStates("viewer", ["target"]);
      expect(result["target"]).toEqual({ state: "HIDDEN" });
    });

    it("người khác, viewer nằm trong audience của target → thấy trạng thái thật", async () => {
      registerPresenceAudience(async (userId) => (userId === "target" ? [ROOM.user("viewer")] : []));
      await heartbeat("target", "dev1", true);
      const result = await getStates("viewer", ["target"]);
      expect(result["target"]).toEqual({ state: "ONLINE" });
    });
  });

  describe("presenceJoinRooms — hook 'room tự join lúc connect' (be.md §5.1)", () => {
    afterEach(() => clearPresenceJoinRooms());

    it("chưa đăng ký resolver (Phase 0) → rỗng", async () => {
      expect(await presenceJoinRooms(USER)).toEqual([]);
    });

    it("có resolver đăng ký → trả đúng danh sách room", async () => {
      registerPresenceJoinRooms(async (userId) => [`ws:a`, `ws:b-${userId}`]);
      expect(await presenceJoinRooms(USER)).toEqual(["ws:a", `ws:b-${USER}`]);
    });

    it("resolver ném lỗi → fail-open về rỗng (không chặn connect)", async () => {
      registerPresenceJoinRooms(async () => {
        throw new Error("boom");
      });
      expect(await presenceJoinRooms(USER)).toEqual([]);
    });
  });

  describe("onDeviceDisconnect", () => {
    it("xoá field thiết bị khỏi lease nhưng KHÔNG phát OFFLINE ngay (be.md §5.1 'không hứa tức thì')", async () => {
      registerPresenceAudience(async () => ["ws:test"]);
      await heartbeat(USER, "dev1", true);
      (emitToRoom as jest.Mock).mockClear();

      await onDeviceDisconnect(USER, "dev1");
      expect(emitToRoom).not.toHaveBeenCalled();
      expect(await computeState(USER)).toBe("OFFLINE");
    });
  });
});
