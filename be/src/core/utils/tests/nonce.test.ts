import { NonceUtils, NONCE_TTL_SECONDS } from "../nonce";
import { env } from "../../config";
import { AppError } from "../../exceptions";
import { logger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";

/**
 * Giả lập Redis bằng Map trong bộ nhớ (`SET` + `GETDEL` nguyên tử) — đủ để
 * kiểm ngữ nghĩa "tiêu thụ đúng 1 lần". `redisReady` điều khiển việc client
 * có "sẵn sàng" hay không (`getClient()?.isReady`), giống hạ tầng thật.
 */
const redisData = new Map<string, string>();
let redisReady = true;

jest.mock("../../../infrastructure/redis", () => ({
  redis: { set: jest.fn(), getdel: jest.fn(), del: jest.fn(), getClient: jest.fn() },
}));

function setNodeEnv(value: "development" | "production" | "test"): void {
  (env as { NODE_ENV: string }).NODE_ENV = value;
}

describe("NonceUtils", () => {
  const originalEnv = env.NODE_ENV;

  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá implementation trước MỖI test —
    // phải gắn lại ở đây, không chỉ ở factory `jest.mock(...)` phía trên.
    redisData.clear();
    redisReady = true;
    (redis.getClient as jest.Mock).mockImplementation(() => (redisReady ? { isReady: true } : null));
    (redis.set as jest.Mock).mockImplementation(async (key: string, value: unknown) => {
      redisData.set(key, typeof value === "string" ? value : JSON.stringify(value));
    });
    (redis.getdel as jest.Mock).mockImplementation(async (key: string) => {
      const raw = redisData.get(key);
      redisData.delete(key);
      if (raw === undefined) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    });
    (redis.del as jest.Mock).mockImplementation(async (key: string) => {
      redisData.delete(key);
    });
    setNodeEnv("test");
    NonceUtils.resetMemoryForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
    setNodeEnv(originalEnv);
    NonceUtils.resetMemoryForTests();
  });

  // ── Đường CHÍNH: Redis ─────────────────────────────────────────────────────
  describe("Redis sẵn sàng (đường chính)", () => {
    describe("issue()", () => {
      it("trả nonce dài đúng 32 ký tự, chỉ chứa base64url charset", async () => {
        const { nonce } = await NonceUtils.issue();
        expect(nonce).toHaveLength(32);
        expect(nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
      });

      it("trả expiresIn = 120 giây và lưu vào Redis với đúng khoá + TTL", async () => {
        const { nonce, expiresIn } = await NonceUtils.issue();
        expect(expiresIn).toBe(120);
        expect(NONCE_TTL_SECONDS).toBe(120);
        expect(redisData.has(`nonce:${nonce}`)).toBe(true);
        expect(redis.set).toHaveBeenCalledWith(`nonce:${nonce}`, "1", 120);
      });

      it("KHÔNG đụng tới Map dự phòng khi Redis chạy tốt", async () => {
        await NonceUtils.issue();
        expect(NonceUtils.memorySizeForTests()).toBe(0);
      });

      it("2 lần issue liên tiếp cho ra 2 nonce khác nhau", async () => {
        const a = await NonceUtils.issue();
        const b = await NonceUtils.issue();
        expect(a.nonce).not.toBe(b.nonce);
      });
    });

    describe("consume()", () => {
      it("trả true đúng 1 lần cho 1 nonce hợp lệ, false ở lần dùng lại (replay)", async () => {
        const { nonce } = await NonceUtils.issue();

        await expect(NonceUtils.consume(nonce)).resolves.toBe(true);
        await expect(NonceUtils.consume(nonce)).resolves.toBe(false);
      });

      it("tiêu thụ bằng GETDEL nguyên tử (không get() rồi del() riêng)", async () => {
        const { nonce } = await NonceUtils.issue();

        await NonceUtils.consume(nonce);

        expect(redis.getdel).toHaveBeenCalledWith(`nonce:${nonce}`);
        expect(redis.del).not.toHaveBeenCalled();
      });

      it("2 request ĐỒNG THỜI với cùng 1 nonce: đúng 1 request được tiêu thụ", async () => {
        const { nonce } = await NonceUtils.issue();

        const results = await Promise.all([
          NonceUtils.consume(nonce),
          NonceUtils.consume(nonce),
          NonceUtils.consume(nonce),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it("trả false với nonce chưa từng được cấp", async () => {
        await expect(NonceUtils.consume("chua-tung-duoc-cap-bao-gio")).resolves.toBe(false);
      });

      it("Redis ném lỗi khi tiêu thụ ở production ⇒ false (không throw, không mở cửa) + cảnh báo", async () => {
        setNodeEnv("production");
        (redis.getdel as jest.Mock).mockRejectedValueOnce(new Error("Redis tạm thời không khả dụng"));

        await expect(NonceUtils.consume("bat-ky-nonce-nao")).resolves.toBe(false);
        expect(logger.warn).toHaveBeenCalled();
      });

      it("Redis ném lỗi khi tiêu thụ ở dev ⇒ tra tiếp Map dự phòng, nonce lạ vẫn false", async () => {
        (redis.getdel as jest.Mock).mockRejectedValueOnce(new Error("Redis tạm thời không khả dụng"));

        await expect(NonceUtils.consume("bat-ky-nonce-nao")).resolves.toBe(false);
      });
    });

    it("Redis ném lỗi khi cấp nonce ở production ⇒ AppError 503 SYS_503 (không rơi về Map)", async () => {
      setNodeEnv("production");
      (redis.set as jest.Mock).mockRejectedValueOnce(new Error("ECONNRESET"));

      await expect(NonceUtils.issue()).rejects.toMatchObject({
        statusCode: 503,
        errorCode: "SYS_503",
      });
      expect(NonceUtils.memorySizeForTests()).toBe(0);
    });
  });

  // ── Dự phòng dev: Redis KHÔNG sẵn sàng + NODE_ENV !== production ────────────
  describe("Redis KHÔNG sẵn sàng, không phải production (Map dự phòng)", () => {
    beforeEach(() => {
      redisReady = false;
    });

    it("issue() không gọi Redis, lưu Map; consume() true đúng 1 lần rồi false", async () => {
      const { nonce, expiresIn } = await NonceUtils.issue();

      expect(expiresIn).toBe(120);
      expect(redis.set).not.toHaveBeenCalled();
      expect(NonceUtils.memorySizeForTests()).toBe(1);

      await expect(NonceUtils.consume(nonce)).resolves.toBe(true);
      await expect(NonceUtils.consume(nonce)).resolves.toBe(false);
      expect(redis.getdel).not.toHaveBeenCalled();
      expect(NonceUtils.memorySizeForTests()).toBe(0);
    });

    it("nonce lạ ⇒ false", async () => {
      await expect(NonceUtils.consume("chua-tung-duoc-cap-bao-gio")).resolves.toBe(false);
    });

    it("chạy được cả ở NODE_ENV=development", async () => {
      setNodeEnv("development");
      const { nonce } = await NonceUtils.issue();
      await expect(NonceUtils.consume(nonce)).resolves.toBe(true);
    });

    it("nonce hết hạn (quá 120 giây) ⇒ false dù còn nằm trong Map", async () => {
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      const { nonce } = await NonceUtils.issue();

      jest.setSystemTime(Date.now() + 121_000);

      await expect(NonceUtils.consume(nonce)).resolves.toBe(false);
    });

    it("dọn định kỳ: mục hết hạn bị xoá khỏi Map và timer tự tắt khi Map rỗng (không rò bộ nhớ)", async () => {
      jest.useFakeTimers({ doNotFake: ["nextTick"] });
      await NonceUtils.issue();
      await NonceUtils.issue();
      await NonceUtils.issue();
      expect(NonceUtils.memorySizeForTests()).toBe(3);
      expect(jest.getTimerCount()).toBe(1);

      // Chưa hết hạn: chu kỳ dọn đầu tiên (30 s) không xoá gì.
      jest.advanceTimersByTime(30_000);
      expect(NonceUtils.memorySizeForTests()).toBe(3);

      // Quá 120 s: lần dọn kế tiếp xoá sạch và tắt timer.
      jest.advanceTimersByTime(120_000);
      expect(NonceUtils.memorySizeForTests()).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("timer dọn dẹp được unref() — không giữ tiến trình sống", async () => {
      const spy = jest.spyOn(global, "setInterval");
      await NonceUtils.issue();

      const timer = spy.mock.results[0]?.value as NodeJS.Timeout;
      expect(timer.hasRef()).toBe(false);
    });

    it("nonce cấp lúc Redis chưa sẵn sàng vẫn dùng được khi Redis vừa lên lại (dev)", async () => {
      const { nonce } = await NonceUtils.issue();

      redisReady = true;

      await expect(NonceUtils.consume(nonce)).resolves.toBe(true);
      await expect(NonceUtils.consume(nonce)).resolves.toBe(false);
    });
  });

  // ── Production + Redis không dùng được: KHÔNG mở cửa ───────────────────────
  describe("production + Redis KHÔNG sẵn sàng (fail-closed)", () => {
    beforeEach(() => {
      redisReady = false;
      setNodeEnv("production");
    });

    it("issue() ném AppError 503 SYS_503, không ghi Redis, không ghi Map", async () => {
      const err: unknown = await NonceUtils.issue().catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({ statusCode: 503, errorCode: "SYS_503" });
      expect(redis.set).not.toHaveBeenCalled();
      expect(NonceUtils.memorySizeForTests()).toBe(0);
    });

    it("consume() trả false và ghi log cảnh báo", async () => {
      await expect(NonceUtils.consume("a".repeat(32))).resolves.toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("consume() BỎ QUA Map dù trong Map có sẵn nonce (chỉ dev mới dùng Map)", async () => {
      setNodeEnv("test");
      const { nonce } = await NonceUtils.issue(); // ghi vào Map dự phòng
      expect(NonceUtils.memorySizeForTests()).toBe(1);

      setNodeEnv("production");

      await expect(NonceUtils.consume(nonce)).resolves.toBe(false);
    });

    it("log cảnh báo bị giới hạn tần suất (không ngập log khi Redis sập kéo dài)", async () => {
      await NonceUtils.consume("a".repeat(32));
      await NonceUtils.consume("b".repeat(32));
      await NonceUtils.consume("c".repeat(32));

      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
