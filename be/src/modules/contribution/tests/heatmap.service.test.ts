import type { ActivityDayRow } from "../repositories/activity-daily.repository.interface";
import { toCells } from "../services/activity-refresh.service";
import { assertHeatmapRange, foldDays } from "../services/heatmap.service";
import { createHarness, IDS } from "./support/harness";
import { oid } from "./support/fakes";

const row = (date: string, userId: string, over: Partial<ActivityDayRow> = {}): ActivityDayRow => ({
  boardId: IDS.board,
  userId,
  date,
  taskEvents: 0,
  checklistEvents: 0,
  commentEvents: 0,
  reviewEvents: 0,
  total: 0,
  ...over,
});

describe("heatmap thuần — gộp ô, điền ngày trống, giới hạn khoảng", () => {
  it("foldDays trả đủ MỌI ngày trong khoảng (ngày không có bản ghi = 0), chỉ ngày + số đếm", () => {
    const rows = [row("2026-09-15", "a", { taskEvents: 4, commentEvents: 2, checklistEvents: 1, total: 7 }), row("2026-09-15", "b", { reviewEvents: 1, total: 1 })];
    const { days, maxTotal } = foldDays(rows, "2026-09-14", "2026-09-16");
    expect(days).toEqual([
      { date: "2026-09-14", total: 0, task: 0, checklist: 0, comment: 0, review: 0 },
      { date: "2026-09-15", total: 8, task: 4, checklist: 1, comment: 2, review: 1 },
      { date: "2026-09-16", total: 0, task: 0, checklist: 0, comment: 0, review: 0 },
    ]);
    expect(maxTotal).toBe(8);
    expect(Object.keys(days[1]).sort()).toEqual(["checklist", "comment", "date", "review", "task", "total"]); // không có giờ, không có id
  });

  it("assertHeatmapRange: 366 ngày (chênh 365) hợp lệ, 400 ngày và from > to → CONTRIB_004", () => {
    expect(() => assertHeatmapRange("2025-09-16", "2026-09-15")).not.toThrow();
    expect(() => assertHeatmapRange("2025-08-11", "2026-09-15")).toThrow(expect.objectContaining({ errorCode: "CONTRIB_004", statusCode: 400 }));
    expect(() => assertHeatmapRange("2026-09-16", "2026-09-15")).toThrow(expect.objectContaining({ errorCode: "CONTRIB_004" }));
  });

  it("toCells gộp bốn loại nguồn theo (người, ngày)", () => {
    const cells = toCells({ id: IDS.board, workspaceId: IDS.ws }, [
      { userId: "a", date: "2026-09-15", kind: "task", count: 3 },
      { userId: "a", date: "2026-09-15", kind: "checklist", count: 2 },
      { userId: "a", date: "2026-09-15", kind: "comment", count: 1 },
      { userId: "a", date: "2026-09-16", kind: "review", count: 4 },
    ]);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ userId: "a", date: "2026-09-15", taskEvents: 3, checklistEvents: 2, commentEvents: 1, reviewEvents: 0 });
    expect(cells[1]).toMatchObject({ date: "2026-09-16", reviewEvents: 4 });
  });
});

