import { logger } from "../../../infrastructure/logger";
import { InMemoryMediaServer, NoopMediaServer, setMediaServerForTests } from "../../../infrastructure/media";
import { redis } from "../../../infrastructure/redis";
import { runtimeConfig } from "../../../core/config/runtime-config";

type Processor = () => Promise<unknown>;
const registered = new Map<string, Processor>();
const crons: Array<Record<string, unknown>> = [];

jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (_queue: string, name: string, fn: Processor) => registered.set(name, fn),
  defineCron: (def: Record<string, unknown>) => crons.push(def),
}));
jest.mock("../../../infrastructure/redis", () => ({ redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }));
jest.mock("../../../core/config/runtime-config", () => ({ runtimeConfig: { isFeatureEnabled: jest.fn() } }));

const flags = (on: Record<string, boolean>) => (runtimeConfig.isFeatureEnabled as jest.Mock).mockImplementation((m: string) => Promise.resolve(on[m] ?? false));

beforeAll(async () => {
  await import("../media-rooms-snapshot.job");
});
afterEach(() => setMediaServerForTests(null));

describe("media.rooms-snapshot", () => {
  it("cron mỗi 30 s (6 trường, có giây), queue cron, không retry", () => {
    expect(crons).toContainEqual(expect.objectContaining({ schedulerId: "media.rooms-snapshot", queue: "cron", pattern: "*/30 * * * * *", opts: { attempts: 1 } }));
  });

  it("voice/meeting TẮT → không gọi LiveKit, không ghi Redis", async () => {
    const server = new InMemoryMediaServer();
    setMediaServerForTests(server);
    flags({});
    await registered.get("media.rooms-snapshot")!();
    expect(server.callsOf("listRooms")).toHaveLength(0);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("chưa cấu hình LiveKit → bỏ qua", async () => {
    setMediaServerForTests(new NoopMediaServer());
    flags({ voice: true });
    await expect(registered.get("media.rooms-snapshot")!()).resolves.toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("voice BẬT + LiveKit cấu hình → ghi snapshot", async () => {
    const server = new InMemoryMediaServer();
    server.join("call_a", { identity: "u1" });
    setMediaServerForTests(server);
    flags({ voice: true });
    await registered.get("media.rooms-snapshot")!();
    expect(redis.set).toHaveBeenCalledWith("media:rooms:active", expect.objectContaining({ rooms: 1, participants: 1 }), 90);
  });

  it("LiveKit lỗi → nuốt (không ném, không làm job lỗi)", async () => {
    const server = new InMemoryMediaServer();
    server.failNext("listRooms");
    setMediaServerForTests(server);
    flags({ meeting: true });
    await expect(registered.get("media.rooms-snapshot")!()).resolves.toBeUndefined();
  });

  it("LiveKit tắt liên tục → cảnh báo 1 lần / 5 phút (kèm suppressed); hồi phục → báo info đúng 1 lần", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => logger);
    const info = jest.spyOn(logger, "info").mockImplementation(() => logger);
    const failures = () => (warn.mock.calls as unknown[][]).filter(([message]) => message === "[media.rooms-snapshot] Không lấy được danh sách phòng");
    const recovered = () => (info.mock.calls as unknown[][]).filter(([message]) => message === "[media.rooms-snapshot] Đã lấy lại được danh sách phòng");
    const t0 = Date.now() + 10 * 60_000;
    const now = jest.spyOn(Date, "now");
    const server = new InMemoryMediaServer();
    setMediaServerForTests(server);
    flags({ voice: true });
    const run = async (offsetMs: number, fails: boolean) => {
      now.mockReturnValue(t0 + offsetMs);
      if (fails) server.failNext("listRooms");
      await registered.get("media.rooms-snapshot")!();
    };

    await run(0, true);
    await run(30_000, true);
    await run(60_000, true);
    expect(failures()).toHaveLength(1);
    expect(failures()[0]?.[1]).not.toHaveProperty("suppressed");
    expect(recovered()).toHaveLength(0);

    await run(5 * 60_000, true);
    expect(failures()).toHaveLength(2);
    expect(failures()[1]?.[1]).toMatchObject({ suppressed: 2 });

    await run(5 * 60_000 + 30_000, false);
    await run(5 * 60_000 + 60_000, false);
    expect(recovered()).toHaveLength(1);

    // Sau hồi phục, lỗi mới được ghi ngay dù chưa qua 5 phút.
    await run(5 * 60_000 + 90_000, true);
    expect(failures()).toHaveLength(3);
    expect(failures()[2]?.[1]).not.toHaveProperty("suppressed");
  });
});
