import { decodeJwtPayload, setLiveKitEnv, TEST_LIVEKIT } from "../../../infrastructure/media/tests/livekit-test-utils";

setLiveKitEnv();

const mockIncr = jest.fn();
jest.mock("../../../infrastructure/redis", () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incr: (...args: unknown[]) => mockIncr(...args),
    expire: jest.fn(),
    ping: jest.fn(),
    getdel: jest.fn(),
    getClient: jest.fn(),
  },
}));
jest.mock("../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { env } from "../../../core/config";
import { errorHandler, notFoundHandler } from "../../../core/middlewares";
import { getUserStatusCached } from "../../../core/permission/user-status";
import { JwtUtils } from "../../../core/utils/jwt";
import { redis } from "../../../infrastructure/redis";
import { spikeAllowedEmails } from "../media-dev.access";
import { createMediaDevRouter } from "../media-dev.routes";
import { MediaDevService } from "../media-dev.service";
import { spikeTokenSchema } from "../media-dev.validators";

const app = express();
app.use(express.json());
app.use("/api/v1/dev/media", createMediaDevRouter(new MediaDevService()));
app.use(notFoundHandler);
app.use(errorHandler);

const USER_ID = "507f1f77bcf86cd799439011";
const tokenFor = (role: string, email = "tester@e.com") => JwtUtils.generateAccessToken({ userId: USER_ID, email, name: "Người Thử", role, sv: 1 });
const post = (body: unknown, role = "admin", email?: string) =>
  request(app).post("/api/v1/dev/media/spike-token").set("Authorization", `Bearer ${tokenFor(role, email)}`).send(body as object);

const mutableEnv = env as unknown as Record<string, unknown>;
const original = { ...{ MEDIA_SPIKE_ENABLED: mutableEnv.MEDIA_SPIKE_ENABLED, NODE_ENV: mutableEnv.NODE_ENV, MEDIA_SPIKE_ALLOWED_EMAILS: mutableEnv.MEDIA_SPIKE_ALLOWED_EMAILS, LIVEKIT_API_SECRET: mutableEnv.LIVEKIT_API_SECRET } };

beforeEach(() => {
  Object.assign(mutableEnv, original, { MEDIA_SPIKE_ENABLED: true });
  (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
  // `resetMocks` xoá mockImplementation; blacklist token kiểm `redis.get` phải trả `null` (không phải undefined).
  (redis.get as jest.Mock).mockResolvedValue(null);
  mockIncr.mockResolvedValue(1);
});
afterAll(() => {
  Object.assign(mutableEnv, original);
});

describe("POST /dev/media/spike-token", () => {
  it("admin → 200 { url, token, room: spike_<room>, identity: userId từ phiên, expiresAt }", async () => {
    const res = await post({ room: "demo-1", publish: { audio: true, video: true, screen: false } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ url: TEST_LIVEKIT.publicUrl, room: "spike_demo-1", identity: USER_ID });
    expect(new Date(res.body.data.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
    const claims = decodeJwtPayload(res.body.data.token as string);
    expect(claims.sub).toBe(USER_ID);
    expect(claims.video).toMatchObject({ roomJoin: true, room: "spike_demo-1", canPublishSources: ["microphone", "camera"] });
    expect(claims.video?.roomAdmin).toBeUndefined();
    expect(JSON.parse(claims.metadata as string)).toEqual({ v: 1, role: "spike" });
  });

  it("không gửi publish → mặc định audio+video, không màn hình", async () => {
    const res = await post({ room: "demo-2" });
    expect(res.status).toBe(200);
    expect(decodeJwtPayload(res.body.data.token as string).video?.canPublishSources).toEqual(["microphone", "camera"]);
  });

  it("endpoint TẮT (MEDIA_SPIKE_ENABLED=false) → 404 kể cả admin, kể cả khi chưa đăng nhập (không lộ tồn tại)", async () => {
    mutableEnv.MEDIA_SPIKE_ENABLED = false;
    expect((await post({ room: "demo-1" })).status).toBe(404);
    expect((await request(app).post("/api/v1/dev/media/spike-token").send({ room: "demo-1" })).status).toBe(404);
  });

  it("chặn cứng ở production dù MEDIA_SPIKE_ENABLED=true → 404", async () => {
    mutableEnv.NODE_ENV = "production";
    expect((await post({ room: "demo-1" })).status).toBe(404);
  });

  it("không token → 401", async () => {
    expect((await request(app).post("/api/v1/dev/media/spike-token").send({ room: "demo-1" })).status).toBe(401);
  });

  it("user thường không nằm trong allowlist → 403", async () => {
    const res = await post({ room: "demo-1" }, "user", "stranger@e.com");
    expect(res.status).toBe(403);
  });

  it("user thường có email trong MEDIA_SPIKE_ALLOWED_EMAILS (không phân biệt hoa thường, có khoảng trắng) → 200", async () => {
    mutableEnv.MEDIA_SPIKE_ALLOWED_EMAILS = " QA1@e.com , tester@E.com ";
    expect(spikeAllowedEmails()).toEqual(new Set(["qa1@e.com", "tester@e.com"]));
    expect((await post({ room: "demo-1" }, "user", "Tester@e.com")).status).toBe(200);
  });

  it("body không hợp lệ → 400 VAL_001: tên phòng sai mẫu, thiếu room, thừa trường (không cho ép identity/quyền quản trị)", async () => {
    for (const body of [{ room: "Room X" }, { room: "ab" }, { room: "x".repeat(33) }, {}, { room: "demo-1", identity: "evil" }, { room: "demo-1", roomAdmin: true }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VAL_001");
    }
  });

  it("vượt 30 lượt/giờ → 429", async () => {
    mockIncr.mockResolvedValue(31);
    const res = await post({ room: "demo-1" });
    expect(res.status).toBe(429);
    expect(mockIncr).toHaveBeenCalledWith(expect.stringContaining("rl:media-spike:"));
  });

  it("LiveKit chưa cấu hình → 503 MEDIA_001", async () => {
    mutableEnv.LIVEKIT_API_SECRET = undefined;
    const res = await post({ room: "demo-1" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("MEDIA_001");
  });
});

describe("spikeTokenSchema", () => {
  it("chỉ chấp nhận a-z, 0-9, gạch nối, 3–32 ký tự", () => {
    expect(spikeTokenSchema.safeParse({ room: "abc" }).success).toBe(true);
    expect(spikeTokenSchema.safeParse({ room: "a-b-1" }).success).toBe(true);
    expect(spikeTokenSchema.safeParse({ room: "A-b" }).success).toBe(false);
    expect(spikeTokenSchema.safeParse({ room: "a_b" }).success).toBe(false);
    expect(spikeTokenSchema.safeParse({ room: "a b" }).success).toBe(false);
  });
});
