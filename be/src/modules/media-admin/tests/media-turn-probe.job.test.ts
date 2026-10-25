import { logger } from "../../../infrastructure/logger";
import { redis } from "../../../infrastructure/redis";
import { registry } from "../../../infrastructure/metrics/metrics.client";
import { runTurnProbe, type TurnProbeResult } from "../../../infrastructure/media/turn-probe";

type Processor = () => Promise<unknown>;
const registered = new Map<string, Processor>();
const crons: Array<Record<string, unknown>> = [];
const envState: Record<string, unknown> = {};

jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (_queue: string, name: string, fn: Processor) => registered.set(name, fn),
  defineCron: (def: Record<string, unknown>) => crons.push(def),
}));
jest.mock("../../../infrastructure/redis", () => ({ redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() } }));
jest.mock("../../../core/config", () => ({ env: envState }));
jest.mock("../../../infrastructure/media/turn-probe", () => ({ runTurnProbe: jest.fn() }));

const probe = runTurnProbe as jest.MockedFunction<typeof runTurnProbe>;
const okResult = (over: Partial<TurnProbeResult> = {}): TurnProbeResult => ({
  at: "2026-09-26T10:00:00.000Z",
  ok: true,
  udp: { ok: true, latencyMs: 20 },
  tls: { ok: true, latencyMs: 80, daysToExpiry: 30 },
  ...over,
});
const metric = async (name: string) => (await registry.getMetricsAsJSON()).find((m) => m.name === name);

beforeAll(async () => {
  await import("../media-turn-probe.job");
});
beforeEach(() => {
  for (const key of Object.keys(envState)) delete envState[key];
  Object.assign(envState, { TURN_PROBE_HOST: "turn.example.test", TURN_PROBE_TLS_PORT: 443, TURN_PROBE_UDP_PORT: 3478 });
});

describe("media.turn-probe", () => {
  it("cron TĨNH mỗi 5 phút (queue cron, không retry)", () => {
    expect(crons).toContainEqual(expect.objectContaining({ schedulerId: "media.turn-probe", queue: "cron", jobName: "media.turn-probe", pattern: "*/5 * * * *", opts: { attempts: 1 } }));
  });

  it("thiếu TURN_PROBE_HOST → không thăm dò, không ghi Redis (admin giữ UNKNOWN)", async () => {
    delete envState.TURN_PROBE_HOST;
    await registered.get("media.turn-probe")!();
    expect(probe).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("thành công → ghi media:turn-probe:last đúng định dạng admin đọc ({at, ok}) + TTL, và đặt gauge", async () => {
    probe.mockResolvedValue(okResult());
    await registered.get("media.turn-probe")!();
    expect(probe).toHaveBeenCalledWith({ host: "turn.example.test", tlsPort: 443, udpPort: 3478 });
    expect(redis.set).toHaveBeenCalledWith("media:turn-probe:last", expect.objectContaining({ at: "2026-09-26T10:00:00.000Z", ok: true }), 1800);
    const up = await metric("turn_probe_up");
    expect(up?.values).toEqual(expect.arrayContaining([expect.objectContaining({ labels: { transport: "udp" }, value: 1 }), expect.objectContaining({ labels: { transport: "tls" }, value: 1 })]));
    expect((await metric("turn_probe_cert_expiry_seconds"))?.values[0].value).toBe(30 * 86_400);
    expect((await metric("turn_probe_last_run_timestamp_seconds"))?.values[0].value).toBeGreaterThan(1_700_000_000);
  });

  it("một đường lỗi → ok=false vẫn được ghi (không ném), gauge của đường đó = 0, log cảnh báo", async () => {
    const warn = jest.spyOn(logger, "warn").mockImplementation(() => logger);
    probe.mockResolvedValue(okResult({ ok: false, error: "TLS 443: CERT_HAS_EXPIRED", tls: { ok: false, error: "CERT_HAS_EXPIRED" } }));
    await expect(registered.get("media.turn-probe")!()).resolves.toBeUndefined();
    expect(redis.set).toHaveBeenCalledWith("media:turn-probe:last", expect.objectContaining({ ok: false, error: "TLS 443: CERT_HAS_EXPIRED" }), 1800);
    const up = await metric("turn_probe_up");
    expect(up?.values).toEqual(expect.arrayContaining([expect.objectContaining({ labels: { transport: "tls" }, value: 0 })]));
    expect(warn).toHaveBeenCalledWith("[media.turn-probe] Thăm dò TURN thất bại", expect.objectContaining({ error: "TLS 443: CERT_HAS_EXPIRED" }));
  });

  it("thăm dò ném lỗi bất ngờ → vẫn ghi kết quả thất bại, job không lỗi", async () => {
    probe.mockRejectedValue(new Error("hỏng bất ngờ"));
    await expect(registered.get("media.turn-probe")!()).resolves.toBeUndefined();
    expect(redis.set).toHaveBeenCalledWith("media:turn-probe:last", expect.objectContaining({ ok: false, error: "hỏng bất ngờ" }), 1800);
  });

  it("Redis lỗi khi ghi → nuốt, không làm job lỗi", async () => {
    probe.mockResolvedValue(okResult());
    (redis.set as jest.Mock).mockRejectedValue(new Error("redis down"));
    await expect(registered.get("media.turn-probe")!()).resolves.toBeUndefined();
  });
});
