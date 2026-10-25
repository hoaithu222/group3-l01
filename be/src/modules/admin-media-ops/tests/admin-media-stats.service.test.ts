import { AppError } from "../../../core/exceptions";
import { InMemoryMediaOpsStatsReader, type SeedStatCall, type SeedStatParticipant } from "../repositories/media-ops-stats.repository.inmemory";
import { MemoryCache } from "../services/admin-media-cache";
import { AdminMediaStatsService, dayKeysBetween } from "../services/admin-media-stats.service";

/**
 * OPC-06 (p2-07 be.md §10): seed 50 cuộc gọi (30 RING, 20 ROOM) + participant → `answerRate`, `setupSuccessRate`, phút, thời lượng TB, lấp ngày trống, gom theo MÚI GIỜ;
 * khoảng > 92 ngày / `to ≤ from` / múi giờ lạ → `ADMIN_MEDIA_001`; cache trúng thì không truy vấn lại.
 */
const TZ = "Asia/Ho_Chi_Minh";
const FROM = new Date("2026-09-09T17:00:00Z"); // 00:00 ngày 10/9 ICT
const TO = new Date("2026-09-12T17:00:00Z"); // 00:00 ngày 13/9 ICT → 3 ngày: 10, 11, 12
const at = (iso: string) => new Date(iso);

function seed(reader: InMemoryMediaOpsStatsReader): void {
  reader.workspaces.add("w1");
  const calls: SeedStatCall[] = [];
  // 30 RING: 24 có người trả lời (120 s), 6 không (NO_ANSWER, không thời lượng). 5 cuộc trả lời rơi vào 10/9 ICT, 19 vào 11/9 ICT (một phần lúc 01:00 ICT = 18:00Z ngày 10/9 UTC).
  for (let i = 0; i < 24; i += 1) {
    const startedAt = i < 5 ? at("2026-09-10T03:00:00Z") : i < 10 ? at("2026-09-10T18:00:00Z") : at("2026-09-11T05:00:00Z");
    calls.push({ workspaceId: i % 2 === 0 ? "w1" : null, mode: "RING", startedAt, answeredAt: new Date(startedAt.getTime() + 5000), durationSec: 120, status: "ENDED", endReason: "COMPLETED" });
  }
  for (let i = 0; i < 6; i += 1) calls.push({ workspaceId: null, mode: "RING", startedAt: at("2026-09-11T06:00:00Z"), answeredAt: null, durationSec: null, status: "ENDED", endReason: "NO_ANSWER" });
  // 20 ROOM: 600 s, 2 cuộc bị admin kết thúc cưỡng bức.
  for (let i = 0; i < 20; i += 1) calls.push({ workspaceId: "w1", mode: "ROOM", startedAt: at("2026-09-11T08:00:00Z"), durationSec: 600, status: "ENDED", endReason: i < 2 ? "FORCE_ENDED" : "EMPTY" });
  reader.calls = calls;

  const participants: SeedStatParticipant[] = [];
  const p = (joinedAfterMs: number | null, day = "2026-09-11T05:00:00Z"): SeedStatParticipant => {
    const joiningAt = new Date(day);
    return { workspaceId: "w1", callStartedAt: joiningAt, joiningAt, firstJoinedAt: joinedAfterMs === null ? null : new Date(joiningAt.getTime() + joinedAfterMs) };
  };
  for (let i = 0; i < 36; i += 1) participants.push(p(3000)); // thành công ≤ 20 s
  participants.push(p(25_000), p(25_000)); // quá 20 s
  participants.push(p(null), p(null)); // không bao giờ vào
  participants.push({ workspaceId: "w1", callStartedAt: at("2026-09-11T05:00:00Z"), joiningAt: null, firstJoinedAt: null }); // chưa có JOINING → không tính vào mẫu số
  reader.participants = participants;
}

const build = () => {
  const reader = new InMemoryMediaOpsStatsReader();
  seed(reader);
  const clock = { t: at("2026-09-12T10:00:00Z").getTime() };
  const svc = new AdminMediaStatsService(reader, new MemoryCache(() => clock.t), () => new Date(clock.t));
  return { reader, svc, clock };
};

const errorCode = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err.errorCode;
  }
  return "NONE";
};

