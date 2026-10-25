import { OneTimeStore } from "../one-time-store";
import { env } from "../../config";
import { redis } from "../../../infrastructure/redis";

jest.mock("../../../infrastructure/redis", () => ({
  redis: { set: jest.fn(), getdel: jest.fn(), del: jest.fn(), getClient: jest.fn() },
}));

function setNodeEnv(value: "development" | "production" | "test"): void {
  (env as { NODE_ENV: string }).NODE_ENV = value;
}

/** Kho dùng chung cho các test "Redis không sẵn sàng" — Map dự phòng nhỏ để thử trần. */
function buildStore(maxMemoryEntries?: number): OneTimeStore {
  return new OneTimeStore({ prefix: "otp:", ttlSeconds: 60, label: "test", maxMemoryEntries });
}

describe("OneTimeStore — Map dự phòng (Redis không sẵn sàng, không phải production)", () => {
  const originalEnv = env.NODE_ENV;

  beforeEach(() => {
    (redis.getClient as jest.Mock).mockReturnValue(null);
    setNodeEnv("test");
  });

  afterEach(() => {
    jest.useRealTimers();
    setNodeEnv(originalEnv);
  });

  it("lưu và lấy lại giá trị (chuỗi và object) đúng 1 lần", async () => {
    const store = buildStore();

    await store.put("a", { userId: "123456789012345678901234", n: 1 });
    await store.put("b", "giá trị chuỗi");

    await expect(store.take("a")).resolves.toEqual({ userId: "123456789012345678901234", n: 1 });
    await expect(store.take("a")).resolves.toBeNull();
    await expect(store.take("b")).resolves.toBe("giá trị chuỗi");
    store.resetMemoryForTests();
  });

  it("vượt trần số mục ⇒ đẩy mục CŨ NHẤT, Map không phình ra", async () => {
    const store = buildStore(3);

    for (const id of ["1", "2", "3", "4", "5"]) await store.put(id);

    expect(store.memorySizeForTests()).toBe(3);
    await expect(store.take("1")).resolves.toBeNull();
    await expect(store.take("2")).resolves.toBeNull();
    await expect(store.take("5")).resolves.not.toBeNull();
    store.resetMemoryForTests();
  });

  it("khi Map đầy, mục đã hết hạn được dọn trước (không đẩy mục còn hiệu lực)", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick"] });
    const store = buildStore(2);
    await store.put("cu-1");
    await store.put("cu-2");
    jest.setSystemTime(Date.now() + 61_000); // cả hai mục cũ đã hết hạn

    await store.put("moi-1");
    await store.put("moi-2");

    await expect(store.take("moi-1")).resolves.not.toBeNull();
    await expect(store.take("moi-2")).resolves.not.toBeNull();
    store.resetMemoryForTests();
  });

  it("remove() xoá mục khỏi Map", async () => {
    const store = buildStore();
    await store.put("x");

    await store.remove("x");

    await expect(store.take("x")).resolves.toBeNull();
    store.resetMemoryForTests();
  });
});

describe("OneTimeStore — Redis sẵn sàng", () => {
  beforeEach(() => {
    (redis.getClient as jest.Mock).mockReturnValue({ isReady: true });
    (redis.set as jest.Mock).mockResolvedValue(undefined);
    (redis.del as jest.Mock).mockResolvedValue(undefined);
  });

  it("put() ghi Redis với tiền tố + TTL đã cấu hình, take() dùng GETDEL", async () => {
    const store = buildStore();
    (redis.getdel as jest.Mock).mockResolvedValueOnce({ userId: "u1" });

    await store.put("token-abc", { userId: "u1" });
    const taken = await store.take<{ userId: string }>("token-abc");

    expect(redis.set).toHaveBeenCalledWith("otp:token-abc", { userId: "u1" }, 60);
    expect(redis.getdel).toHaveBeenCalledWith("otp:token-abc");
    expect(taken).toEqual({ userId: "u1" });
  });

  it("remove() xoá khoá trên Redis; lỗi Redis khi xoá không ném ra ngoài", async () => {
    const store = buildStore();
    (redis.del as jest.Mock).mockRejectedValueOnce(new Error("mất kết nối"));

    await expect(store.remove("x")).resolves.toBeUndefined();
    expect(redis.del).toHaveBeenCalledWith("otp:x");
  });
});
