import { runtimeConfig } from "../../../core/config/runtime-config";
import { FEATURE_FLAGS, MODULES } from "../../../core/constants/modules";
import { InMemoryMediaServer } from "../in-memory-media-server";
import { checkLiveKit, isMediaRequired, LIVEKIT_HEALTH_TIMEOUT_MS, resetLiveKitHealthCache } from "../livekit.health";
import { NoopMediaServer } from "../noop-media-server";
import type { IMediaServer } from "../media.types";

jest.mock("../../../core/config/runtime-config", () => ({
  runtimeConfig: { isFeatureEnabled: jest.fn() },
}));
// `FEATURE_FLAGS` (cờ env) là hằng đọc từ `process.env` lúc import — thay bằng bản tắt hết, CHỈNH ĐƯỢC trong từng ca, để nhánh "rơi về cờ env"
// không phụ thuộc `FEATURE_FLAGS` trong `be/.env` của người chạy.
jest.mock("../../../core/constants/modules", () => {
  const actual = jest.requireActual("../../../core/constants/modules");
  return { ...actual, FEATURE_FLAGS: { ...actual.DEFAULT_FEATURE_FLAGS } };
});
const envFlags = FEATURE_FLAGS as Record<string, boolean>;
const isFeatureEnabled = runtimeConfig.isFeatureEnabled as jest.Mock;

/** Bật/tắt cờ theo tên phân hệ. */
const flags = (on: Record<string, boolean>) => isFeatureEnabled.mockImplementation((m: string) => Promise.resolve(on[m] ?? false));

beforeEach(() => {
  resetLiveKitHealthCache();
  flags({});
});

describe("checkLiveKit (MED-09)", () => {
  it("chưa cấu hình → disabled, không bao giờ fatal", async () => {
    flags({ voice: true });
    await expect(checkLiveKit(new NoopMediaServer())).resolves.toEqual({ status: "disabled", latencyMs: null, fatal: false });
  });

  it("phản hồi nhanh (< 500 ms) → ok", async () => {
    await expect(checkLiveKit(new InMemoryMediaServer())).resolves.toEqual({ status: "ok", latencyMs: 0, fatal: false });
  });

  it("phản hồi chậm (≥ 500 ms) → degraded, không fatal", async () => {
    const slow: IMediaServer = Object.assign(new InMemoryMediaServer(), { ping: () => Promise.resolve({ latencyMs: 800, rooms: 0 }) });
    flags({ voice: true });
    await expect(checkLiveKit(slow)).resolves.toEqual({ status: "degraded", latencyMs: 800, fatal: false });
  });

  it("LiveKit sập + voice/meeting TẮT → down nhưng KHÔNG fatal (health tổng vẫn 200)", async () => {
    const server = new InMemoryMediaServer();
    server.failNext("ping");
    await expect(checkLiveKit(server)).resolves.toEqual({ status: "down", latencyMs: null, fatal: false });
  });

  it.each(["voice", "meeting"])("LiveKit sập + %s BẬT → fatal (health 503)", async (module) => {
    const server = new InMemoryMediaServer();
    server.failNext("ping");
    flags({ [module]: true });
    await expect(checkLiveKit(server)).resolves.toEqual({ status: "down", latencyMs: null, fatal: true });
  });

  it("ping với hạn 2 s", async () => {
    const server = new InMemoryMediaServer();
    await checkLiveKit(server);
    expect(server.callsOf("ping")[0]?.args).toEqual([]);
    expect(LIVEKIT_HEALTH_TIMEOUT_MS).toBe(2000);
    const spy = jest.spyOn(server, "ping");
    resetLiveKitHealthCache();
    await checkLiveKit(server);
    expect(spy).toHaveBeenCalledWith(2000);
  });

  it("kết quả ping được nhớ 5 s — /api/health gọi dồn dập không dội LiveKit", async () => {
    const server = new InMemoryMediaServer();
    await checkLiveKit(server);
    await checkLiveKit(server);
    await checkLiveKit(server);
    expect(server.callsOf("ping")).toHaveLength(1);
  });

  it("sau khi hết hạn nhớ (5 s) → ping lại và phản ánh trạng thái mới", async () => {
    const server = new InMemoryMediaServer();
    const t0 = Date.now();
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(t0);
    await expect(checkLiveKit(server)).resolves.toMatchObject({ status: "ok" });
    server.failNext("ping");
    now.mockReturnValue(t0 + 6000);
    await expect(checkLiveKit(server)).resolves.toMatchObject({ status: "down" });
  });
});

describe("isMediaRequired", () => {
  it("bật khi voice hoặc meeting bật (runtime)", async () => {
    flags({ meeting: true });
    await expect(isMediaRequired()).resolves.toBe(true);
    flags({});
    await expect(isMediaRequired()).resolves.toBe(false);
  });

  describe("lỗi đọc cấu hình → rơi về cờ env, không ném", () => {
    afterEach(() => {
      envFlags[MODULES.VOICE] = false;
      envFlags[MODULES.MEETING] = false;
    });

    it("cờ env voice/meeting mặc định tắt → false", async () => {
      isFeatureEnabled.mockRejectedValue(new Error("redis down"));
      await expect(isMediaRequired()).resolves.toBe(false);
    });

    it.each([MODULES.VOICE, MODULES.MEETING])("cờ env %s bật → true", async (module) => {
      isFeatureEnabled.mockRejectedValue(new Error("redis down"));
      envFlags[module] = true;
      await expect(isMediaRequired()).resolves.toBe(true);
    });
  });
});