describe("AdminMediaStatsService.callStats (OPC-06)", () => {
  it("tính đúng tổng: số cuộc, RING/ROOM, phút, answerRate, setupSuccessRate, thời lượng TB", async () => {
    const { svc } = build();
    const s = await svc.callStats({ from: FROM, to: TO, tz: TZ });
    expect(s.totals).toEqual({
      calls: 50,
      ringCalls: 30,
      roomCalls: 20,
      minutes: 248, // floor((24×120 + 20×600) / 60) = floor(14 880 / 60)
      answerRate: 0.8, // 24 / 30
      setupSuccessRate: 0.9, // 36 / 40 (dòng không có JOINING không vào mẫu số)
      avgDurationSec: 338, // 14 880 / 44 cuộc có thời lượng
    });
    expect(s.range).toEqual({ from: FROM.toISOString(), to: TO.toISOString(), tz: TZ });
  });

  it("gom theo NGÀY của múi giờ (18:00Z ngày 10/9 = 01:00 ngày 11/9 ICT) và lấp 0 cho ngày trống", async () => {
    const { svc } = build();
    const s = await svc.callStats({ from: FROM, to: TO, tz: TZ });
    expect(s.byDay.map((d) => d.date)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
    expect(s.byDay[0]).toEqual({ date: "2026-09-10", calls: 5, minutes: 10, answerRate: 1, setupSuccessRate: null, avgDurationSec: 120 });
    expect(s.byDay[1]).toMatchObject({ date: "2026-09-11", calls: 45, minutes: 238, setupSuccessRate: 0.9 });
    expect(s.byDay[2]).toEqual({ date: "2026-09-12", calls: 0, minutes: 0, answerRate: null, setupSuccessRate: null, avgDurationSec: null });
    // Cùng dữ liệu tính theo UTC: 10/9 chứa cả các cuộc lúc 18:00Z ⇒ phân ngày KHÁC.
    const utc = await svc.callStats({ from: new Date("2026-09-10T00:00:00Z"), to: new Date("2026-09-13T00:00:00Z"), tz: "UTC" });
    expect(utc.byDay[0]?.calls).toBe(10);
  });

  it("byEndReason: chỉ cuộc ĐÃ kết thúc, sắp giảm dần theo số lượng", async () => {
    const { svc } = build();
    const s = await svc.callStats({ from: FROM, to: TO, tz: TZ });
    expect(s.byEndReason).toEqual([
      { reason: "COMPLETED", count: 24 },
      { reason: "EMPTY", count: 18 },
      { reason: "NO_ANSWER", count: 6 },
      { reason: "FORCE_ENDED", count: 2 },
    ]);
  });

  it("lọc theo workspace: chỉ tính cuộc và participant của nhóm đó", async () => {
    const { svc } = build();
    const s = await svc.callStats({ from: FROM, to: TO, tz: TZ, workspaceId: "w1" });
    expect(s.totals.calls).toBe(12 + 20);
    expect(s.totals.ringCalls).toBe(12);
  });

  it("mẫu số 0 → null (UI hiện '—'), không NaN/Infinity", async () => {
    const reader = new InMemoryMediaOpsStatsReader();
    const svc = new AdminMediaStatsService(reader, new MemoryCache());
    const s = await svc.callStats({ from: FROM, to: TO, tz: TZ });
    expect(s.totals).toEqual({ calls: 0, ringCalls: 0, roomCalls: 0, minutes: 0, answerRate: null, setupSuccessRate: null, avgDurationSec: null });
    expect(s.byDay).toHaveLength(3);
  });

  it("khoảng 93 ngày, to ≤ from, múi giờ lạ → ADMIN_MEDIA_001 (400); đúng 92 ngày thì hợp lệ", async () => {
    const { svc } = build();
    const day = 86_400_000;
    expect(await errorCode(svc.callStats({ from: FROM, to: new Date(FROM.getTime() + 93 * day), tz: TZ }))).toBe("ADMIN_MEDIA_001");
    expect(await errorCode(svc.callStats({ from: FROM, to: FROM, tz: TZ }))).toBe("ADMIN_MEDIA_001");
    expect(await errorCode(svc.callStats({ from: TO, to: FROM, tz: TZ }))).toBe("ADMIN_MEDIA_001");
    expect(await errorCode(svc.callStats({ from: FROM, to: TO, tz: "Mars/Olympus" }))).toBe("ADMIN_MEDIA_001");
    expect(await errorCode(svc.callStats({ from: FROM, to: new Date(FROM.getTime() + 92 * day), tz: TZ }))).toBe("NONE");
  });

  it("cache trúng (cùng tham số) → không truy vấn lại, serverNow cập nhật; đổi tham số → truy vấn mới; hết hạn → truy vấn lại", async () => {
    const { reader, svc, clock } = build();
    const first = await svc.callStats({ from: FROM, to: TO, tz: TZ });
    const queries = reader.queries;
    clock.t += 60_000;
    const second = await svc.callStats({ from: FROM, to: TO, tz: TZ });
    expect(reader.queries).toBe(queries);
    expect(second.totals).toEqual(first.totals);
    expect(second.serverNow).not.toBe(first.serverNow);
    await svc.callStats({ from: FROM, to: TO, tz: TZ, workspaceId: "w1" });
    expect(reader.queries).toBeGreaterThan(queries);
    const before = reader.queries;
    clock.t += 5 * 60_000; // > statsCacheSeconds (300 s)
    await svc.callStats({ from: FROM, to: TO, tz: TZ });
    expect(reader.queries).toBeGreaterThan(before);
  });
});

describe("AdminMediaStatsService.workspaceStats (OPC-12)", () => {
  it("chỉ số lượng/thời lượng; workspace không tồn tại → 404", async () => {
    const { reader, svc } = build();
    reader.wsStats = { meetings: { scheduled: 2, held: 5, cancelled: 1, totalMinutes: 300 }, calls: { total: 9, ring: 6, room: 3, minutes: 40 }, recordings: { ready: 4, storageBytes: 1024 } };
    const s = await svc.workspaceStats("w1", 30);
    expect(s).toEqual({ days: 30, ...reader.wsStats });
    expect(Object.keys(s).sort()).toEqual(["calls", "days", "meetings", "recordings"]);
    await expect(svc.workspaceStats("khong-co", 30)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("dayKeysBetween", () => {
  it("ngày cuối là ngày của (to − 1 ms) — to đúng nửa đêm không kéo thêm một ngày", () => {
    expect(dayKeysBetween(FROM, TO, TZ)).toEqual(["2026-09-10", "2026-09-11", "2026-09-12"]);
    expect(dayKeysBetween(new Date("2026-09-10T05:00:00Z"), new Date("2026-09-10T06:00:00Z"), TZ)).toEqual(["2026-09-10"]);
  });
});
