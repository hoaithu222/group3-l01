/**
 * Integration — `GET /api/health/live` + drain (p0-11 be.md §4/§5.2, OPS-13). Router THẬT (mọi module), DB thật (Mongo memory, `TEST_DB=memory`);
 * Redis + hàng đợi là đồ giả. Kiểm: liveness không phụ thuộc DB/Redis; `/api/health` có `status`/`uptime`; SIGTERM (`beginDrain`) → `/api/health` 503 `draining`
 * còn `/api/health/live` vẫn 200 (Docker không restart api đang tắt êm).
 */
jest.mock("../../../redis", () => ({
  redis: {
    connect: jest.fn(), disconnect: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(),
    expire: jest.fn(), getdel: jest.fn(), getClient: jest.fn(), ping: jest.fn(), setNx: jest.fn(), exists: jest.fn(),
  },
}));
jest.mock("../../../queue", () => {
  const actual = jest.requireActual<typeof import("../../../queue")>("../../../queue");
  return { ...actual, getQueue: jest.fn() };
});

jest.mock("../../../../core/config/runtime-config", () => ({
  ...jest.requireActual("../../../../core/config/runtime-config"),
  runtimeConfig: { isFeatureEnabled: jest.fn(), getEffective: jest.fn(), getLimits: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { runtimeConfig } from "../../../../core/config/runtime-config";
import { redis } from "../../../redis";
import { getQueue } from "../../../queue";
import { NoopMediaServer, setMediaServerForTests } from "../../../media";
import { resetLiveKitHealthCache } from "../../../media/livekit.health";
import { beginDrain, resetDrainForTests } from "../../drain";

const describeDb = process.env.TEST_DB === "memory" ? describe : describe.skip;

describeDb("GET /api/health/live và drain", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const routes = (require("../../../../router") as typeof import("../../../../router")).default;
  const app = express();
  app.use("/api", routes);

  beforeEach(() => {
    resetDrainForTests();
    // Không phụ thuộc .env của máy dev: LiveKit coi như chưa cấu hình + mọi cờ phân hệ tắt.
    resetLiveKitHealthCache();
    setMediaServerForTests(new NoopMediaServer());
    (runtimeConfig.isFeatureEnabled as jest.Mock).mockResolvedValue(false);
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (getQueue as jest.Mock).mockReturnValue({ getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0 }) });
  });
  afterAll(() => {
    resetDrainForTests();
    setMediaServerForTests(null);
  });

  it("/health/live luôn 200 { status: ok }, kể cả khi Redis lỗi (không kiểm phụ thuộc)", async () => {
    (redis.ping as jest.Mock).mockResolvedValue(false);
    const res = await request(app).get("/api/health/live");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("/health khoẻ: 200 kèm status ok, uptime (giây) và services", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, status: "ok", services: { redis: "ok", db: "ok" } });
    expect(typeof res.body.uptime).toBe("number");
  });

  it("/health khi Redis lỗi: 503 status down (không nhầm với draining)", async () => {
    (redis.ping as jest.Mock).mockResolvedValue(false);
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("down");
    expect(res.body.services.redis).toBe("error");
  });

  it("đang drain (SIGTERM): /health → 503 draining (bỏ qua kiểm phụ thuộc), /health/live vẫn 200", async () => {
    beginDrain();
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({ success: false, status: "draining" });
    expect(redis.ping).not.toHaveBeenCalled();

    const live = await request(app).get("/api/health/live");
    expect(live.status).toBe(200);
  });
});
