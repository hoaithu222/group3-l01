import { needsFullBackfill } from "../services/activity-refresh.service";
import { RETIMEZONE_RECOMPUTE_MAX } from "../services/contribution-timezone.service";
import type { ActivityCell } from "../entities/contribution.interface";
import { oid } from "./support/fakes";
import { createHarness, IDS, seedDone, type Harness } from "./support/harness";

/**
 * `pm.timezone` đổi (admin) ⇒ ranh giới ngày/tuần/tháng đổi. Snapshot `ALL`/`M:*` và ô heatmap ĐÃ LƯU còn theo múi giờ cũ: báo cáo/heatmap của bảng đang mở phải đúng NGAY,
 * bảng không ai mở được lượt quét đêm kéo về đúng múi giờ (lời hứa của ghi chú ở tab `pm` của admin: "đổi múi giờ làm tính lại heatmap và báo cáo theo tuần/tháng").
 */
const ICT = "Asia/Ho_Chi_Minh";
const UTC = "UTC";
// 18:00Z ngày 31/08 = 01:00 ICT ngày 01/09: tháng 9 theo ICT nhưng tháng 8 theo UTC.
const MONTH_EDGE = "2026-08-31T18:00:00Z";
// 18:00Z Chủ nhật 13/09 = 01:00 ICT thứ Hai 14/09: tuần 38 theo ICT, tuần 37 theo UTC.
const WEEK_EDGE = "2026-09-13T18:00:00Z";

const member = (r: Awaited<ReturnType<Harness["reports"]["getReport"]>>, id: string) => r.members.find((m) => m.user.id === id)!;

async function computedInIct(h: Harness): Promise<void> {
  await seedDone(h, 1, { assignees: [IDS.an], storyPoints: 3, completedAt: MONTH_EDGE });
  await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());
  await h.reports.recompute(IDS.board);
}

describe("báo cáo sau khi đổi múi giờ", () => {
  it("recompute ghi múi giờ đã dùng; múi giờ khớp → đọc snapshot, không xếp job", async () => {
    const h = createHarness();
    await computedInIct(h);
    expect((await h.states.get(IDS.board))?.snapshotTimezone).toBe(ICT);

    const sep = await h.reports.getReport(h.as(IDS.an), IDS.board, "M:2026-09");
    expect(member(sep, IDS.an).tasksDone).toBe(1);
    expect(h.queue.jobs).toHaveLength(0);
  });

  it("múi giờ đổi → KHÔNG dùng snapshot cũ: kỳ tính tại chỗ theo múi giờ mới (không chờ job) và xếp job tính lại", async () => {
    const h = createHarness();
    await computedInIct(h);
    h.config.tz = UTC;

    const sep = await h.reports.getReport(h.as(IDS.an), IDS.board, "M:2026-09");
    expect(sep.period.timezone).toBe(UTC);
    expect(member(sep, IDS.an).tasksDone).toBe(0);
    expect(sep.stale).toBe(false); // tính từ fact hiện tại nên không lệch
    const aug = await h.reports.getReport(h.as(IDS.an), IDS.board, "M:2026-08");
    expect(member(aug, IDS.an).tasksDone).toBe(1);

    expect(h.queue.jobs.length).toBeGreaterThan(0);
    expect(h.queue.jobs[0]).toMatchObject({ boardId: IDS.board, delayMs: 60_000 });
    expect(h.queue.jobs[0].jobId).toMatch(new RegExp(`^contribution\\.recompute:board:${IDS.board}:t\\d+$`));
    expect(new Set(h.queue.jobs.map((j) => j.jobId)).size).toBe(1); // cùng cửa sổ debounce → BullMQ bỏ trùng
  });

  it("job tính lại chạy với múi giờ mới → lại đọc snapshot (kể cả khi hạ tầng xếp job lỗi, việc đọc không hỏng)", async () => {
    const h = createHarness();
    await computedInIct(h);
    h.config.tz = UTC;
    h.queue.enqueueRecompute = () => Promise.reject(new Error("Redis không phản hồi"));
    const during = await h.reports.getReport(h.as(IDS.an), IDS.board, "M:2026-08");
    expect(member(during, IDS.an).tasksDone).toBe(1); // đường đọc không ném lỗi dù xếp job thất bại

    await h.reports.recompute(IDS.board);
    expect((await h.states.get(IDS.board))?.snapshotTimezone).toBe(UTC);
    await seedDone(h, 2, { assignees: [IDS.an], storyPoints: 2, completedAt: MONTH_EDGE }); // fact mới chưa bump phiên bản
    const aug = await h.reports.getReport(h.as(IDS.an), IDS.board, "M:2026-08");
    expect(member(aug, IDS.an).tasksDone).toBe(1); // đọc SNAPSHOT (tính tại chỗ sẽ thấy 2)
  });

  it("kỳ tuần: cache theo múi giờ — đổi múi giờ không trả kết quả cache của múi giờ cũ", async () => {
    const h = createHarness();
    await seedDone(h, 1, { assignees: [IDS.an], storyPoints: 3, completedAt: WEEK_EDGE });
    await h.states.bumpFactsVersion(IDS.board, IDS.ws, await h.config.defaults());

    expect(member(await h.reports.getReport(h.as(IDS.an), IDS.board, "W:2026-W38"), IDS.an).tasksDone).toBe(1);
    h.config.tz = UTC;
    expect(member(await h.reports.getReport(h.as(IDS.an), IDS.board, "W:2026-W38"), IDS.an).tasksDone).toBe(0);
    expect(member(await h.reports.getReport(h.as(IDS.an), IDS.board, "W:2026-W37"), IDS.an).tasksDone).toBe(1);
    expect(h.cache.store.size).toBe(3); // ICT·W38, UTC·W38, UTC·W37 — khoá có múi giờ
  });

  it("bảng chưa từng tính (chưa có snapshot) đổi múi giờ: không xếp job thừa", async () => {
    const h = createHarness();
    await seedDone(h, 1, { assignees: [IDS.an], storyPoints: 3, completedAt: MONTH_EDGE });
    h.config.tz = UTC;
    await h.reports.getReport(h.as(IDS.an), IDS.board, "ALL");
    expect(h.queue.jobs).toHaveLength(0);
  });
});

