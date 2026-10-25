import express, { type RequestHandler } from "express";
import request from "supertest";
import rateLimit from "express-rate-limit";
import { env } from "../../config";
import { logger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";
import { createFakeRedisSendCommand } from "./support/fake-redis-send-command";

/**
 * Giả lập Redis bằng bộ đếm cửa sổ cố định trong bộ nhớ (`fake-redis-send-command`): đủ để `RedisStore` (rate-limit-redis)
 * chạy THẬT — nạp script, EVALSHA — nên đường Redis được kiểm bằng code thật, không phải chỉ né tránh Redis. `redisMode`
 * điều khiển client "sẵn sàng" (`getClient()?.isReady`), "mất kết nối" (`null`) hay "lệnh lỗi".
 */
const sendCommand = createFakeRedisSendCommand();
let redisMode: "ready" | "down" | "erroring" = "ready";

jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    getClient: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    connect: jest.fn(),
    ping: jest.fn(),
  },
}));

import {
  accountActionLimiter,
  createAuthLimiter,
  globalLimiter,
  loginLimiter,
  nonceLimiter,
  registerLimiter,
} from "../rateLimiter";
import { makeRateLimitStore, type ResilientRateLimitStore } from "../rate-limit-store";

function setNodeEnv(value: "development" | "production" | "test"): void {
  (env as { NODE_ENV: string }).NODE_ENV = value;
}

function installRedisMode(): void {
  (redis.getClient as jest.Mock).mockImplementation(() => {
    if (redisMode === "down") return null;
    return {
      isReady: true,
      sendCommand: (args: string[]): Promise<unknown> =>
        redisMode === "erroring" ? Promise.reject(new Error("ECONNRESET")) : sendCommand(...args),
    };
  });
}

/** Một "instance API": app riêng + limiter riêng (store riêng) nhưng CÙNG khoá Redis nếu cùng `prefix`. */
function buildInstance(prefix: string, max: number): { app: express.Express; store: ResilientRateLimitStore } {
  const store = makeRateLimitStore(prefix);
  const limiter: RequestHandler = rateLimit({
    windowMs: 60_000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    store,
    message: { success: false, error: { code: "RATE_001", message: "quá nhiều" } },
  });
  const app = express();
  app.use(limiter);
  app.get("/anything", (_req, res) => res.json({ ok: true }));
  return { app, store };
}

