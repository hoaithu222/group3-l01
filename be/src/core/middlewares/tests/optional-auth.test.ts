import express from "express";
import request from "supertest";
import { optionalAuth } from "../auth";
import { JwtUtils } from "../../utils/jwt";
import { redis } from "../../../infrastructure/redis";
import { getUserStatusCached } from "../../permission/user-status";

jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn() },
}));

jest.mock("../../permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
}));

const app = express();
app.get("/public", optionalAuth, (req, res) => {
  res.json({ user: req.user ?? null });
});

const SID = "66f1b2c3d4e5f60718293a4b";
const token = (sv = 1, sid?: string): string =>
  JwtUtils.generateAccessToken({ userId: "u1", email: "a@e.com", role: "user", sv, ...(sid && { sid }) });

describe("optionalAuth — kiểm ĐÚNG như authenticateToken, chỉ khác là không ném lỗi", () => {
  beforeEach(() => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  });

  it("không có Authorization ⇒ đi tiếp như khách", async () => {
    const res = await request(app).get("/public");

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("token hợp lệ ⇒ gắn req.user (kèm sessionId)", async () => {
    const res = await request(app).get("/public").set("Authorization", `Bearer ${token(1, SID)}`);

    expect(res.body.user).toMatchObject({ id: "u1", email: "a@e.com", role: "user", sessionId: SID });
  });

  it("tài khoản đã KHOÁ ⇒ coi như khách (trước đây vẫn được coi là đã đăng nhập tới khi token hết hạn)", async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "LOCKED", sessionVersion: 1 });

    const res = await request(app).get("/public").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toBeNull();
  });

  it("chờ xoá / đã ẩn danh / không còn tồn tại ⇒ khách", async () => {
    for (const snap of [{ status: "PENDING_DELETION", sessionVersion: 1 }, { status: "ANONYMIZED", sessionVersion: 1 }, null]) {
      (getUserStatusCached as jest.Mock).mockResolvedValue(snap);

      const res = await request(app).get("/public").set("Authorization", `Bearer ${token()}`);

      expect(res.body.user).toBeNull();
    }
  });

  it("phiên đã bị thu hồi (sessionVersion lệch — đổi/đặt lại mật khẩu, đăng xuất mọi nơi) ⇒ khách", async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 2 });

    const res = await request(app).get("/public").set("Authorization", `Bearer ${token(1)}`);

    expect(res.body.user).toBeNull();
  });

  it("phiên đã thu hồi lẻ (dấu trên Redis) ⇒ khách", async () => {
    (redis.get as jest.Mock).mockImplementation(async (key: string) => (key === `session:revoked:${SID}` ? 1 : null));

    const res = await request(app).get("/public").set("Authorization", `Bearer ${token(1, SID)}`);

    expect(res.body.user).toBeNull();
  });

  it("token bị blacklist (đã đăng xuất) ⇒ khách", async () => {
    (redis.get as jest.Mock).mockImplementation(async (key: string) => (key.startsWith("blacklist:") ? 1 : null));

    const res = await request(app).get("/public").set("Authorization", `Bearer ${token()}`);

    expect(res.body.user).toBeNull();
  });

  it("token rác / header sai định dạng ⇒ khách, không ném lỗi", async () => {
    for (const header of ["Bearer rac", "Basic abc", "Bearer"]) {
      const res = await request(app).get("/public").set("Authorization", header);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    }
  });
});
