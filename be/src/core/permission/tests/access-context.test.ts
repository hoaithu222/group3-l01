import jwt from "jsonwebtoken";
import { verifyAccessContext } from "../access-context";
import { JwtUtils } from "../../utils/jwt";
import { env } from "../../config";
import { redis } from "../../../infrastructure/redis";
import { getUserStatusCached } from "../user-status";

jest.mock("../user-status", () => ({
  getUserStatusCached: jest.fn(),
}));

jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

const SID = "66f1b2c3d4e5f60718293a4b";
const revokedSessions = new Set<string>();
const blacklisted = new Set<string>();

function accessToken(extra: { sid?: string; sv?: number } = {}): string {
  return JwtUtils.generateAccessToken({
    userId: "u1",
    email: "a@e.com",
    role: "user",
    sv: extra.sv ?? 1,
    ...(extra.sid && { sid: extra.sid }),
  });
}

describe("verifyAccessContext", () => {
  beforeEach(() => {
    revokedSessions.clear();
    blacklisted.clear();
    // `resetMocks: true` (jest.config.ts) xoá implementation trước MỖI test.
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    (redis.get as jest.Mock).mockImplementation(async (key: string) => {
      if (key.startsWith("session:revoked:")) return revokedSessions.has(key.slice("session:revoked:".length)) ? 1 : null;
      if (key.startsWith("blacklist:")) return blacklisted.has(key) ? 1 : null;
      return null;
    });
  });

  describe("chữ ký/hạn/iss/aud/thuật toán được kiểm TRƯỚC mọi truy vấn hạ tầng", () => {
    it("token rác ⇒ 401, không chạm Redis/DB", async () => {
      await expect(verifyAccessContext("khong-phai-jwt")).rejects.toMatchObject({ statusCode: 401 });

      expect(redis.get).not.toHaveBeenCalled();
      expect(getUserStatusCached).not.toHaveBeenCalled();
    });

    it("refresh token dùng làm access token (khác audience + khác secret) ⇒ 401", async () => {
      const refresh = JwtUtils.generateRefreshToken({ userId: "u1", email: "a@e.com" });

      await expect(verifyAccessContext(refresh)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("token hết hạn ⇒ 401", async () => {
      const expired = jwt.sign({ userId: "u1", email: "a@e.com", sv: 1 }, env.JWT_SECRET, {
        algorithm: "HS256",
        issuer: "super-app",
        audience: "super-app:access",
        expiresIn: -60,
      });

      await expect(verifyAccessContext(expired)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("thuật toán khác HS256 (HS512 cùng secret) bị từ chối — thuật toán cố định, header của kẻ tấn công không quyết định được gì", async () => {
      const hs512 = jwt.sign({ userId: "u1", email: "a@e.com", sv: 1 }, env.JWT_SECRET, {
        algorithm: "HS512",
        issuer: "super-app",
        audience: "super-app:access",
      });

      await expect(verifyAccessContext(hs512)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("token không ký (alg=none) bị từ chối", async () => {
      const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({ userId: "u1", email: "a@e.com", sv: 1, iss: "super-app", aud: "super-app:access" })
      ).toString("base64url");

      await expect(verifyAccessContext(`${header}.${payload}.`)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("sai issuer hoặc sai audience ⇒ 401", async () => {
      const wrongIssuer = jwt.sign({ userId: "u1", email: "a@e.com", sv: 1 }, env.JWT_SECRET, {
        algorithm: "HS256",
        issuer: "ke-gia-mao",
        audience: "super-app:access",
      });
      const wrongAudience = jwt.sign({ userId: "u1", email: "a@e.com", sv: 1 }, env.JWT_SECRET, {
        algorithm: "HS256",
        issuer: "super-app",
        audience: "app-khac",
      });

      await expect(verifyAccessContext(wrongIssuer)).rejects.toMatchObject({ statusCode: 401 });
      await expect(verifyAccessContext(wrongAudience)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("ký bằng secret khác ⇒ 401", async () => {
      const forged = jwt.sign({ userId: "u1", email: "a@e.com", sv: 1 }, "secret-cua-ke-tan-cong-du-dai-de-hop-le", {
        algorithm: "HS256",
        issuer: "super-app",
        audience: "super-app:access",
      });

      await expect(verifyAccessContext(forged)).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe("trạng thái tài khoản và sessionVersion", () => {
    it("ACTIVE + sessionVersion khớp ⇒ trả user (kèm sessionId khi có sid)", async () => {
      const ctx = await verifyAccessContext(accessToken({ sid: SID }));

      expect(ctx.user).toEqual({
        id: "u1",
        email: "a@e.com",
        name: undefined,
        role: "user",
        permissions: [],
        sessionId: SID,
      });
      expect(ctx.exp).toEqual(expect.any(Number));
    });

    it("token cũ không có sid ⇒ hợp lệ, KHÔNG tra dấu thu hồi phiên (chỉ 1 lần Redis cho blacklist)", async () => {
      const ctx = await verifyAccessContext(accessToken());

      expect(ctx.user.sessionId).toBeUndefined();
      const keys = (redis.get as jest.Mock).mock.calls.map((c) => String(c[0]));
      expect(keys.filter((k) => k.startsWith("session:revoked:"))).toEqual([]);
    });

    it.each([
      ["LOCKED", 403, "AUTH_011"],
      ["ANONYMIZED", 403, "AUTH_011"],
      ["PENDING_DELETION", 403, "AUTH_012"],
    ])("status %s ⇒ %i %s", async (status, http, code) => {
      (getUserStatusCached as jest.Mock).mockResolvedValue({ status, sessionVersion: 1 });

      await expect(verifyAccessContext(accessToken())).rejects.toMatchObject({ statusCode: http, errorCode: code });
    });

    it("user không tồn tại ⇒ 401", async () => {
      (getUserStatusCached as jest.Mock).mockResolvedValue(null);

      await expect(verifyAccessContext(accessToken())).rejects.toMatchObject({ statusCode: 401 });
    });

    it("sessionVersion lệch ⇒ 401 AUTH_004", async () => {
      (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 2 });

      await expect(verifyAccessContext(accessToken({ sv: 1 }))).rejects.toMatchObject({
        statusCode: 401,
        errorCode: "AUTH_004",
      });
    });
  });

  describe("blacklist và thu hồi tức thì một phiên (claim sid)", () => {
    it("token nằm trong blacklist (đã đăng xuất) ⇒ 401", async () => {
      const token = accessToken();
      (redis.get as jest.Mock).mockImplementation(async (key: string) => (key.startsWith("blacklist:") ? 1 : null));

      await expect(verifyAccessContext(token)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("phiên của token đã bị thu hồi ⇒ 401 AUTH_004 NGAY (không chờ token hết hạn)", async () => {
      revokedSessions.add(SID);

      await expect(verifyAccessContext(accessToken({ sid: SID }))).rejects.toMatchObject({
        statusCode: 401,
        errorCode: "AUTH_004",
      });
    });

    it("phiên khác của cùng user không bị ảnh hưởng", async () => {
      revokedSessions.add(SID);

      await expect(verifyAccessContext(accessToken({ sid: "66f1b2c3d4e5f60718293a99" }))).resolves.toMatchObject({
        user: { sessionId: "66f1b2c3d4e5f60718293a99" },
      });
    });

    it("Redis lỗi khi tra dấu thu hồi ⇒ cho qua (cùng triết lý blacklist: sự cố hạ tầng không khoá người dùng thật)", async () => {
      (redis.get as jest.Mock).mockRejectedValue(new Error("ECONNRESET"));

      await expect(verifyAccessContext(accessToken({ sid: SID }))).resolves.toMatchObject({ user: { id: "u1" } });
    });
  });
});
