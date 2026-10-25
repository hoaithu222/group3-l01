/**
 * Luồng auth đầu-cuối trên route THẬT + Prisma/Mongo THẬT (`TEST_DB=memory`) + Redis giả có trạng thái (nonce, đếm lần sai,
 * dấu thu hồi phiên, token đặt lại mật khẩu) + mail giả. Mỗi ca khoá một hành vi bảo mật đã rà soát:
 * phiên/refresh/rotate/reuse, thu hồi tức thì, đăng xuất mọi nơi, đặt lại/đổi mật khẩu thu hồi phiên, chống dò tài khoản, khoá theo tài khoản.
 */
import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../../../infrastructure/database";
import { redis } from "../../../../infrastructure/redis";
import { mailService } from "../../../../infrastructure/mail";
import { errorHandler, notFoundHandler, sanitizeInput } from "../../../../core/middlewares";
import { JwtUtils } from "../../../../core/utils/jwt";
import { env } from "../../../../core/config";
import {
  installRedisFake,
  redisFakeKeys,
  resetRedisFake,
} from "../support/redis-fake";

jest.mock("../../../../infrastructure/redis", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRedisMockShape } = require("../support/redis-fake") as typeof import("../support/redis-fake");
  return { redis: createRedisMockShape() };
});

jest.mock("../../../../infrastructure/mail", () => ({
  mailService: {
    sendWelcome: jest.fn(),
    sendResetPassword: jest.fn(),
    sendNewDeviceLogin: jest.fn(),
    sendRaw: jest.fn(),
    enqueueMail: jest.fn(),
  },
}));

// Giới hạn theo IP có test riêng (`rate-limiter.test.ts`); ở đây cần gọi /login… nhiều lần từ cùng một IP.
jest.mock("../../../../core/middlewares/rateLimiter", () =>
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require("../support/rate-limiter-mock") as typeof import("../support/rate-limiter-mock")).passThroughRateLimiters()
);

import authRoutes from "../../auth.routes";
import { assertMemoryDatabase, describeMemoryDb } from "../support/memory-db-guard";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(sanitizeInput);
app.use("/api/v1/auth", authRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

const PASSWORD = "Mat-khau-hien-tai-1";
const NEW_PASSWORD = "Mat-khau-moi-9x";

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function getNonce(): Promise<string> {
  const res = await request(app).get("/api/v1/auth/nonce");
  return (res.body as { data: { nonce: string } }).data.nonce;
}

function loginRequest(email: string, password: string, headers: Record<string, string> = {}) {
  return getNonce().then((nonce) => {
    let req = request(app).post("/api/v1/auth/login");
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v);
    return req.send({ email, password, nonce });
  });
}

/** Đăng nhập kiểu app (`X-Client-Platform`) để nhận refresh token trong body. */
async function loginApp(email: string, password = PASSWORD, deviceId?: string): Promise<Tokens> {
  const res = await loginRequest(email, password, {
    "X-Client-Platform": "ANDROID",
    ...(deviceId ? { "X-Device-Id": deviceId } : {}),
  });
  expect(res.status).toBe(200);
  return res.body.data as Tokens;
}

function bearer(token: string): [string, string] {
  return ["Authorization", `Bearer ${token}`];
}

async function createUser(email = "flow@example.com", overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      email,
      name: "Flow User",
      normalizedName: "flow user",
      passwordHash: await bcrypt.hash(PASSWORD, 4), // cost thấp cho nhanh — logic không phụ thuộc cost
      status: "ACTIVE",
      ...overrides,
    },
  });
}

async function sessionIdOf(accessToken: string): Promise<string | undefined> {
  return JwtUtils.verifyToken(accessToken).sid;
}

