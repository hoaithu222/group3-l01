import { InMemoryMediaOpsStatsReader } from "../repositories/media-ops-stats.repository.inmemory";
import { MemoryCache } from "../services/admin-media-cache";
import { AdminOverviewMediaProviderImpl } from "../services/admin-overview-media.provider";

/** KPI dashboard (p2-07 be.md §5.7): phút = floor(giây/60); "hôm nay" theo Asia/Ho_Chi_Minh; cache 60 s. */
describe("AdminOverviewMediaProviderImpl", () => {
  const NOW = new Date("2026-09-26T20:30:00Z"); // 03:30 ngày 27/9 ICT

  it("ghép số liệu, đổi giây → phút (floor) và truyền mốc hôm nay/7 ngày/24 giờ đúng cho repository", async () => {
    const reader = new InMemoryMediaOpsStatsReader();
    reader.overview = { liveMeetings: 2, callsToday: 9, callSeconds7d: 3599, recordingStorageBytes: 1_048_576, egressFailed24h: 3 };
    const spy = jest.spyOn(reader, "overviewCounts");
    const p = new AdminOverviewMediaProviderImpl(reader, new MemoryCache(() => NOW.getTime()), () => NOW);
    await expect(p.get()).resolves.toEqual({ liveMeetings: 2, callsToday: 9, callMinutes7d: 59, recordingStorageBytes: 1_048_576, egressFailed24h: 3 });
    const [dayStart, since7d, since24h] = spy.mock.calls[0] as unknown as [Date, Date, Date];
    expect(dayStart.toISOString()).toBe("2026-09-26T17:00:00.000Z"); // 00:00 ngày 27/9 ICT
    expect(since7d.toISOString()).toBe("2026-09-19T20:30:00.000Z");
    expect(since24h.toISOString()).toBe("2026-09-25T20:30:00.000Z");
  });

  it("cache 60 giây: lượt 2 không truy vấn; quá hạn thì truy vấn lại", async () => {
    const reader = new InMemoryMediaOpsStatsReader();
    let t = NOW.getTime();
    const p = new AdminOverviewMediaProviderImpl(reader, new MemoryCache(() => t), () => new Date(t));
    await p.get();
    t += 30_000;
    await p.get();
    expect(reader.queries).toBe(1);
    t += 31_000;
    await p.get();
    expect(reader.queries).toBe(2);
  });
});
