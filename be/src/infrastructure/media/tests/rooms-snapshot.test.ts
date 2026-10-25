import { redis } from "../../redis";
import { livekitRoomsActive, registry } from "../../metrics";
import { metricsHandler } from "../../metrics/metrics.route";
import { InMemoryMediaServer } from "../in-memory-media-server";
import { captureRoomsSnapshot, MEDIA_ROOMS_ACTIVE_KEY, readRoomsSnapshot, ROOMS_SNAPSHOT_TTL_SECONDS } from "../rooms-snapshot";
import type { Request, Response } from "express";

jest.mock("../../redis", () => ({ redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), ping: jest.fn() } }));
jest.mock("../../queue", () => ({
  QUEUE_NAMES: [],
  getQueue: jest.fn(),
}));

const redisSet = redis.set as jest.Mock;
const redisGet = redis.get as jest.Mock;
const gauge = async () => (await livekitRoomsActive.get()).values[0]?.value;

describe("captureRoomsSnapshot", () => {
  it("đếm phòng + người, đặt gauge livekit_rooms_active, ghi Redis media:rooms:active (TTL 90 s)", async () => {
    const server = new InMemoryMediaServer();
    server.join("call_a", { identity: "u1" });
    server.join("call_a", { identity: "u2" });
    server.join("meet_b", { identity: "u3" });

    const snapshot = await captureRoomsSnapshot(server);

    expect(snapshot).toMatchObject({ rooms: 2, participants: 3 });
    expect(await gauge()).toBe(2);
    expect(redisSet).toHaveBeenCalledWith(MEDIA_ROOMS_ACTIVE_KEY, snapshot, ROOMS_SNAPSHOT_TTL_SECONDS);
    expect(MEDIA_ROOMS_ACTIVE_KEY).toBe("media:rooms:active");
    expect(ROOMS_SNAPSHOT_TTL_SECONDS).toBe(90);
  });

  it("Redis lỗi không làm hỏng lượt chụp (gauge vẫn đặt)", async () => {
    redisSet.mockRejectedValue(new Error("redis down"));
    await expect(captureRoomsSnapshot(new InMemoryMediaServer())).resolves.toMatchObject({ rooms: 0 });
    expect(await gauge()).toBe(0);
  });

  it("LiveKit lỗi → ném (job bắt và log, lượt sau thử lại)", async () => {
    const server = new InMemoryMediaServer();
    server.failNext("listRooms");
    await expect(captureRoomsSnapshot(server)).rejects.toMatchObject({ errorCode: "MEDIA_003" });
  });
});

describe("readRoomsSnapshot", () => {
  it("trả ảnh chụp hợp lệ; thiếu/hỏng/Redis lỗi → null", async () => {
    redisGet.mockResolvedValue({ rooms: 4, participants: 9, at: "2026-09-21T00:00:00.000Z" });
    await expect(readRoomsSnapshot()).resolves.toEqual({ rooms: 4, participants: 9, at: "2026-09-21T00:00:00.000Z" });
    redisGet.mockResolvedValue(null);
    await expect(readRoomsSnapshot()).resolves.toBeNull();
    redisGet.mockResolvedValue("rác");
    await expect(readRoomsSnapshot()).resolves.toBeNull();
    redisGet.mockRejectedValue(new Error("down"));
    await expect(readRoomsSnapshot()).resolves.toBeNull();
  });
});

describe("/metrics — tên chuẩn p0-08", () => {
  const req = { ip: "127.0.0.1", header: jest.fn() } as unknown as Request;
  const scrape = async (): Promise<string> => {
    let text = "";
    const res = { setHeader: jest.fn(), send: (t: string) => { text = t; }, status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    await metricsHandler(req, res);
    return text;
  };

  it("phơi bày livekit_rooms_active, livekit_webhook_total, livekit_webhook_process_seconds, livekit_api_errors_total", async () => {
    const text = await scrape();
    for (const name of ["livekit_rooms_active", "livekit_webhook_total", "livekit_webhook_process_seconds", "livekit_api_errors_total"]) {
      expect(text).toContain(`# TYPE ${name} `);
    }
    expect(registry.getSingleMetric("livekit_webhook_total")).toBeDefined();
  });

  it("scrape nạp lại livekit_rooms_active từ ảnh chụp Redis của worker (API và worker là tiến trình khác nhau)", async () => {
    livekitRoomsActive.set(0);
    redisGet.mockResolvedValue({ rooms: 7, participants: 20, at: "2026-09-21T00:00:00.000Z" });
    expect(await scrape()).toMatch(/^livekit_rooms_active 7$/m);
  });
});
