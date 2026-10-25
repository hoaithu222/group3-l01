/**
 * `NodeBurnoutSignalStore` (kho tín hiệu Redis, p7-03 be.md §2) với client node-redis GIẢ — máy này không chạy Redis thật nên test khoá hình dạng lệnh: tên khoá (`wb:optin`, `wb:{userId}:{date}`, `wb:ev:*`),
 * tiền tố `REDIS_KEY_PREFIX`, TTL bucket 3 ngày, và hành vi KHI REDIS KHÔNG SẴN SÀNG (không thu thập, không ném lỗi).
 */
const mockClient = {
  isReady: true,
  sIsMember: jest.fn(),
  sAdd: jest.fn(),
  sRem: jest.fn(),
  sMembers: jest.fn(),
  hSet: jest.fn(),
  hIncrBy: jest.fn(),
  expire: jest.fn(),
};
const mockRedis = { getClient: jest.fn(), setNx: jest.fn(), hgetall: jest.fn(), scanKeys: jest.fn(), del: jest.fn() };
jest.mock("../../../infrastructure/redis", () => ({ redis: mockRedis }));

import { env } from "../../../core/config";
import { LIMITS } from "../../../core/constants/limits";
import { NodeBurnoutSignalStore, OPTIN_KEY, dayKey } from "../repositories/signal-store";

const P = env.REDIS_KEY_PREFIX;
const U = "a".repeat(24);
const TTL = LIMITS.wellbeing.bucketTtlDays * 86_400;

describe("NodeBurnoutSignalStore", () => {
  let store: NodeBurnoutSignalStore;
  beforeEach(() => {
    mockClient.isReady = true;
    mockRedis.getClient.mockImplementation(() => mockClient);
    mockClient.sIsMember.mockResolvedValue(true);
    mockClient.sAdd.mockResolvedValue(1);
    mockClient.sRem.mockResolvedValue(1);
    mockClient.sMembers.mockResolvedValue([U]);
    mockClient.hSet.mockResolvedValue(1);
    mockClient.hIncrBy.mockResolvedValue(1);
    mockClient.expire.mockResolvedValue(true);
    mockRedis.setNx.mockResolvedValue(true);
    mockRedis.hgetall.mockResolvedValue({ "b:2330": "1" });
    mockRedis.scanKeys.mockResolvedValue([`wb:${U}:2026-03-10`, `wb:${U}:2026-03-09`]);
    mockRedis.del.mockResolvedValue(undefined);
    store = new NodeBurnoutSignalStore();
  });

  it("tên khoá đúng kế hoạch", () => {
    expect(OPTIN_KEY).toBe("wb:optin");
    expect(dayKey(U, "2026-03-10")).toBe(`wb:${U}:2026-03-10`);
  });

  it("tập 'đã bật': SISMEMBER/SADD/SREM/SMEMBERS trên `wb:optin` (có tiền tố môi trường)", async () => {
    expect(await store.isOptedIn(U)).toBe(true);
    expect(mockClient.sIsMember).toHaveBeenCalledWith(`${P}wb:optin`, U);
    await store.addOptIn(U);
    expect(mockClient.sAdd).toHaveBeenCalledWith(`${P}wb:optin`, U);
    await store.removeOptIn(U);
    expect(mockClient.sRem).toHaveBeenCalledWith(`${P}wb:optin`, U);
    expect(await store.optInMembers()).toEqual([U]);
  });

  it("bucket: HSET `b:<slot>` = 1 và HINCRBY `e:<slot>`, mỗi lần gia hạn TTL 3 ngày; KHÔNG ghi loại/nội dung sự kiện", async () => {
    await store.markActive(U, "2026-03-10", "2330");
    expect(mockClient.hSet).toHaveBeenCalledWith(`${P}wb:${U}:2026-03-10`, "b:2330", "1");
    expect(mockClient.expire).toHaveBeenCalledWith(`${P}wb:${U}:2026-03-10`, TTL);
    await store.incrEvent(U, "2026-03-10", "2345");
    expect(mockClient.hIncrBy).toHaveBeenCalledWith(`${P}wb:${U}:2026-03-10`, "e:2345", 1);
    expect(mockClient.expire).toHaveBeenLastCalledWith(`${P}wb:${U}:2026-03-10`, TTL);
    expect(TTL).toBe(3 * 86_400);
  });

  it("chống đếm trùng: SET NX `wb:ev:<khoá>` có TTL; đọc HASH ngày qua wrapper", async () => {
    expect(await store.claimEvent("abc")).toBe(true);
    expect(mockRedis.setNx).toHaveBeenCalledWith("wb:ev:abc", "1", LIMITS.wellbeing.eventDedupeTtlSeconds);
    expect(await store.readDay(U, "2026-03-10")).toEqual({ "b:2330": "1" });
    expect(mockRedis.hgetall).toHaveBeenCalledWith(`wb:${U}:2026-03-10`);
  });

  it("xoá mọi bucket của người dùng: quét `wb:{userId}:*` rồi DEL từng khoá, trả số khoá đã xoá", async () => {
    expect(await store.deleteUserBuckets(U)).toBe(2);
    expect(mockRedis.scanKeys).toHaveBeenCalledWith(`wb:${U}:*`);
    expect(mockRedis.del).toHaveBeenCalledTimes(2);
    expect(mockRedis.del).toHaveBeenCalledWith(`wb:${U}:2026-03-10`);
  });

  it("Redis KHÔNG sẵn sàng: 'có bật không' = false (không thu thập khi không chắc), ghi bỏ qua, không ném lỗi, không gọi lệnh nào", async () => {
    mockClient.isReady = false;
    expect(await store.isOptedIn(U)).toBe(false);
    await expect(store.markActive(U, "2026-03-10", "2330")).resolves.toBeUndefined();
    await expect(store.incrEvent(U, "2026-03-10", "2330")).resolves.toBeUndefined();
    await expect(store.addOptIn(U)).resolves.toBeUndefined();
    await expect(store.removeOptIn(U)).resolves.toBeUndefined();
    expect(await store.optInMembers()).toEqual([]);
    for (const fn of [mockClient.sIsMember, mockClient.sAdd, mockClient.sRem, mockClient.sMembers, mockClient.hSet, mockClient.hIncrBy, mockClient.expire]) expect(fn).not.toHaveBeenCalled();
  });

  it("getClient() = null (chưa kết nối) cũng an toàn như chưa sẵn sàng", async () => {
    mockRedis.getClient.mockImplementation(() => null);
    expect(await store.isOptedIn(U)).toBe(false);
    await expect(store.markActive(U, "2026-03-10", "2330")).resolves.toBeUndefined();
  });
});
