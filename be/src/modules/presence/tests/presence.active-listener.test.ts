/**
 * presence.service — điểm nghe nhịp "đang tương tác" (`registerPresenceActiveListener`, p7-03 burnout): chỉ gọi khi nhịp `active = true`, chạy NỀN (không chặn/không làm hỏng nhịp), lỗi listener bị nuốt,
 * đăng ký lại cùng tên ghi đè. Cùng khuôn mock với `presence.service.test.ts`.
 */
jest.mock("../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createFakeRedisModule } = require("../../../core/permission/tests/fixtures/fake-redis");
  return createFakeRedisModule();
});
jest.mock("../../../infrastructure/socket/socket.emit", () => ({ emitToRoom: jest.fn() }));
jest.mock("../../../core/permission/user-status", () => ({ getUserStatusCached: jest.fn() }));

import { installFakeRedis, type FakeRedisMock } from "../../../core/permission/tests/fixtures/fake-redis";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { redis } from "../../../infrastructure/redis";
import { clearPresenceActiveListeners, heartbeat, presenceRegistrations, registerPresenceActiveListener } from "../presence.service";

const USER = "u1";
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe("registerPresenceActiveListener", () => {
  beforeEach(() => {
    installFakeRedis(redis as unknown as FakeRedisMock);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1, showPresence: true });
    clearPresenceActiveListeners();
  });
  afterEach(() => clearPresenceActiveListeners());

  it("nhịp active=true → listener nhận (userId, thời điểm); active=false → KHÔNG gọi", async () => {
    const listener = jest.fn();
    registerPresenceActiveListener("test", listener);
    await heartbeat(USER, "dev1", false);
    await flush();
    expect(listener).not.toHaveBeenCalled();
    const before = Date.now();
    await heartbeat(USER, "dev1", true);
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    const [userId, at] = listener.mock.calls[0] as [string, Date];
    expect(userId).toBe(USER);
    expect(at).toBeInstanceOf(Date);
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("listener lỗi (đồng bộ hoặc bất đồng bộ) bị nuốt: heartbeat vẫn hoàn tất, listener khác vẫn chạy", async () => {
    const good = jest.fn();
    registerPresenceActiveListener("sync-throw", () => {
      throw new Error("hỏng đồng bộ");
    });
    registerPresenceActiveListener("async-reject", () => Promise.reject(new Error("hỏng bất đồng bộ")));
    registerPresenceActiveListener("good", good);
    await expect(heartbeat(USER, "dev1", true)).resolves.toBeUndefined();
    await flush();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("listener chậm KHÔNG chặn nhịp (heartbeat trả về trước khi listener xong)", async () => {
    let finished = false;
    registerPresenceActiveListener("slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      finished = true;
    });
    await heartbeat(USER, "dev1", true);
    expect(finished).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(finished).toBe(true);
  });

  it("đăng ký lại cùng tên ghi đè; cố ý KHÔNG nằm trong `presenceRegistrations()` (worker không nhận nhịp — test parity API ↔ worker)", async () => {
    const first = jest.fn();
    const second = jest.fn();
    registerPresenceActiveListener("dup", first);
    registerPresenceActiveListener("dup", second);
    await heartbeat(USER, "dev1", true);
    await flush();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(Object.keys(presenceRegistrations()).sort()).toEqual(["audience", "hiddenResolver", "joinRooms"]);
  });
});
