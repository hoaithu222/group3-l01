/**
 * presence.service × chặn người dùng (p1-08 BLOCK-06): `presence:updated` của B KHÔNG được gửi tới A (và ngược lại) khi 2 người
 * chặn nhau; `GET /presence` trả HIDDEN cho người bị ẩn; resolver lỗi → fail-open (vẫn phát); không đăng ký → hành vi cũ.
 * Mock Redis/`socket.emit` giống `presence.service.test.ts`.
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
  clearPresenceAudience,
  clearPresenceHiddenResolver,
  getStates,
  heartbeat,
  registerPresenceAudience,
  registerPresenceHiddenResolver,
} from "../presence.service";

const B = "user-b";

describe("presence × block", () => {
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
    clearPresenceAudience();
    clearPresenceHiddenResolver();
  });

  afterEach(() => {
    clearPresenceAudience();
    clearPresenceHiddenResolver();
  });

  it("BLOCK-06: presence của B phát vào room audience nhưng LOẠI TRỪ người đã chặn/bị B chặn (4-arg emitToRoom)", async () => {
    registerPresenceAudience(async () => ["ws:test"]);
    registerPresenceHiddenResolver(async (userId) => (userId === B ? new Set(["user-a"]) : new Set()));

    await heartbeat(B, "dev1", true);

    expect(emitToRoom).toHaveBeenCalledWith("ws:test", "presence:updated", { userId: B, state: "ONLINE" }, ["user-a"]);
  });

  it("không có ai bị ẩn → emit đúng 3 tham số như trước p1-08 (không thêm except rỗng)", async () => {
    registerPresenceAudience(async () => ["ws:test"]);
    registerPresenceHiddenResolver(async () => new Set());

    await heartbeat(B, "dev1", true);

    expect(emitToRoom).toHaveBeenCalledWith("ws:test", "presence:updated", { userId: B, state: "ONLINE" });
  });

  it("resolver lỗi → fail-open: vẫn phát presence (không chặn cả lượt), không ném lỗi", async () => {
    registerPresenceAudience(async () => ["ws:test"]);
    registerPresenceHiddenResolver(() => Promise.reject(new Error("db down")));

    await expect(heartbeat(B, "dev1", true)).resolves.toBeUndefined();

    expect(emitToRoom).toHaveBeenCalledWith("ws:test", "presence:updated", { userId: B, state: "ONLINE" });
  });

  it("GET /presence: viewer nằm trong audience nhưng bị ẩn (chặn hai chiều) → HIDDEN; người khác vẫn thấy trạng thái thật", async () => {
    await heartbeat(B, "dev1", true);
    registerPresenceAudience(async () => [ROOM.user("viewer-blocked"), ROOM.user("viewer-ok")]);
    registerPresenceHiddenResolver(async () => new Set(["viewer-blocked"]));

    const blocked = await getStates("viewer-blocked", [B]);
    const ok = await getStates("viewer-ok", [B]);

    expect(blocked[B]).toEqual({ state: "HIDDEN" });
    expect(ok[B]).toEqual({ state: "ONLINE" });
  });
});