describe("HeatmapService + ActivityRefreshService (PM2-35, phần không cần Mongo)", () => {
  it("lần đầu một bảng được xem → lấp lịch sử từ ngày tạo bảng; ngày 23:30 giờ VN được đếm đúng ngày VN", async () => {
    const h = createHarness(new Date("2026-09-15T03:00:00Z")); // 10:00 ICT ngày 15/09
    h.activitySource.task = [
      { userId: IDS.an, date: "2026-09-14", kind: "task", count: 2 }, // hoạt động 23:30 ICT ngày 14/09 = 16:30Z
      { userId: IDS.an, date: "2026-09-15", kind: "checklist", count: 1 },
    ];
    h.activitySource.comments = [{ userId: IDS.binh, date: "2026-09-15", kind: "comment", count: 3 }];
    const res = await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, { from: "2026-09-13", to: "2026-09-16" });
    expect(res).toMatchObject({ timezone: "Asia/Ho_Chi_Minh", from: "2026-09-13", to: "2026-09-16", maxTotal: 4 });
    expect(res.days.map((d) => [d.date, d.total])).toEqual([["2026-09-13", 0], ["2026-09-14", 2], ["2026-09-15", 4], ["2026-09-16", 0]]);
    expect(res.userId).toBeUndefined();
    expect((await h.states.get(IDS.board))?.activityRefreshedAt).not.toBeNull();
  });

  it("lọc theo người; người lạ → 404; khoảng quá dài → CONTRIB_004; khách/người ngoài → 404", async () => {
    const h = createHarness();
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-15", kind: "task", count: 2 }, { userId: IDS.binh, date: "2026-09-15", kind: "task", count: 5 }];
    const mine = await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, { userId: IDS.an, from: "2026-09-15", to: "2026-09-15" });
    expect(mine.userId).toBe(IDS.an);
    expect(mine.days[0].total).toBe(2);
    await expect(h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, { userId: oid(0x999), from: "2026-09-15", to: "2026-09-15" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, { from: "2025-08-01", to: "2026-09-15" })).rejects.toMatchObject({ errorCode: "CONTRIB_004" });
    await expect(h.heatmap.boardHeatmap(h.as(IDS.outsider), IDS.board, { from: "2026-09-15", to: "2026-09-15" })).rejects.toMatchObject({ statusCode: 404 });
    await expect(h.heatmap.workspaceHeatmap(h.as(IDS.outsider), IDS.ws, { from: "2026-09-15", to: "2026-09-15" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("làm mới bị giới hạn tần suất (60 s) và chạy lại cùng dữ liệu cho cùng kết quả (idempotent)", async () => {
    const h = createHarness();
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-15", kind: "task", count: 2 }];
    const q = { from: "2026-09-15", to: "2026-09-15" };
    const first = await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, q);
    const callsAfterFirst = h.activitySource.calls;
    await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, q);
    expect(h.activitySource.calls).toBe(callsAfterFirst); // còn tươi → không đếm lại
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    const again = await h.heatmap.boardHeatmap(h.as(IDS.an), IDS.board, q);
    expect(h.activitySource.calls).toBeGreaterThan(callsAfterFirst);
    expect(again.days).toEqual(first.days);
  });

  it("job 15 phút: xử lý bảng bẩn, xoá cờ; ô không còn hoạt động (bình luận bị xoá) bị dọn", async () => {
    const h = createHarness();
    await h.states.markActivityDirty(IDS.board, IDS.ws, await h.config.defaults(), new Date("2026-09-15T02:59:00Z"));
    h.activitySource.comments = [{ userId: IDS.an, date: "2026-09-15", kind: "comment", count: 2 }];
    expect(await h.refresh.aggregateDirty()).toBe(1);
    expect((await h.states.get(IDS.board))?.activityDirtyAt).toBeNull();
    expect(h.daily.rows.size).toBe(1);
    // Lần sau nguồn không còn bình luận → ô bị xoá.
    await h.states.markActivityDirty(IDS.board, IDS.ws, await h.config.defaults(), new Date("2026-09-15T03:10:00Z"));
    h.activitySource.comments = [];
    await h.refresh.aggregateDirty();
    expect(h.daily.rows.size).toBe(0);
  });

  it("heatmap nhóm gộp mọi bảng; bảng bẩn được tính ngay trước khi đọc", async () => {
    const h = createHarness();
    await h.states.markActivityDirty(IDS.board, IDS.ws, await h.config.defaults(), new Date());
    h.activitySource.task = [{ userId: IDS.an, date: "2026-09-15", kind: "task", count: 6 }];
    const res = await h.heatmap.workspaceHeatmap(h.as(IDS.an), IDS.ws, { from: "2026-09-15", to: "2026-09-15" });
    expect(res.days[0].total).toBe(6);
    expect((await h.states.get(IDS.board))?.activityDirtyAt).toBeNull();
  });
});