describe("needsFullBackfill", () => {
  const state = (activityRefreshedAt: Date | null, activityTimezone: string | null) => ({ activityRefreshedAt, activityTimezone });

  it("dựng lại đủ khi chưa có state, chưa từng làm mới, chưa ghi múi giờ, hoặc múi giờ khác; còn lại làm mới một phần", () => {
    expect(needsFullBackfill(null, ICT)).toBe(true);
    expect(needsFullBackfill(state(null, null), ICT)).toBe(true);
    expect(needsFullBackfill(state(new Date(), null), ICT)).toBe(true);
    expect(needsFullBackfill(state(new Date(), UTC), ICT)).toBe(true);
    expect(needsFullBackfill(state(new Date(), ICT), ICT)).toBe(false);
  });
});

const cell = (date: string, taskEvents = 5): ActivityCell => ({ boardId: IDS.board, workspaceId: IDS.ws, userId: IDS.an, date, taskEvents, checklistEvents: 0, commentEvents: 0, reviewEvents: 0 });

describe("heatmap sau khi đổi múi giờ", () => {
  const RANGE = { from: "2026-08-01", to: "2026-09-16" };
  const datesWithActivity = (h: Harness) => [...h.daily.rows.values()].map((r) => r.date).sort();

  it("lần dựng đầu ghi múi giờ của ô; đổi múi giờ → lần xem kế tiếp dựng lại TOÀN BỘ (dù còn trong 60 s) và dọn cả ô 'ma' nằm ngoài khoảng tính", async () => {
    const h = createHarness(new Date("2026-09-15T03:00:00Z"));
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-15", kind: "task", count: 2 }];
    await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, RANGE);
    expect((await h.states.get(IDS.board))?.activityTimezone).toBe(ICT);

    // Ô còn sót theo múi giờ cũ: trước ngày tạo bảng (01/08), giữa khoảng, và sau "hôm nay" theo múi giờ mới.
    for (const date of ["2026-07-31", "2026-08-20", "2026-09-16"]) await h.daily.replaceRange(IDS.board, IDS.ws, date, date, [cell(date)]);
    h.config.tz = UTC;
    h.clock.now = new Date(h.clock.now.getTime() + 1000);
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-14", kind: "task", count: 2 }]; // cùng hoạt động, ngày theo UTC
    const callsBefore = h.activitySource.calls;

    const res = await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, RANGE);

    expect(h.activitySource.calls).toBeGreaterThan(callsBefore);
    expect(res.timezone).toBe(UTC);
    expect(res.days.filter((d) => d.total > 0).map((d) => [d.date, d.total])).toEqual([["2026-09-14", 2]]);
    expect(datesWithActivity(h)).toEqual(["2026-09-14"]); // không còn ô nào của múi giờ cũ, kể cả ngoài khoảng
    expect((await h.states.get(IDS.board))?.activityTimezone).toBe(UTC);
  });

  it("cùng múi giờ, còn trong 60 s → không đếm lại (không dựng lại vô ích)", async () => {
    const h = createHarness();
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-15", kind: "task", count: 2 }];
    await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, RANGE);
    const calls = h.activitySource.calls;
    await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, RANGE);
    expect(h.activitySource.calls).toBe(calls);
  });

  it("làm mới MỘT PHẦN (vài ngày gần nhất) không khẳng định múi giờ mới: lần sau vẫn dựng lại đủ", async () => {
    const h = createHarness(new Date("2026-09-15T03:00:00Z"));
    await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, RANGE);
    await h.refresh.refreshBoard((await h.directory.getBoard(IDS.board))!, UTC, false);

    const state = await h.states.get(IDS.board);
    expect(state?.activityTimezone).toBe(ICT);
    expect(needsFullBackfill(state, UTC)).toBe(true);
  });

  it("heatmap nhóm: bảng có ô theo múi giờ cũ được dựng lại trước khi đọc (không lẫn hai múi giờ)", async () => {
    const h = createHarness(new Date("2026-09-15T03:00:00Z"));
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-15", kind: "task", count: 2 }];
    await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, RANGE);
    h.config.tz = UTC;
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-14", kind: "task", count: 2 }];

    const res = await h.heatmap.workspaceHeatmap(h.as(IDS.an), IDS.ws, { from: "2026-09-13", to: "2026-09-16" });

    expect(res.timezone).toBe(UTC);
    expect(res.days.map((d) => [d.date, d.total])).toEqual([["2026-09-13", 0], ["2026-09-14", 2], ["2026-09-15", 0], ["2026-09-16", 0]]);
    expect((await h.states.get(IDS.board))?.activityTimezone).toBe(UTC);
  });
});

