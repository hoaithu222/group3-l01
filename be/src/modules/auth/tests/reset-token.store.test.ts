import { ResetTokenStore } from "../services/reset-token.store";
import { env } from "../../../core/config";
import { redis } from "../../../infrastructure/redis";

const data = new Map<string, string>();
let ready = true;

jest.mock("../../../infrastructure/redis", () => ({
  redis: { set: jest.fn(), getdel: jest.fn(), del: jest.fn(), getClient: jest.fn() },
}));

function setNodeEnv(value: "development" | "production" | "test"): void {
  (env as { NODE_ENV: string }).NODE_ENV = value;
}

describe("ResetTokenStore", () => {
  const originalEnv = env.NODE_ENV;
  let store: ResetTokenStore;

  beforeEach(() => {
    data.clear();
    ready = true;
    (redis.getClient as jest.Mock).mockImplementation(() => (ready ? { isReady: true } : null));
    (redis.set as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
      data.set(key, typeof value === "string" ? value : JSON.stringify(value));
    });
    (redis.getdel as jest.Mock).mockImplementation(async (key: string) => {
      const raw = data.get(key);
      data.delete(key);
      if (raw === undefined) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    });
    (redis.del as jest.Mock).mockImplementation(async (key: string) => {
      data.delete(key);
    });
    setNodeEnv("test");
    store = new ResetTokenStore();
  });

  afterEach(() => {
    setNodeEnv(originalEnv);
  });

  it("token 256 bit base64url, mỗi lần một token khác; Redis chỉ giữ HASH (không có token thô trong khoá/giá trị)", async () => {
    const a = await store.issue("66f1b2c3d4e5f60718293a01");
    const b = await store.issue("66f1b2c3d4e5f60718293a02");

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    const serialized = JSON.stringify([...data.entries()]);
    expect(serialized).not.toContain(a);
    expect(serialized).not.toContain(b);
    expect([...data.keys()].some((k) => k.startsWith("reset:"))).toBe(true);
  });

  it("consume(): trả userId đúng MỘT lần; token lạ/đã dùng ⇒ null", async () => {
    const token = await store.issue("66f1b2c3d4e5f60718293a01");

    await expect(store.consume(token)).resolves.toBe("66f1b2c3d4e5f60718293a01");
    await expect(store.consume(token)).resolves.toBeNull();
    await expect(store.consume("khong-co")).resolves.toBeNull();
  });

  it("userId toàn chữ số vẫn nguyên vẹn (giá trị lưu là object, không bị JSON.parse thành số mất độ chính xác)", async () => {
    const digitsOnly = "123456789012345678901234";
    const token = await store.issue(digitsOnly);

    await expect(store.consume(token)).resolves.toBe(digitsOnly);
  });

  it("mỗi user một token còn hiệu lực: cấp token mới ⇒ token cũ vô hiệu", async () => {
    const first = await store.issue("66f1b2c3d4e5f60718293a01");
    const second = await store.issue("66f1b2c3d4e5f60718293a01");

    await expect(store.consume(first)).resolves.toBeNull();
    await expect(store.consume(second)).resolves.toBe("66f1b2c3d4e5f60718293a01");
  });

  it("invalidateAllFor(): huỷ token còn treo của user, không ảnh hưởng user khác", async () => {
    const mine = await store.issue("66f1b2c3d4e5f60718293a01");
    const theirs = await store.issue("66f1b2c3d4e5f60718293a02");

    await store.invalidateAllFor("66f1b2c3d4e5f60718293a01");

    await expect(store.consume(mine)).resolves.toBeNull();
    await expect(store.consume(theirs)).resolves.toBe("66f1b2c3d4e5f60718293a02");
  });

  describe("production + Redis không sẵn sàng (fail-closed)", () => {
    beforeEach(() => {
      ready = false;
      setNodeEnv("production");
    });

    it("assertAvailable() ném 503 SYS_503 — đồng nhất với mọi email, không lộ email nào tồn tại", () => {
      expect(store.available()).toBe(false);
      expect(() => store.assertAvailable()).toThrow(expect.objectContaining({ statusCode: 503, errorCode: "SYS_503" }));
    });

    it("issue() ném 503 (không cấp token vô dụng rồi gửi mail); consume() trả null", async () => {
      await expect(store.issue("66f1b2c3d4e5f60718293a01")).rejects.toMatchObject({ statusCode: 503 });
      await expect(store.consume("bat-ky")).resolves.toBeNull();
    });
  });

  it("dev + Redis không sẵn sàng: dùng Map dự phòng, quy trình quên/đặt lại vẫn chạy được", async () => {
    ready = false;

    expect(store.available()).toBe(true);
    const token = await store.issue("66f1b2c3d4e5f60718293a01");
    await expect(store.consume(token)).resolves.toBe("66f1b2c3d4e5f60718293a01");
    await expect(store.consume(token)).resolves.toBeNull();
  });
});
