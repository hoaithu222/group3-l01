import express from "express";
import request from "supertest";
import { authenticateToken } from "../auth";
import { errorHandler } from "../errorHandler";
import { JwtUtils } from "../../utils/jwt";

jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
}));

import { getUserStatusCached } from "../../permission/user-status";
import { redis } from "../../../infrastructure/redis";

function buildApp() {
  const app = express();
  app.get("/protected", authenticateToken, (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  app.use(errorHandler);
  return app;
}

const app = buildApp();
const token = JwtUtils.generateAccessToken({ userId: "u1", email: "a@e.com", role: "user", sv: 1 });

describe("authenticateToken — kiểm trạng thái tài khoản", () => {
  beforeEach(() => {
    // `resetMocks: true` (jest.config.ts) xoá implementation trước MỖI test.
    (redis.get as jest.Mock).mockResolvedValue(null);
  });

  it("ACTIVE + sessionVersion khớp → cho qua", async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("LOCKED → 403 AUTH_011", async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "LOCKED", sessionVersion: 1 });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("AUTH_011");
  });

  it("PENDING_DELETION → 403 AUTH_012", async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({
      status: "PENDING_DELETION",
      sessionVersion: 1,
    });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("AUTH_012");
  });

  it("sessionVersion lệch (đã bị thu hồi) → 401 AUTH_004", async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 2 });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTH_004");
  });

  it("user không tồn tại → 401", async () => {
    (getUserStatusCached as jest.Mock).mockResolvedValue(null);
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