describe("globalLimiter", () => {
  const originalEnv = env.NODE_ENV;

  beforeEach(() => {
    redisMode = "ready";
    installRedisMode();
  });

  afterEach(() => {
    setNodeEnv(originalEnv);
  });

  function buildApp() {
    const app = express();
    app.use(globalLimiter);
    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.get("/anything", (_req, res) => res.json({ ok: true }));
    return app;
  }

  it("cho qua 600 request/60s/IP, chặn request thứ 601 với 429 RATE_001 (bộ đếm nằm trên Redis)", async () => {
    const app = buildApp();
    let lastStatus = 0;
    for (let i = 0; i < 600; i++) {
      const res = await request(app).get("/anything");
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(200);

    const blocked = await request(app).get("/anything");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_001");
    // Bộ đếm thật sự ở "Redis" giả, khoá có tiền tố REDIS_KEY_PREFIX + rl:global:.
    const keys = sendCommand.keys();
    expect(keys.some((k) => k.startsWith(`${env.REDIS_KEY_PREFIX}rl:global:`))).toBe(true);
  }, 30_000);

  it("/api/health không bị globalLimiter chặn dù đã vượt giới hạn", async () => {
    const app = buildApp();
    for (let i = 0; i < 605; i++) {
      await request(app).get("/anything");
    }
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
  }, 30_000);
});

describe("ResilientRateLimitStore", () => {
  const originalEnv = env.NODE_ENV;
  let stores: ResilientRateLimitStore[] = [];

  function instance(prefix: string, max: number): express.Express {
    const built = buildInstance(prefix, max);
    stores.push(built.store);
    return built.app;
  }

  beforeEach(() => {
    redisMode = "ready";
    installRedisMode();
    stores = [];
  });

  afterEach(() => {
    setNodeEnv(originalEnv);
    for (const s of stores) s.shutdown();
  });

  describe("Redis sẵn sàng (đường chính)", () => {
    it("SEC-06: hai instance API dùng chung bộ đếm Redis — request thứ max+1 bị chặn dù rơi vào instance nào", async () => {
      const a = instance("rl:multi:", 10);
      const b = instance("rl:multi:", 10);

      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await request(i % 2 === 0 ? a : b).get("/anything");
        statuses.push(res.status);
      }

      expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
      expect(statuses.slice(10)).toEqual([429, 429]);
    });

    it("SEC-07: khoá bộ đếm bắt đầu bằng REDIS_KEY_PREFIX + tiền tố limiter", async () => {
      const app = instance("rl:prefix-check:", 5);

      await request(app).get("/anything");

      const keys = sendCommand.keys();
      expect(keys.filter((k) => k.includes("rl:prefix-check:")).every((k) => k.startsWith(env.REDIS_KEY_PREFIX))).toBe(true);
      expect(keys.some((k) => k.includes("rl:prefix-check:"))).toBe(true);
    });

    it("IP khác nhau đếm riêng (khoá theo IP)", async () => {
      const a = instance("rl:per-ip:", 2);
      // supertest luôn từ ::ffff:127.0.0.1 — coi đó là 1 proxy tin cậy (như `app.ts`: `trust proxy = 1`) để đổi IP qua X-Forwarded-For.
      a.set("trust proxy", 1);

      const hit = (ip: string) => request(a).get("/anything").set("X-Forwarded-For", ip);
      await hit("1.1.1.1");
      await hit("1.1.1.1");
      const third = await hit("1.1.1.1");
      const otherIp = await hit("2.2.2.2");

      expect(third.status).toBe(429);
      expect(otherIp.status).toBe(200);
    });
  });

  describe("Redis KHÔNG sẵn sàng (dự phòng bộ nhớ, KHÔNG bỏ trống giới hạn)", () => {
    it("vẫn đếm và chặn ở request thứ max+1, không gọi Redis", async () => {
      redisMode = "down";
      const app = instance("rl:down:", 3);

      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) statuses.push((await request(app).get("/anything")).status);

      expect(statuses).toEqual([200, 200, 200, 429, 429]);
      expect(sendCommand.keys().some((k) => k.includes("rl:down:"))).toBe(false);
    });

    it("lệnh Redis lỗi giữa chừng ⇒ vẫn chặn được nhờ bộ nhớ (không fail-open)", async () => {
      redisMode = "erroring";
      const app = instance("rl:erroring:", 2);

      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) statuses.push((await request(app).get("/anything")).status);

      expect(statuses).toEqual([200, 200, 429, 429]);
    });

    it("dev/test: không ghi log cảnh báo; production: cảnh báo chế độ suy giảm, tần suất bị giới hạn", async () => {
      redisMode = "down";
      const app = instance("rl:warn:", 100);
      await request(app).get("/anything");
      await request(app).get("/anything");
      expect(logger.warn).not.toHaveBeenCalled();

      setNodeEnv("production");
      await request(app).get("/anything");
      await request(app).get("/anything");
      await request(app).get("/anything");

      expect((logger.warn as jest.Mock).mock.calls.filter((c) => String(c[0]).includes("chế độ suy giảm"))).toHaveLength(1);
    });
  });
});

/**
 * Limiter cho route xác thực (rà soát auth BE 2026-09-25): trước đây MỘT bộ đếm `authLimiter` (10/15 phút/IP) dùng chung cho
 * login/register/quên/đổi mật khẩu/... và đếm cả request thành công ⇒ văn phòng chung IP bị 429 cả nhóm sau vài lượt đăng nhập ĐÚNG.
 */
