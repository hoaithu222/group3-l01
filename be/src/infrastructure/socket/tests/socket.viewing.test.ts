const mockStore = new Map<string, unknown>();
jest.mock("../../redis", () => ({
  redis: {
    set: jest.fn((key: string, value: unknown) => {
      mockStore.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      mockStore.delete(key);
      return Promise.resolve();
    }),
    exists: jest.fn((key: string) => Promise.resolve(mockStore.has(key))),
  },
}));

import { redis } from "../../redis";
import { dropViewing, isViewing, scopeKeyFromRoom, syncViewing, viewingKey } from "../socket.viewing";

const U = "64b000000000000000000001";
const CONV = "64b000000000000000000100";
const CH = "64b000000000000000000200";
const THREAD = "64b000000000000000000300";

describe("scopeKeyFromRoom", () => {
  it("conv:/ch: → scopeKey; room khác → null", () => {
    expect(scopeKeyFromRoom(`conv:${CONV}`)).toBe(`CONVERSATION:${CONV}`);
    expect(scopeKeyFromRoom(`ch:${CH}`)).toBe(`CHANNEL:${CH}`);
    expect(scopeKeyFromRoom(`user:${U}`)).toBeNull();
    expect(scopeKeyFromRoom(`ws:${CH}`)).toBeNull();
    expect(scopeKeyFromRoom("khong-co-dau-hai-cham")).toBeNull();
  });
});

describe("socket.viewing — khoá 'đang xem' (p1-07 §9)", () => {
  beforeEach(() => {
    mockStore.clear();
    (redis.set as jest.Mock).mockImplementation((key: string, value: unknown) => {
      mockStore.set(key, value);
      return Promise.resolve();
    });
    (redis.del as jest.Mock).mockImplementation((key: string) => {
      mockStore.delete(key);
      return Promise.resolve();
    });
    (redis.exists as jest.Mock).mockImplementation((key: string) => Promise.resolve(mockStore.has(key)));
  });

  it("room:join conv → đặt khoá TTL 70 s; room:leave / disconnect → xoá", async () => {
    await syncViewing("s1", U, [`user:${U}`, `conv:${CONV}`]);
    expect(await isViewing(U, `CONVERSATION:${CONV}`)).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(viewingKey(U, `CONVERSATION:${CONV}`), "1", 70);

    await syncViewing("s1", U, [`user:${U}`]); // đã rời room
    expect(await isViewing(U, `CONVERSATION:${CONV}`)).toBe(false);

    await syncViewing("s1", U, [`conv:${CONV}`]);
    await dropViewing("s1", U);
    expect(await isViewing(U, `CONVERSATION:${CONV}`)).toBe(false);
  });

  it("app xuống nền (heartbeat active=false) → xoá khoá; quay lại foreground → đặt lại", async () => {
    const rooms = [`ch:${CH}`];
    await syncViewing("s2", U, rooms);
    expect(await isViewing(U, `CHANNEL:${CH}`)).toBe(true);
    await syncViewing("s2", U, rooms, { active: false });
    expect(await isViewing(U, `CHANNEL:${CH}`)).toBe(false);
    await syncViewing("s2", U, rooms, { active: true });
    expect(await isViewing(U, `CHANNEL:${CH}`)).toBe(true);
  });

  it("NT-02: đang mở thread trong kênh → thêm khoá CHANNEL:<id>:<threadId>; đóng thread → xoá khoá thread, giữ khoá kênh", async () => {
    const rooms = [`ch:${CH}`];
    await syncViewing("s3", U, rooms, { active: true, threadId: THREAD });
    expect(await isViewing(U, `CHANNEL:${CH}`)).toBe(true);
    expect(await isViewing(U, `CHANNEL:${CH}:${THREAD}`)).toBe(true);

    await syncViewing("s3", U, rooms, { active: true, threadId: null });
    expect(await isViewing(U, `CHANNEL:${CH}:${THREAD}`)).toBe(false);
    expect(await isViewing(U, `CHANNEL:${CH}`)).toBe(true);
  });

  it("threadId không áp cho room hội thoại (chỉ kênh có thread)", async () => {
    await syncViewing("s4", U, [`conv:${CONV}`], { active: true, threadId: THREAD });
    expect(await isViewing(U, `CONVERSATION:${CONV}:${THREAD}`)).toBe(false);
  });

  it("2 socket cùng người: rời của socket này không xoá khoá do socket kia giữ tới nhịp heartbeat kế (chấp nhận)", async () => {
    await syncViewing("a", U, [`conv:${CONV}`]);
    await syncViewing("b", U, [`conv:${CONV}`]);
    await dropViewing("a", U);
    // Khoá bị xoá bởi socket a; socket b gia hạn lại ở heartbeat kế → cửa sổ mất tối đa ~30 s.
    expect(await isViewing(U, `CONVERSATION:${CONV}`)).toBe(false);
    await syncViewing("b", U, [`conv:${CONV}`], { active: true });
    expect(await isViewing(U, `CONVERSATION:${CONV}`)).toBe(true);
  });

  it("Redis lỗi → không ném (best-effort) và isViewing trả false (vẫn push, an toàn hơn bỏ sót)", async () => {
    (redis.set as jest.Mock).mockRejectedValue(new Error("redis down"));
    (redis.exists as jest.Mock).mockRejectedValue(new Error("redis down"));
    await expect(syncViewing("s5", U, [`conv:${CONV}`])).resolves.toBeUndefined();
    expect(await isViewing(U, `CONVERSATION:${CONV}`)).toBe(false);
  });
});