describe("ContributionTimezoneSync — lượt quét đêm", () => {
  it("đổi múi giờ → bảng lệch được xếp tính lại + đánh dấu dựng lại heatmap; đã đúng múi giờ thì quét lại không đụng gì", async () => {
    const h = createHarness(new Date("2026-09-15T03:00:00Z"));
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-15", kind: "task", count: 2 }];
    await computedInIct(h);
    await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, { from: "2026-09-13", to: "2026-09-16" });
    expect(await h.timezoneSync.run()).toEqual({ boards: 1, recompute: 0, heatmap: 0 });

    h.config.tz = UTC;
    expect(await h.timezoneSync.run()).toEqual({ boards: 1, recompute: 1, heatmap: 1 });
    expect(h.queue.jobs).toHaveLength(1);
    expect((await h.states.get(IDS.board))?.activityDirtyAt).not.toBeNull();

    // Các job được xếp chạy: tính lại snapshot + job heatmap 15 phút.
    await h.reports.recompute(IDS.board);
    expect(await h.refresh.aggregateDirty()).toBe(1);
    const state = await h.states.get(IDS.board);
    expect([state?.snapshotTimezone, state?.activityTimezone, state?.activityDirtyAt]).toEqual([UTC, UTC, null]);
    expect(await h.timezoneSync.run()).toEqual({ boards: 1, recompute: 0, heatmap: 0 });
  });

  it("bảng chưa từng tính snapshot / chưa từng làm mới heatmap → không đụng tới (người xem đầu tiên tự lấp)", async () => {
    const h = createHarness();
    await h.states.ensure(IDS.board, IDS.ws, await h.config.defaults());
    h.config.tz = UTC;
    expect(await h.timezoneSync.run()).toEqual({ boards: 1, recompute: 0, heatmap: 0 });
    expect(h.queue.jobs).toHaveLength(0);
  });

  it("snapshot/ô lưu từ trước khi có theo dõi múi giờ (null) được coi là lệch", async () => {
    const h = createHarness();
    await h.states.ensure(IDS.board, IDS.ws, await h.config.defaults());
    const stored = h.states.states.get(IDS.board)!;
    Object.assign(stored, { computedAt: new Date(), activityRefreshedAt: new Date(), snapshotTimezone: null, activityTimezone: null });
    expect(await h.timezoneSync.run()).toEqual({ boards: 1, recompute: 1, heatmap: 1 });
  });

  it("múi giờ tính THEO TỪNG NHÓM: chỉ nhóm có múi giờ khác lúc lưu bị xử lý", async () => {
    const h = createHarness();
    const defaults = await h.config.defaults();
    const other = { board: oid(0xb2), ws: oid(0xa2) };
    for (const [boardId, wsId] of [[IDS.board, IDS.ws], [other.board, other.ws]]) {
      await h.states.ensure(boardId, wsId, defaults);
      Object.assign(h.states.states.get(boardId)!, { computedAt: new Date(), snapshotTimezone: ICT });
    }
    h.config.tzByWorkspace.set(other.ws, UTC);

    expect(await h.timezoneSync.run()).toEqual({ boards: 2, recompute: 1, heatmap: 0 });
    expect(h.queue.jobs.map((j) => j.boardId)).toEqual([other.board]);
  });

  it("nhiều trang (200/trang) và trần: duyệt hết mọi bảng, xếp tối đa RETIMEZONE_RECOMPUTE_MAX job tính lại, nhưng heatmap đánh dấu cho tất cả", async () => {
    const h = createHarness();
    const defaults = await h.config.defaults();
    const total = RETIMEZONE_RECOMPUTE_MAX + 5;
    for (let i = 0; i < total; i += 1) {
      const boardId = oid(0x10000 + i);
      await h.states.ensure(boardId, IDS.ws, defaults);
      Object.assign(h.states.states.get(boardId)!, { computedAt: new Date(), snapshotTimezone: ICT, activityRefreshedAt: new Date(), activityTimezone: ICT });
    }
    h.config.tz = UTC;

    expect(await h.timezoneSync.run()).toEqual({ boards: total, recompute: RETIMEZONE_RECOMPUTE_MAX, heatmap: total });
    expect(h.queue.jobs).toHaveLength(RETIMEZONE_RECOMPUTE_MAX);
  });
});
