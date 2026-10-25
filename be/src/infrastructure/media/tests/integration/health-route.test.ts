/**
 * Integration — `GET /api/health` với LiveKit (MED-09, p0-08 be.md §5.5): `services.livekit` + quy tắc
 * "down chỉ làm health tổng 503 khi voice/meeting bật". Router THẬT (mọi module), DB thật (Mongo memory,
 * `TEST_DB=memory`); Redis + hàng đợi là đồ giả (không có Redis sống).
 */
import { setLiveKitEnv } from "../livekit-test-utils";

setLiveKitEnv();

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
import { InMemoryMediaServer } from "../../in-memory-media-server";
import { setMediaServerForTests } from "../../livekit.client";
import { NoopMediaServer } from "../../noop-media-server";
import { resetLiveKitHealthCache } from "../../livekit.health";

const describeDb = process.env.TEST_DB === "memory" ? describe : describe.skip;

describeDb("GET /api/health (LiveKit)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const routes = (require("../../../../router") as typeof import("../../../../router")).default;
  const app = express();
  app.use("/api", routes);

  const flags = (on: Record<string, boolean>) => (runtimeConfig.isFeatureEnabled as jest.Mock).mockImplementation((m: string) => Promise.resolve(on[m] ?? false));

  beforeEach(() => {
    resetLiveKitHealthCache();
    (redis.ping as jest.Mock).mockResolvedValue(true);
    (getQueue as jest.Mock).mockReturnValue({ getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, failed: 0 }) });
    flags({});
  });
  afterAll(() => setMediaServerForTests(null));

  const downServer = () => {
    const server = new InMemoryMediaServer();
    server.failNext("ping");
    setMediaServerForTests(server);
  };

  it("LiveKit chưa cấu hình → services.livekit = disabled, health 200", async () => {
    setMediaServerForTests(new NoopMediaServer());
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.services.livekit).toBe("disabled");
  });

  it("LiveKit khoẻ → ok, health 200", async () => {
    setMediaServerForTests(new InMemoryMediaServer());
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.services.livekit).toBe("ok");
  });

  it("MED-09: LiveKit down + voice/meeting TẮT → services.livekit = down nhưng HTTP vẫn 200", async () => {
    downServer();
    const res = await request(app).get("/api/health");
    expect(res.body.services.livekit).toBe("down");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it.each(["voice", "meeting"])("MED-09: LiveKit down + %s BẬT → health 503", async (module) => {
    flags({ [module]: true });
    downServer();
    const res = await request(app).get("/api/health");
    expect(res.body.services.livekit).toBe("down");
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});