describe("limiter route xác thực (tách theo endpoint)", () => {
  beforeEach(() => {
    redisMode = "ready";
    installRedisMode();
  });

  const message = "quá nhiều";

  it("tách bộ đếm theo endpoint: hết hạn mức của endpoint này KHÔNG chặn endpoint khác cùng IP", async () => {
    const a = createAuthLimiter("test-split-a", { max: 2, message });
    const b = createAuthLimiter("test-split-b", { max: 2, message });
    const app = express();
    app.get("/a", a, (_req, res) => res.json({ ok: true }));
    app.get("/b", b, (_req, res) => res.json({ ok: true }));

    const statusesA: number[] = [];
    for (let i = 0; i < 3; i++) statusesA.push((await request(app).get("/a")).status);
    const b1 = await request(app).get("/b");

    expect(statusesA).toEqual([200, 200, 429]);
    expect(b1.status).toBe(200);
    expect(sendCommand.keys().some((k) => k.startsWith(`${env.REDIS_KEY_PREFIX}rl:auth:test-split-a:`))).toBe(true);
    expect(sendCommand.keys().some((k) => k.startsWith(`${env.REDIS_KEY_PREFIX}rl:auth:test-split-b:`))).toBe(true);
  });

  it("failedOnly: request THÀNH CÔNG không tốn hạn mức; chỉ lần thất bại được đếm, chạm trần ⇒ 429 (kể cả request đúng sau đó) kèm Retry-After", async () => {
    const limiter = createAuthLimiter("test-failed-only", { max: 3, failedOnly: true, message });
    const app = express();
    app.get("/login", limiter, (req, res) => {
      res.status(req.query.ok === "1" ? 200 : 401).json({ ok: req.query.ok === "1" });
    });

    const successes: number[] = [];
    for (let i = 0; i < 10; i++) successes.push((await request(app).get("/login?ok=1")).status);
    const failures: number[] = [];
    for (let i = 0; i < 4; i++) failures.push((await request(app).get("/login?ok=0")).status);
    const afterLimit = await request(app).get("/login?ok=1");

    expect(successes).toEqual(Array(10).fill(200)); // 10 lượt đúng > max 3 mà không bị chặn
    expect(failures).toEqual([401, 401, 401, 429]);
    expect(afterLimit.status).toBe(429);
    expect(afterLimit.headers["retry-after"]).toEqual(expect.any(String));
    expect(afterLimit.body.error.code).toBe("RATE_001");
  });

  it("keyBy user: hai người dùng CHUNG IP có bộ đếm riêng; chưa có user ⇒ rơi về IP", async () => {
    const limiter = createAuthLimiter("test-by-user", { max: 2, keyBy: "user", message });
    const app = express();
    app.use((req, _res, next) => {
      const id = req.header("x-user");
      if (id) req.user = { id, email: "", permissions: [] };
      next();
    });
    app.get("/act", limiter, (_req, res) => res.json({ ok: true }));

    const as = (id: string) => request(app).get("/act").set("x-user", id);
    const a = [(await as("user-a")).status, (await as("user-a")).status, (await as("user-a")).status];
    const b = await as("user-b");
    const anonymous = [(await request(app).get("/act")).status, (await request(app).get("/act")).status, (await request(app).get("/act")).status];

    expect(a).toEqual([200, 200, 429]);
    expect(b.status).toBe(200);
    expect(anonymous).toEqual([200, 200, 429]);
  });

  it("loginLimiter: 40 lượt đăng nhập ĐÚNG liên tiếp không bị chặn; 30 lần SAI thì lần 31 bị 429 (trần theo lần thất bại)", async () => {
    const app = express();
    app.post("/login", loginLimiter, (req, res) => {
      res.status(req.query.ok === "1" ? 200 : 401).json({});
    });

    let okStatuses = 0;
    for (let i = 0; i < 40; i++) okStatuses += (await request(app).post("/login?ok=1")).status === 200 ? 1 : 0;
    const failStatuses: number[] = [];
    for (let i = 0; i < 31; i++) failStatuses.push((await request(app).post("/login?ok=0")).status);

    expect(okStatuses).toBe(40);
    expect(failStatuses.slice(0, 30)).toEqual(Array(30).fill(401));
    expect(failStatuses[30]).toBe(429);
  }, 30_000);

  it("registerLimiter đếm cả lượt thành công (lạm dụng ở đây là tạo tài khoản hàng loạt): lượt 11 bị 429", async () => {
    const app = express();
    app.post("/register", registerLimiter, (_req, res) => res.status(201).json({}));

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await request(app).post("/register")).status);

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
    expect(statuses[10]).toBe(429);
  });

  it("accountActionLimiter: theo NGƯỜI DÙNG — 10 lượt/15 phút, người khác cùng IP không bị ảnh hưởng", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.user = { id: String(req.header("x-user")), email: "", permissions: [] };
      next();
    });
    app.post("/change-password", accountActionLimiter, (_req, res) => res.json({}));
    const as = (id: string) => request(app).post("/change-password").set("x-user", id);

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await as("acct-user-1")).status);
    const other = await as("acct-user-2");

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
    expect(other.status).toBe(200);
  });

  it("nonceLimiter đủ rộng cho văn phòng chung IP: 100 lượt lấy nonce trong 5 phút không bị chặn", async () => {
    const app = express();
    app.get("/nonce", nonceLimiter, (_req, res) => res.json({}));

    let blocked = 0;
    for (let i = 0; i < 100; i++) blocked += (await request(app).get("/nonce")).status === 429 ? 1 : 0;

    expect(blocked).toBe(0);
  }, 30_000);
});