describeMemoryDb("auth flows (Mongo thật)", () => {
  beforeAll(assertMemoryDatabase);

  beforeEach(() => {
    resetRedisFake();
    installRedisFake(redis);
    (mailService.sendResetPassword as jest.Mock).mockResolvedValue(undefined);
    (mailService.sendWelcome as jest.Mock).mockResolvedValue(undefined);
    (mailService.sendNewDeviceLogin as jest.Mock).mockResolvedValue(undefined);
    (mailService.sendRaw as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    assertMemoryDatabase(); // không bao giờ xoá dữ liệu trên DB không phải Mongo memory
    await prisma.session.deleteMany({});
    await prisma.biometricCredential.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.deviceToken.deleteMany({});
    await prisma.user.deleteMany({});
  });

  // ── Đăng ký / đăng nhập / cookie ───────────────────────────────────────────────
  describe("đăng ký và đăng nhập", () => {
    it("register (web): 201, cookie refresh HttpOnly + Path + Max-Age, body KHÔNG có refreshToken; role luôn user", async () => {
      const nonce = await getNonce();

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "Moi.Dang.Ky@Example.com", name: "Người Mới", password: PASSWORD, nonce });

      expect(res.status).toBe(201);
      expect(res.body.data.refreshToken).toBeUndefined();
      expect(res.body.data.user).toMatchObject({ email: "moi.dang.ky@example.com", role: "user" });
      const cookies = (res.headers["set-cookie"] as unknown as string[]).join("; ");
      expect(cookies).toContain("refresh_token=");
      expect(cookies).toMatch(/HttpOnly/i);
      expect(cookies).toContain("Path=/api/v1/auth");
      expect(cookies).toContain("Max-Age=604800");
      expect(cookies).toMatch(/SameSite=Lax/i); // NODE_ENV=test; production = Strict + Secure (xem test cookie production)
      const user = await prisma.user.findUniqueOrThrow({ where: { email: "moi.dang.ky@example.com" } });
      expect(user.passwordHash).not.toBe(PASSWORD);
    });

    it("register: email trùng khác hoa/thường → 409; mật khẩu < 8 ký tự → 400", async () => {
      await createUser("trung@example.com");

      const dup = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "TRUNG@example.com", name: "X", password: PASSWORD, nonce: await getNonce() });
      const weak = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "yeu@example.com", name: "X", password: "1234567", nonce: await getNonce() });

      expect(dup.status).toBe(409);
      expect(weak.status).toBe(400);
    });

    it("mật khẩu chứa ký tự HTML giữ NGUYÊN BYTE qua sanitizeInput: đăng ký → đăng nhập → đổi sang mật khẩu HTML khác → đăng nhập lại", async () => {
      // `sanitizeInput` cắt thẻ HTML ở mọi trường KHÔNG thuộc RAW_FIELDS — nếu chạm vào mật khẩu thì `a<b>c` thành `ac`
      // âm thầm và người dùng không đăng nhập được (hoặc mật khẩu lưu ra khác điều họ gõ).
      const registered = 'Mk<b>&"x"\'1>2';
      const changed = "Moi<script>alert(1)</script>9&";

      const reg = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "html@example.com", name: "Html <i>Tên</i>", password: registered, nonce: await getNonce() });
      expect(reg.status).toBe(201);
      const stored = await prisma.user.findUniqueOrThrow({ where: { email: "html@example.com" } });
      expect(await bcrypt.compare(registered, stored.passwordHash as string)).toBe(true);
      expect(stored.name).toBe("Html Tên"); // trường tên thường VẪN bị cắt thẻ

      const login = await loginRequest("html@example.com", registered);
      expect(login.status).toBe(200);
      const change = await request(app)
        .patch("/api/v1/auth/change-password")
        .set(...bearer(login.body.data.accessToken as string))
        .send({ currentPassword: registered, newPassword: changed });
      expect(change.status).toBe(200);

      const after = await prisma.user.findUniqueOrThrow({ where: { email: "html@example.com" } });
      expect(await bcrypt.compare(changed, after.passwordHash as string)).toBe(true);
      expect((await loginRequest("html@example.com", changed)).status).toBe(200);
      expect((await loginRequest("html@example.com", registered)).status).toBe(401);
    });

    it("login app (X-Client-Platform): refreshToken trong body, KHÔNG Set-Cookie (B11); web: cookie, không có refreshToken", async () => {
      await createUser();

      const app_ = await loginRequest("flow@example.com", PASSWORD, { "X-Client-Platform": "IOS" });
      const web = await loginRequest("flow@example.com", PASSWORD);

      expect(app_.status).toBe(200);
      expect(app_.body.data.refreshToken).toEqual(expect.any(String));
      expect(app_.headers["set-cookie"]).toBeUndefined();
      expect(web.body.data.refreshToken).toBeUndefined();
      expect(web.headers["set-cookie"]).toBeDefined();
    });

    it("phiên có claim sid; /auth/sessions đánh dấu isCurrent chỉ bằng access token (app không có cookie)", async () => {
      const user = await createUser();
      const first = await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      const second = await loginApp(user.email, PASSWORD, "device-bbbbbbbb");

      const sid = await sessionIdOf(first.accessToken);
      expect(sid).toMatch(/^[0-9a-f]{24}$/);
      const res = await request(app).get("/api/v1/auth/sessions").set(...bearer(first.accessToken));

      expect(res.status).toBe(200);
      const list = res.body.data as { id: string; isCurrent: boolean; deviceId: string | null; expiresAt: string }[];
      expect(list).toHaveLength(2);
      expect(list.filter((s) => s.isCurrent).map((s) => s.id)).toEqual([sid]);
      expect(list.find((s) => s.id === sid)?.deviceId).toBe("device-aaaaaaaa");
      expect(list[0]?.expiresAt).toEqual(expect.any(String));
      expect(await sessionIdOf(second.accessToken)).not.toBe(sid);
    });

    it("thiết bị mới đăng nhập mật khẩu → email cảnh báo; cùng thiết bị lần sau → không cảnh báo lại", async () => {
      const user = await createUser();

      await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      await new Promise(process.nextTick);
      expect(mailService.sendNewDeviceLogin).toHaveBeenCalledTimes(1);

      await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      await new Promise(process.nextTick);
      expect(mailService.sendNewDeviceLogin).toHaveBeenCalledTimes(1);
    });
  });

  // ── Refresh: xoay vòng, tha thứ retry, phát hiện dùng lại ───────────────────────
  describe("refresh token", () => {
    it("xoay vòng: token mới hợp lệ, cùng sid; body app nhận refreshToken mới", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);

      const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken });

      expect(res.status).toBe(200);
      const t1 = res.body.data as Tokens;
      expect(t1.refreshToken).not.toBe(t0.refreshToken);
      expect(await sessionIdOf(t1.accessToken)).toBe(await sessionIdOf(t0.accessToken));
      const me = await request(app).get("/api/v1/auth/me").set(...bearer(t1.accessToken));
      expect(me.status).toBe(200);
    });

    it("retry mạng với token cũ (trong 30 s): 200 VÀ refresh token nhận được dùng tiếp được (không phải token vô dụng)", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);
      await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken }); // phản hồi bị mất

      const retry = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken });
      expect(retry.status).toBe(200);
      const next = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: (retry.body.data as Tokens).refreshToken });

      expect(next.status).toBe(200);
    });

    it("dùng lại token đã xoay quá 30 s → 401 AUTH_010, mọi phiên + access token của user bị thu hồi", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);
      const other = await loginApp(user.email, PASSWORD, "device-bbbbbbbb");
      const t1 = (await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken })).body
        .data as Tokens;
      await prisma.session.updateMany({
        where: { previousTokenHash: { not: null } },
        data: { rotatedAt: new Date(Date.now() - 31_000) },
      });

      const reuse = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken });

      expect(reuse.status).toBe(401);
      expect(reuse.body.error.code).toBe("AUTH_010");
      for (const token of [t1.accessToken, other.accessToken]) {
        const res = await request(app).get("/api/v1/auth/me").set(...bearer(token));
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("AUTH_004");
      }
      const dead = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t1.refreshToken });
      expect(dead.body.error.code).toBe("AUTH_006");
    });

    it("token rác / hết hạn / sai audience → 401 AUTH_006 (không phải 500)", async () => {
      const user = await createUser();
      const expired = jwt.sign({ userId: user.id, email: user.email }, env.JWT_REFRESH_SECRET, {
        expiresIn: -60,
        algorithm: "HS256",
        issuer: "super-app",
        audience: "super-app:refresh",
      });
      const { accessToken } = await loginApp(user.email);

      for (const refreshToken of ["rac", expired, accessToken]) {
        const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe("AUTH_006");
      }
    });

    it("tài khoản bị khoá không refresh được (AUTH_011)", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);
      await prisma.user.update({ where: { id: user.id }, data: { status: "LOCKED" } });

      const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("AUTH_011");
      expect(res.body.error.details).toBeUndefined();
    });

    it("tài khoản chờ xoá refresh → 403 AUTH_012 KÈM deletionGraceUntil (màn Khôi phục tài khoản biết ngày dù yêu cầu xoá ở máy khác)", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);
      const graceUntil = new Date(Date.now() + 5 * 86_400_000);
      await prisma.user.update({
        where: { id: user.id },
        data: { status: "PENDING_DELETION", deletionGraceUntil: graceUntil, deletionRequestedAt: new Date() },
      });

      const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("AUTH_012");
      expect(res.body.error.details).toEqual({ deletionGraceUntil: graceUntil.toISOString() });
    });
  });

  // ── Đăng xuất / thu hồi tức thì ─────────────────────────────────────────────────
  describe("đăng xuất và thu hồi tức thì", () => {
    it("logout: access token + refresh token chết NGAY; access token cũ CÙNG PHIÊN (trước lần refresh) cũng chết", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);
      const t1 = (await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken })).body
        .data as Tokens;

      const out = await request(app)
        .post("/api/v1/auth/logout")
        .set(...bearer(t1.accessToken))
        .send({ refreshToken: t1.refreshToken });

      expect(out.status).toBe(200);
      for (const token of [t1.accessToken, t0.accessToken]) {
        const res = await request(app).get("/api/v1/auth/me").set(...bearer(token));
        expect(res.status).toBe(401);
      }
      const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t1.refreshToken });
      expect(refresh.body.error.code).toBe("AUTH_006");
    });

    it("logout chỉ bằng access token (app không gửi refresh token): phiên vẫn bị thu hồi nhờ claim sid", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);

      await request(app).post("/api/v1/auth/logout").set(...bearer(t0.accessToken)).send({});

      const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken });
      expect(refresh.status).toBe(401);
      expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    });

    /** Access token đã HẾT HẠN nhưng chữ ký đúng — đúng tình huống "máy ngủ/mất mạng lâu rồi bấm Đăng xuất". */
    const expiredAccessToken = (userId: string, email: string, sid?: string): string =>
      jwt.sign({ userId, email, role: "user", sv: 1, ...(sid && { sid }) }, env.JWT_SECRET, {
        expiresIn: -60,
        algorithm: "HS256",
        issuer: "super-app",
        audience: "super-app:access",
      });

    it("logout khi access token ĐÃ HẾT HẠN: chỉ cần refresh token (body app) — phiên vẫn bị thu hồi (trước đây 401 và phiên BE còn sống)", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);
      const other = await loginApp(user.email, PASSWORD, "device-bbbbbbbb");
      const sid = await sessionIdOf(t0.accessToken);

      const out = await request(app)
        .post("/api/v1/auth/logout")
        .set(...bearer(expiredAccessToken(user.id, user.email, sid)))
        .send({ refreshToken: t0.refreshToken });

      expect(out.status).toBe(200);
      const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken });
      expect(refresh.body.error.code).toBe("AUTH_006");
      // Chỉ phiên đó bị thu hồi — phiên khác của cùng người dùng nguyên vẹn.
      const still = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: other.refreshToken });
      expect(still.status).toBe(200);
    });

    it("logout không gửi access token nào, chỉ refresh token: thu hồi phiên và gỡ push token của thiết bị (X-Device-Id)", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      await prisma.deviceToken.create({
        data: {
          userId: user.id,
          deviceId: "device-aaaaaaaa",
          platform: "ANDROID",
          kind: "FCM",
          token: "fcm-token-logout-only-refresh",
          revokedAt: null,
          revokeReason: null,
        },
      });

      const out = await request(app)
        .post("/api/v1/auth/logout")
        .set("X-Device-Id", "device-aaaaaaaa")
        .send({ refreshToken: t0.refreshToken });

      expect(out.status).toBe(200);
      expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
      expect(await prisma.deviceToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    });

    it("logout bằng cookie refresh_token (web): 200 và xoá cookie; Origin KHÔNG tin cậy → 403 (chống CSRF), phiên còn nguyên", async () => {
      const user = await createUser();
      const web = await loginRequest(user.email, PASSWORD);
      const cookie = ((web.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("refresh_token=")) ?? "").split(";")[0] ?? "";

      const evil = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie).set("Origin", "https://evil.example").send({});
      expect(evil.status).toBe(403);
      expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);

      const ok = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie).set("Origin", "http://localhost:5173").send({});
      expect(ok.status).toBe(200);
      expect((ok.headers["set-cookie"] as unknown as string[]).join(";")).toMatch(/refresh_token=;/);
      expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    });

    it("logout không có access token lẫn refresh token → 401 AUTH_002; access token hết hạn mà không có refresh token → 401", async () => {
      const user = await createUser();

      const none = await request(app).post("/api/v1/auth/logout").send({});
      const expiredOnly = await request(app)
        .post("/api/v1/auth/logout")
        .set(...bearer(expiredAccessToken(user.id, user.email)))
        .send({});

      expect(none.status).toBe(401);
      expect(none.body.error.code).toBe("AUTH_002");
      expect(expiredOnly.status).toBe(401);
    });

    it("logout với refresh token rác/hết hạn: 200 idempotent và KHÔNG đụng phiên nào (refresh token chỉ thu hồi được phiên CỦA CHÍNH NÓ)", async () => {
      const user = await createUser();
      const t0 = await loginApp(user.email);
      const expiredRefresh = jwt.sign({ userId: user.id, email: user.email }, env.JWT_REFRESH_SECRET, {
        expiresIn: -60,
        algorithm: "HS256",
        issuer: "super-app",
        audience: "super-app:refresh",
      });

      for (const refreshToken of ["rac", expiredRefresh, t0.accessToken]) {
        const res = await request(app).post("/api/v1/auth/logout").send({ refreshToken });
        expect(res.status).toBe(200);
      }

      const still = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: t0.refreshToken });
      expect(still.status).toBe(200);
    });

    it("cờ cũ is_authenticated không còn được đặt khi đăng nhập/refresh (không client nào dùng); logout chỉ xoá bản cũ nếu trình duyệt còn giữ", async () => {
      const user = await createUser();

      const login = await loginRequest(user.email, PASSWORD);
      const cookies = login.headers["set-cookie"] as unknown as string[];
      const cookie = cookies.find((c) => c.startsWith("refresh_token=")) ?? "";
      const refresh = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie.split(";")[0] ?? "").send({});
      const out = await request(app).post("/api/v1/auth/logout").set("Cookie", (refresh.headers["set-cookie"] as unknown as string[])[0]?.split(";")[0] ?? "").send({});

      expect(cookies.some((c) => c.startsWith("is_authenticated="))).toBe(false);
      expect((refresh.headers["set-cookie"] as unknown as string[]).some((c) => c.startsWith("is_authenticated=1"))).toBe(false);
      expect((out.headers["set-cookie"] as unknown as string[]).some((c) => /^is_authenticated=;/.test(c))).toBe(true);
    });

    it("logout-all: mọi phiên/token của user chết, sessionVersion tăng, có audit auth.logout-all; user khác không bị ảnh hưởng", async () => {
      const user = await createUser();
      const stranger = await createUser("nguoi.la@example.com");
      const a = await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      const b = await loginApp(user.email, PASSWORD, "device-bbbbbbbb");
      const s = await loginApp(stranger.email);

      const res = await request(app).post("/api/v1/auth/logout-all").set(...bearer(a.accessToken)).send({});

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ revokedSessions: 2 });
      for (const token of [a.accessToken, b.accessToken]) {
        const me = await request(app).get("/api/v1/auth/me").set(...bearer(token));
        expect(me.status).toBe(401);
      }
      expect((await request(app).get("/api/v1/auth/me").set(...bearer(s.accessToken))).status).toBe(200);
      const audit = await prisma.auditLog.findMany({ where: { action: "auth.logout-all", targetId: user.id } });
      expect(audit).toHaveLength(1);
    });

    it("thu hồi phiên khác: access token của phiên đó chết NGAY (AUTH_004), có audit; thu hồi phiên hiện tại → 400", async () => {
      const user = await createUser();
      const a = await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      const b = await loginApp(user.email, PASSWORD, "device-bbbbbbbb");
      const sidA = (await sessionIdOf(a.accessToken)) as string;
      const sidB = (await sessionIdOf(b.accessToken)) as string;

      const self = await request(app).delete(`/api/v1/auth/sessions/${sidA}`).set(...bearer(a.accessToken));
      const other = await request(app).delete(`/api/v1/auth/sessions/${sidB}`).set(...bearer(a.accessToken));

      expect(self.status).toBe(400);
      expect(other.status).toBe(200);
      const dead = await request(app).get("/api/v1/auth/me").set(...bearer(b.accessToken));
      expect(dead.status).toBe(401);
      expect(dead.body.error.code).toBe("AUTH_004");
      expect((await request(app).get("/api/v1/auth/me").set(...bearer(a.accessToken))).status).toBe(200);
      const audit = await prisma.auditLog.findMany({ where: { action: "auth.session-revoke" } });
      expect(audit.map((r) => (r.metadata as { sessionId: string }).sessionId)).toEqual([sidB]);
    });

    it("không thu hồi được phiên của người khác (404) và id lạ → 400", async () => {
      const user = await createUser();
      const stranger = await createUser("nguoi.la@example.com");
      const a = await loginApp(user.email);
      const s = await loginApp(stranger.email);
      const strangerSid = (await sessionIdOf(s.accessToken)) as string;

      const res = await request(app).delete(`/api/v1/auth/sessions/${strangerSid}`).set(...bearer(a.accessToken));
      const bad = await request(app).delete("/api/v1/auth/sessions/khong-phai-id").set(...bearer(a.accessToken));

      expect(res.status).toBe(404);
      expect(bad.status).toBe(400);
    });
  });

  // ── Chống dò tài khoản + khoá theo tài khoản ─────────────────────────────────────
  describe("chống dò tài khoản và khoá theo tài khoản", () => {
    it("sai mật khẩu và email không tồn tại cho CÙNG phản hồi (mã, mã lỗi, thông điệp); bcrypt luôn được chạy", async () => {
      await createUser();
      const compare = jest.spyOn(bcrypt, "compare");

      const wrong = await loginRequest("flow@example.com", "sai-mat-khau");
      const unknown = await loginRequest("khong.ton.tai@example.com", "sai-mat-khau");

      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      // AUTH_001 = "Email hoặc mật khẩu không đúng" (không phải mặc định AUTH_002 "Token không hợp lệ").
      expect(wrong.body.error.code).toBe("AUTH_001");
      expect(unknown.body.error.code).toBe(wrong.body.error.code);
      expect(unknown.body.error.message).toBe(wrong.body.error.message);
      expect(compare).toHaveBeenCalledTimes(2);
      compare.mockRestore();
    });

    it("tài khoản bị khoá/chờ xoá + mật khẩu SAI → 401 như thường (không lộ trạng thái); mật khẩu ĐÚNG → 403 AUTH_011/012", async () => {
      await createUser("khoa@example.com", { status: "LOCKED" });
      const graceUntil = new Date(Date.now() + 6 * 86_400_000);
      await createUser("cho.xoa@example.com", {
        status: "PENDING_DELETION",
        deletionRequestedAt: new Date(),
        deletionGraceUntil: graceUntil,
      });

      const lockedWrong = await loginRequest("khoa@example.com", "sai-mat-khau");
      const pendingWrong = await loginRequest("cho.xoa@example.com", "sai-mat-khau");
      const lockedRight = await loginRequest("khoa@example.com", PASSWORD);
      const pendingRight = await loginRequest("cho.xoa@example.com", PASSWORD);

      expect(lockedWrong.status).toBe(401);
      expect(lockedRight.body.error.code).toBe("AUTH_011");
      expect(lockedRight.body.error.details).toBeUndefined();
      expect(pendingRight.body.error.code).toBe("AUTH_012");
      // Ngày tự ẩn danh hoá CHỈ trả khi mật khẩu ĐÚNG (chủ tài khoản); sai mật khẩu vẫn 401 không lộ gì.
      expect(pendingRight.body.error.details).toEqual({ deletionGraceUntil: graceUntil.toISOString() });
      expect(pendingWrong.status).toBe(401);
      expect(pendingWrong.body.error.details).toBeUndefined();
    });

    it("sai 5 lần → khoá tạm theo TÀI KHOẢN: lần 6 (kể cả mật khẩu đúng) bị 429 RATE_002 kèm retryAfterSeconds; email lạ cũng bị khoá y hệt", async () => {
      const user = await createUser();
      for (let i = 0; i < 5; i++) {
        const res = await loginRequest(user.email, `sai-${i}`);
        expect(res.status).toBe(401);
      }

      const blocked = await loginRequest(user.email, PASSWORD);

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_002");
      expect(blocked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
      // Cùng số giây chờ nằm ở header chuẩn để client/proxy đọc không cần bóc body.
      expect(Number(blocked.headers["retry-after"])).toBe(Math.ceil(blocked.body.error.details.retryAfterSeconds));

      for (let i = 0; i < 5; i++) await loginRequest("khong.ton.tai@example.com", `sai-${i}`);
      const unknownBlocked = await loginRequest("khong.ton.tai@example.com", "bat-ky");
      expect(unknownBlocked.status).toBe(429);
      expect(unknownBlocked.body.error.code).toBe("RATE_002");
      // Khoá Redis dùng HASH, không chứa email thô.
      expect(redisFakeKeys().filter((k) => k.includes("@"))).toEqual([]);
    });

    it("khoá ghi audit auth.login-locked (chỉ email có thật); đăng nhập đúng trước khi chạm ngưỡng xoá bộ đếm", async () => {
      const user = await createUser();
      for (let i = 0; i < 4; i++) await loginRequest(user.email, `sai-${i}`);
      expect((await loginRequest(user.email, PASSWORD)).status).toBe(200); // reset bộ đếm
      for (let i = 0; i < 4; i++) await loginRequest(user.email, `sai-${i}`);
      expect((await loginRequest(user.email, PASSWORD)).status).toBe(200); // vẫn chưa khoá
      for (let i = 0; i < 5; i++) await loginRequest(user.email, `sai-${i}`);

      const audit = await prisma.auditLog.findMany({ where: { action: "auth.login-locked" } });
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actorId: user.id, targetId: user.id });
      await loginRequest("khong.ton.tai@example.com", "x");
      for (let i = 0; i < 5; i++) await loginRequest("khong.ton.tai@example.com", `sai-${i}`);
      expect(await prisma.auditLog.count({ where: { action: "auth.login-locked" } })).toBe(1);
    });

    it("nonce dùng lại → 401 AUTH_018 (chống replay), kể cả khi mật khẩu đúng", async () => {
      await createUser();
      const nonce = await getNonce();

      const first = await request(app).post("/api/v1/auth/login").send({ email: "flow@example.com", password: PASSWORD, nonce });
      const replay = await request(app).post("/api/v1/auth/login").send({ email: "flow@example.com", password: PASSWORD, nonce });

      expect(first.status).toBe(200);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe("AUTH_018");
    });
  });

  // ── Quên / đặt lại mật khẩu ───────────────────────────────────────────────────────
  describe("quên và đặt lại mật khẩu", () => {
    async function requestReset(email: string): Promise<string | undefined> {
      const res = await request(app).post("/api/v1/auth/forgot-password").send({ email });
      expect(res.status).toBe(200);
      const call = (mailService.sendResetPassword as jest.Mock).mock.calls.at(-1) as [string, string] | undefined;
      return call?.[1];
    }

    it("forgot-password: cùng phản hồi cho email có/không tồn tại; chỉ email có thật mới gửi mail; lỗi SMTP không đổi phản hồi", async () => {
      await createUser();

      const known = await request(app).post("/api/v1/auth/forgot-password").send({ email: "flow@example.com" });
      const unknown = await request(app).post("/api/v1/auth/forgot-password").send({ email: "khong.ton.tai@example.com" });

      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(unknown.body.message).toBe(known.body.message);
      expect(mailService.sendResetPassword).toHaveBeenCalledTimes(1);

      (mailService.sendResetPassword as jest.Mock).mockRejectedValue(new Error("SMTP down"));
      const smtpDown = await request(app).post("/api/v1/auth/forgot-password").send({ email: "Flow@Example.com" });
      expect(smtpDown.status).toBe(200);
    });

    it("token đặt lại chỉ lưu dạng HASH trên Redis (khoá không chứa token thô)", async () => {
      await createUser();

      const token = await requestReset("flow@example.com");

      expect(token).toEqual(expect.any(String));
      expect(redisFakeKeys().some((k) => k.includes(token as string))).toBe(false);
      expect(redisFakeKeys().some((k) => k.startsWith("reset:"))).toBe(true);
    });

    it("đặt lại mật khẩu THU HỒI MỌI phiên: access token AUTH_004, refresh token AUTH_006, sinh trắc học bị thu hồi; mật khẩu mới đăng nhập được", async () => {
      const user = await createUser();
      const a = await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      const b = await loginApp(user.email, PASSWORD, "device-bbbbbbbb");
      const credential = await prisma.biometricCredential.create({
        data: {
          userId: user.id,
          deviceId: "device-aaaaaaaa",
          platform: "ANDROID",
          biometryKind: "FINGERPRINT",
          secretHash: "c".repeat(64),
          activeKey: `${user.id}:device-aaaaaaaa`,
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      const token = (await requestReset(user.email)) as string;

      const res = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: NEW_PASSWORD });

      expect(res.status).toBe(200);
      for (const tokens of [a, b]) {
        const me = await request(app).get("/api/v1/auth/me").set(...bearer(tokens.accessToken));
        expect(me.status).toBe(401);
        expect(me.body.error.code).toBe("AUTH_004");
        const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: tokens.refreshToken });
        expect(refresh.body.error.code).toBe("AUTH_006");
      }
      expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
      expect(await prisma.biometricCredential.findUniqueOrThrow({ where: { id: credential.id } })).toMatchObject({
        status: "REVOKED",
        revokeReason: "PASSWORD_RESET",
      });
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.passwordChangedAt).toBeInstanceOf(Date);
      expect(after.sessionVersion).toBe(user.sessionVersion + 1);
      expect((await loginRequest(user.email, PASSWORD)).status).toBe(401);
      expect((await loginRequest(user.email, NEW_PASSWORD)).status).toBe(200);
      expect(await prisma.auditLog.count({ where: { action: "auth.password-reset", targetId: user.id } })).toBe(1);
      await new Promise(process.nextTick);
      expect(mailService.sendRaw).toHaveBeenCalledWith(expect.objectContaining({ to: user.email }));
    });

    it("token dùng MỘT lần: lần 2 → 401; hai request ĐỒNG THỜI cùng token chỉ một request thắng", async () => {
      const user = await createUser();
      const token = (await requestReset(user.email)) as string;

      const [a, b] = await Promise.all([
        request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: NEW_PASSWORD }),
        request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "Mat-khau-khac-77" }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 401]);
      const again = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: NEW_PASSWORD });
      expect(again.status).toBe(401);
      // AUTH_008 = "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn" (mã riêng đã có trong từ điển).
      expect(again.body.error.code).toBe("AUTH_008");
    });

    it("yêu cầu token mới thu hồi token cũ (mỗi user một token còn hiệu lực)", async () => {
      const user = await createUser();
      const first = (await requestReset(user.email)) as string;
      const second = (await requestReset(user.email)) as string;

      const old = await request(app).post("/api/v1/auth/reset-password").send({ token: first, newPassword: NEW_PASSWORD });
      const current = await request(app).post("/api/v1/auth/reset-password").send({ token: second, newPassword: NEW_PASSWORD });

      expect(old.status).toBe(401);
      expect(current.status).toBe(200);
    });

    it("mật khẩu mới < 8 ký tự → 400 và KHÔNG tiêu thụ token; token lạ → 401", async () => {
      const user = await createUser();
      const token = (await requestReset(user.email)) as string;

      const weak = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "1234567" });
      const bogus = await request(app).post("/api/v1/auth/reset-password").send({ token: "khong-co", newPassword: NEW_PASSWORD });
      const ok = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: NEW_PASSWORD });

      expect(weak.status).toBe(400);
      expect(bogus.status).toBe(401);
      expect(ok.status).toBe(200);
    });

    it("đặt lại thành công xoá khoá đăng nhập theo tài khoản (lối thoát khi bị khoá)", async () => {
      const user = await createUser();
      for (let i = 0; i < 5; i++) await loginRequest(user.email, `sai-${i}`);
      expect((await loginRequest(user.email, PASSWORD)).status).toBe(429);
      const token = (await requestReset(user.email)) as string;

      await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: NEW_PASSWORD });

      expect((await loginRequest(user.email, NEW_PASSWORD)).status).toBe(200);
    });
  });

  // ── Đổi mật khẩu ───────────────────────────────────────────────────────────────────
  describe("đổi mật khẩu", () => {
    it("giữ phiên hiện tại (nhận diện bằng sid), thu hồi phiên KHÁC ngay, trả access token mới; access token cũ hết hiệu lực", async () => {
      const user = await createUser();
      const current = await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      const other = await loginApp(user.email, PASSWORD, "device-bbbbbbbb");

      const res = await request(app)
        .patch("/api/v1/auth/change-password")
        .set(...bearer(current.accessToken))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ revokedSessions: 1, tokenType: "Bearer" });
      const fresh = res.body.data.accessToken as string;
      // Phiên khác chết NGAY (cả access lẫn refresh).
      const otherMe = await request(app).get("/api/v1/auth/me").set(...bearer(other.accessToken));
      expect(otherMe.body.error.code).toBe("AUTH_004");
      const otherRefresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: other.refreshToken });
      expect(otherRefresh.body.error.code).toBe("AUTH_006");
      // Access token cũ của phiên hiện tại mang sessionVersion cũ ⇒ chết; token mới trong response dùng được.
      const oldMe = await request(app).get("/api/v1/auth/me").set(...bearer(current.accessToken));
      expect(oldMe.status).toBe(401);
      const newMe = await request(app).get("/api/v1/auth/me").set(...bearer(fresh));
      expect(newMe.status).toBe(200);
      expect(await sessionIdOf(fresh)).toBe(await sessionIdOf(current.accessToken));
      // Refresh token của phiên hiện tại vẫn sống và cấp access token đúng sessionVersion mới.
      const refreshed = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: current.refreshToken });
      expect(refreshed.status).toBe(200);
      expect((await request(app).get("/api/v1/auth/me").set(...bearer(refreshed.body.data.accessToken))).status).toBe(200);
      expect(await prisma.auditLog.count({ where: { action: "auth.password-change", targetId: user.id } })).toBe(1);
      expect((await loginRequest(user.email, NEW_PASSWORD)).status).toBe(200);
    });

    it("access token KHÔNG có sid và không gửi refresh token ⇒ thu hồi TẤT CẢ phiên, không trả access token mới", async () => {
      const user = await createUser();
      const a = await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      const legacy = JwtUtils.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: "user",
        sv: user.sessionVersion,
      });

      const res = await request(app)
        .patch("/api/v1/auth/change-password")
        .set(...bearer(legacy))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ revokedSessions: 1 });
      const refresh = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: a.refreshToken });
      expect(refresh.status).toBe(401);
    });

    it("app gửi refresh token của phiên hiện tại trong body ⇒ phiên đó được giữ", async () => {
      const user = await createUser();
      const current = await loginApp(user.email, PASSWORD, "device-aaaaaaaa");
      await loginApp(user.email, PASSWORD, "device-bbbbbbbb");
      const legacy = JwtUtils.generateAccessToken({ userId: user.id, email: user.email, role: "user", sv: user.sessionVersion });

      const res = await request(app)
        .patch("/api/v1/auth/change-password")
        .set(...bearer(legacy))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, refreshToken: current.refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.revokedSessions).toBe(1);
      const refreshed = await request(app).post("/api/v1/auth/refresh").send({ refreshToken: current.refreshToken });
      expect(refreshed.status).toBe(200);
    });

    it("sai mật khẩu hiện tại → 401 và bị đếm: sai 5 lần thì khoá 429; mật khẩu mới trùng mật khẩu cũ → 400", async () => {
      const user = await createUser();
      const { accessToken } = await loginApp(user.email);
      const change = (currentPassword: string, newPassword = NEW_PASSWORD) =>
        request(app)
          .patch("/api/v1/auth/change-password")
          .set(...bearer(accessToken))
          .send({ currentPassword, newPassword });

      expect((await change(PASSWORD, PASSWORD)).status).toBe(400);
      const firstWrong = await change("sai-0");
      expect(firstWrong.status).toBe(401);
      // AUTH_001: app không coi là "token hết hạn" (sẽ làm mới token rồi dọn phiên) khi người dùng gõ sai mật khẩu hiện tại.
      expect(firstWrong.body.error.code).toBe("AUTH_001");
      for (let i = 1; i < 5; i++) expect((await change(`sai-${i}`)).status).toBe(401);

      const blocked = await change(PASSWORD);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("RATE_002");
    });

    it("đổi mật khẩu huỷ token đặt lại còn treo", async () => {
      const user = await createUser();
      await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email });
      const token = (mailService.sendResetPassword as jest.Mock).mock.calls.at(-1)?.[1] as string;
      const { accessToken } = await loginApp(user.email);

      await request(app)
        .patch("/api/v1/auth/change-password")
        .set(...bearer(accessToken))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

      const res = await request(app).post("/api/v1/auth/reset-password").send({ token, newPassword: "Mat-khau-khac-77" });
      expect(res.status).toBe(401);
    });
  });

  // ── Xác minh email ─────────────────────────────────────────────────────────────────
  describe("xác minh email", () => {
    it("mã 6 chữ số; sai 5 lần thì khoá 429 (không dò được 10^6 khả năng); mã đúng xác minh được", async () => {
      const user = await createUser();
      const { accessToken } = await loginApp(user.email);
      await request(app).post("/api/v1/auth/verify-email/send").set(...bearer(accessToken));
      const { verificationToken } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(verificationToken).toMatch(/^\d{6}$/);
      const wrong = verificationToken === "000000" ? "111111" : "000000";

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post("/api/v1/auth/verify-email/confirm")
          .set(...bearer(accessToken))
          .send({ code: wrong });
        expect(res.status).toBe(400);
      }
      const blocked = await request(app)
        .post("/api/v1/auth/verify-email/confirm")
        .set(...bearer(accessToken))
        .send({ code: verificationToken });

      expect(blocked.status).toBe(429);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(false);
    });

    it("mã đúng → emailVerified = true", async () => {
      const user = await createUser();
      const { accessToken } = await loginApp(user.email);
      await request(app).post("/api/v1/auth/verify-email/send").set(...bearer(accessToken));
      const { verificationToken } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

      const res = await request(app)
        .post("/api/v1/auth/verify-email/confirm")
        .set(...bearer(accessToken))
        .send({ code: verificationToken });

      expect(res.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(true);
    });

    it("mã lỗi RIÊNG (không còn chung VAL_001): mã sai → AUTH_020; đã xác minh rồi gửi/xác nhận lại → AUTH_019 (status vẫn 400)", async () => {
      const user = await createUser();
      const { accessToken } = await loginApp(user.email);
      await request(app).post("/api/v1/auth/verify-email/send").set(...bearer(accessToken));
      const { verificationToken } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const wrong = verificationToken === "000000" ? "111111" : "000000";

      const bad = await request(app).post("/api/v1/auth/verify-email/confirm").set(...bearer(accessToken)).send({ code: wrong });
      expect([bad.status, bad.body.error.code]).toEqual([400, "AUTH_020"]);
      expect(bad.body.error.message).toBe("Mã xác minh không hợp lệ hoặc đã hết hạn");

      await request(app).post("/api/v1/auth/verify-email/confirm").set(...bearer(accessToken)).send({ code: verificationToken });
      const again = await request(app).post("/api/v1/auth/verify-email/send").set(...bearer(accessToken));
      expect([again.status, again.body.error.code]).toEqual([400, "AUTH_019"]);
      const confirmAgain = await request(app).post("/api/v1/auth/verify-email/confirm").set(...bearer(accessToken)).send({ code: verificationToken });
      expect([confirmAgain.status, confirmAgain.body.error.code]).toEqual([400, "AUTH_019"]);
    });
  });

  // ── Biometric enroll: bảo vệ mật khẩu ────────────────────────────────────────────
  describe("bật sinh trắc học", () => {
    it("nhập sai mật khẩu 5 lần khi enroll thì bị khoá (chống dò mật khẩu bằng access token bị lộ); không tạo credential", async () => {
      const user = await createUser();
      const { accessToken } = await loginApp(user.email);
      const enroll = (password: string) =>
        request(app)
          .post("/api/v1/auth/biometric/enroll")
          .set(...bearer(accessToken))
          .send({ password, deviceId: "device-aaaaaaaa", platform: "ANDROID", biometryKind: "FINGERPRINT" });

      for (let i = 0; i < 5; i++) expect((await enroll(`sai-${i}`)).status).toBe(401);
      const blocked = await enroll(PASSWORD);

      expect(blocked.status).toBe(429);
      expect(await prisma.biometricCredential.count({ where: { userId: user.id } })).toBe(0);
    });
  });
});
