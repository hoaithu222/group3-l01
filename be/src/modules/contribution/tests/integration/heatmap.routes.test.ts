import { installMocks, redisStore } from "./contribution-test-mocks";
import { buildRig, cleanupGroups, ensureContributionIndexes, makeApi, seedGroup, seedTask, tokenFor, type Group } from "./contribution-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

// "Bây giờ" cố định: 15/09/2026 10:00 giờ Việt Nam (03:00Z) — đồng hồ của cả container để job/làm mới không phụ thuộc giờ chạy test.
const NOW = new Date("2026-09-15T03:00:00Z");
const rig = buildRig({ now: () => NOW });
const api = makeApi(rig.app);
const c = rig.container;

describe("contribution — heatmap hoạt động (PM2-35, Mongo memory replset)", () => {
  const groups: Group[] = [];
  const setup = async () => {
    const g = await seedGroup({ A: "OWNER", C: "MEMBER", D: "MEMBER", G: "GUEST" });
    groups.push(g);
    return g;
  };

  beforeAll(async () => {
    await ensureContributionIndexes();
  });
  beforeEach(() => installMocks());
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const activity = (g: Group, over: { at: string; actor: string | null; type?: string; taskId?: string; boardId?: string }) =>
    prisma.taskActivity.create({
      data: {
        taskId: over.taskId ?? newObjectId(),
        boardId: over.boardId ?? g.boardId,
        workspaceId: g.workspaceId,
        actorId: over.actor,
        type: over.type ?? "MOVED",
        groupKey: null,
        at: new Date(over.at),
      },
    });
  const comment = (g: Group, authorId: string, createdAt: string, deletedAt: string | null = null) =>
    prisma.taskComment.create({
      data: {
        taskId: newObjectId(),
        boardId: g.boardId,
        workspaceId: g.workspaceId,
        authorId,
        clientCommentId: newObjectId(),
        content: "Bình luận riêng tư về đồ án",
        mentions: [],
        deletedAt: deletedAt ? new Date(deletedAt) : null,
        createdAt: new Date(createdAt),
      },
    });

  const heat = (g: Group, who: string, qs: string) => api("get", `/boards/${g.boardId}/heatmap?${qs}`, tokenFor(g.ids[who]));
  const dayOf = (res: { body: { data: { days: Array<{ date: string; total: number; task: number; checklist: number; comment: number; review: number }> } } }, date: string) =>
    res.body.data.days.find((d) => d.date === date)!;

  it("hoạt động 23:30 giờ VN đếm vào ĐÚNG ngày VN; hoạt động hệ thống và bình luận đã xoá không tính; chỉ có ngày + số, không có giờ", async () => {
    const g = await setup();
    await activity(g, { at: "2026-09-14T16:30:00Z", actor: g.ids.C }); // 23:30 ICT ngày 14/09 (đã sang ngày 15 theo UTC? không: 16:30Z còn 14/09 UTC)
    await activity(g, { at: "2026-09-14T17:30:00Z", actor: g.ids.C }); // 00:30 ICT ngày 15/09 — trước 17:00Z là ngày 14, sau là ngày 15
    await activity(g, { at: "2026-09-14T16:59:59Z", actor: g.ids.C }); // 23:59:59 ICT ngày 14/09
    await activity(g, { at: "2026-09-15T01:00:00Z", actor: g.ids.C, type: "CHECKLIST_DONE" });
    await activity(g, { at: "2026-09-15T01:00:00Z", actor: null }); // dời lịch tự động (hệ thống) — KHÔNG tính
    await activity(g, { at: "2026-09-15T01:05:00Z", actor: g.ids.D, type: "COMMENT_DELETED_BY_ADMIN" }); // không tính
    await comment(g, g.ids.D, "2026-09-15T02:00:00Z");
    await comment(g, g.ids.D, "2026-09-15T02:10:00Z", "2026-09-15T02:20:00Z"); // đã xoá — không tính

    const res = await heat(g, "D", "from=2026-09-13&to=2026-09-16");
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ timezone: "Asia/Ho_Chi_Minh", from: "2026-09-13", to: "2026-09-16" });
    expect(res.body.data.days).toHaveLength(4);
    expect(dayOf(res, "2026-09-14")).toEqual({ date: "2026-09-14", total: 2, task: 2, checklist: 0, comment: 0, review: 0 });
    expect(dayOf(res, "2026-09-15")).toEqual({ date: "2026-09-15", total: 3, task: 1, checklist: 1, comment: 1, review: 0 });
    expect(dayOf(res, "2026-09-13").total).toBe(0);
    expect(dayOf(res, "2026-09-16").total).toBe(0);
    expect(res.body.data.maxTotal).toBe(3);
    // Riêng tư: chỉ các khoá date + số đếm — không giờ, không id thẻ/hoạt động, không nội dung bình luận.
    expect(Object.keys(dayOf(res, "2026-09-15")).sort()).toEqual(["checklist", "comment", "date", "review", "task", "total"]);
    expect(JSON.stringify(res.body.data)).not.toMatch(/riêng tư|T\d{2}:\d{2}|\d{2}:\d{2}:\d{2}/);
  });

  it("lọc theo người; người không thuộc nhóm → 404; người đã rời nhóm vẫn xem được lịch sử", async () => {
    const g = await setup();
    await activity(g, { at: "2026-09-15T01:00:00Z", actor: g.ids.C });
    await activity(g, { at: "2026-09-15T01:00:00Z", actor: g.ids.D });
    await activity(g, { at: "2026-09-15T02:00:00Z", actor: g.ids.D });
    const mine = await heat(g, "C", `from=2026-09-15&to=2026-09-15&userId=${g.ids.C}`);
    expect(mine.body.data.userId).toBe(g.ids.C);
    expect(dayOf(mine, "2026-09-15").total).toBe(1);
    const other = await heat(g, "C", `from=2026-09-15&to=2026-09-15&userId=${g.ids.D}`);
    expect(dayOf(other, "2026-09-15").total).toBe(2);

    const stranger = await heat(g, "C", `from=2026-09-15&to=2026-09-15&userId=${newObjectId()}`);
    expect([stranger.status, stranger.body.error.code]).toEqual([404, "PERM_404"]);
    const guestId = await heat(g, "C", `from=2026-09-15&to=2026-09-15&userId=${g.ids.G}`);
    expect(guestId.status).toBe(404); // khách không phải thành viên "được tính"

    await prisma.workspaceMembership.updateMany({ where: { workspaceId: g.workspaceId, userId: g.ids.D }, data: { status: "LEFT" } });
    const former = await heat(g, "C", `from=2026-09-15&to=2026-09-15&userId=${g.ids.D}`);
    expect(former.status).toBe(200);
    expect(dayOf(former, "2026-09-15").total).toBe(2);
  });

  it("GUEST và người ngoài → 404; khoảng 400 ngày / from > to / ngày sai → lỗi đúng mã", async () => {
    const g = await setup();
    for (const token of [tokenFor(g.ids.G), tokenFor(newObjectId())]) {
      const res = await api("get", `/boards/${g.boardId}/heatmap?from=2026-09-01&to=2026-09-15`, token);
      expect([res.status, res.body.error.code]).toEqual([404, "PERM_404"]);
      const ws = await api("get", `/workspaces/${g.workspaceId}/activity-heatmap?from=2026-09-01&to=2026-09-15`, token);
      expect(ws.status).toBe(404);
    }
    const tooLong = await heat(g, "C", "from=2025-08-01&to=2026-09-15"); // 410 ngày
    expect([tooLong.status, tooLong.body.error.code]).toEqual([400, "CONTRIB_004"]);
    const reversed = await heat(g, "C", "from=2026-09-15&to=2026-09-01");
    expect([reversed.status, reversed.body.error.code]).toEqual([400, "CONTRIB_004"]);
    const edge = await heat(g, "C", "from=2025-09-16&to=2026-09-15"); // đúng 365 ngày chênh — hợp lệ
    expect(edge.status).toBe(200);
    expect(edge.body.data.days).toHaveLength(365);
    const badDate = await heat(g, "C", "from=2026-02-30&to=2026-03-01");
    expect([badDate.status, badDate.body.error.code]).toEqual([400, "VAL_001"]);
  });

  it("job aggregate chạy hai lần cho cùng kết quả (idempotent); hoạt động mới đánh dấu bẩn rồi được tính lại; ô rỗng bị dọn", async () => {
    const g = await setup();
    await activity(g, { at: "2026-09-15T01:00:00Z", actor: g.ids.C });
    await comment(g, g.ids.C, "2026-09-15T02:00:00Z");
    // Sink `task.events` đánh dấu bảng bẩn khi có hoạt động của người dùng.
    await c.factsService.onTaskActivity({ event: "task.created", taskId: newObjectId(), boardId: g.boardId, workspaceId: g.workspaceId, actorId: g.ids.C } as never);
    expect((await prisma.contributionBoardState.findUnique({ where: { boardId: g.boardId } }))?.activityDirtyAt).not.toBeNull();

    expect(await c.refresh.aggregateDirty()).toBe(1);
    const cells = () => prisma.activityDaily.findMany({ where: { boardId: g.boardId }, orderBy: [{ date: "asc" }, { userId: "asc" }] });
    const first = await cells();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ userId: g.ids.C, date: "2026-09-15", taskEvents: 1, commentEvents: 1, checklistEvents: 0, reviewEvents: 0, total: 2 });
    expect((await prisma.contributionBoardState.findUnique({ where: { boardId: g.boardId } }))?.activityDirtyAt).toBeNull();

    await c.refresh.refreshBoard((await c.directory.getBoard(g.boardId))!, "Asia/Ho_Chi_Minh", false);
    await c.refresh.refreshBoard((await c.directory.getBoard(g.boardId))!, "Asia/Ho_Chi_Minh", false);
    const again = await cells();
    expect(again.map((r) => [r.userId, r.date, r.total])).toEqual(first.map((r) => [r.userId, r.date, r.total]));

    // Xoá bình luận → tính lại → ô giảm; xoá hết → ô biến mất.
    await prisma.taskComment.updateMany({ where: { boardId: g.boardId }, data: { deletedAt: NOW } });
    await c.refresh.refreshBoard((await c.directory.getBoard(g.boardId))!, "Asia/Ho_Chi_Minh", false);
    expect((await cells())[0].total).toBe(1);
    await prisma.taskActivity.deleteMany({ where: { boardId: g.boardId } });
    await c.refresh.refreshBoard((await c.directory.getBoard(g.boardId))!, "Asia/Ho_Chi_Minh", false);
    expect(await cells()).toHaveLength(0);
  });

  it("lượt chấm đã nộp được đếm vào ô của NGƯỜI CHẤM; heatmap nhóm gộp mọi bảng", async () => {
    const g = await setup();
    const board2 = await prisma.board.create({
      data: {
        workspaceId: g.workspaceId,
        name: "Bảng 2",
        normalizedName: "bang 2",
        description: null,
        columns: [{ id: "c_todo0001", title: "a", kind: "TODO", order: 0, wipLimit: null }, { id: "c_done0001", title: "b", kind: "DONE", order: 1, wipLimit: null }],
        createdBy: g.ids.A,
        archivedAt: null,
      },
    });
    await activity(g, { at: "2026-09-15T01:00:00Z", actor: g.ids.C });
    await activity(g, { at: "2026-09-15T01:00:00Z", actor: g.ids.C, boardId: board2.id });
    const taskId = await seedTask(g, { assignees: [g.ids.C], done: true, completedAt: NOW });
    await c.factsService.onReviewSubmitted({
      reviewId: newObjectId(),
      taskId,
      boardId: g.boardId,
      workspaceId: g.workspaceId,
      reviewerId: g.ids.D,
      assigneeIds: [g.ids.C],
      status: "APPROVED",
      score10: 8,
      submittedAt: "2026-09-15T02:30:00.000Z",
    });
    const res = await heat(g, "C", `from=2026-09-15&to=2026-09-15&userId=${g.ids.D}`);
    expect(dayOf(res, "2026-09-15")).toMatchObject({ review: 1, total: 1 });

    const ws = await api("get", `/workspaces/${g.workspaceId}/activity-heatmap?from=2026-09-15&to=2026-09-15`, tokenFor(g.ids.C));
    expect(ws.status).toBe(200);
    // Bảng 1 được làm mới khi xem heatmap bảng; bảng 2 do cron tính lại.
    await c.refresh.refreshBoard((await c.directory.getBoard(board2.id))!, "Asia/Ho_Chi_Minh", false);
    const wsAgain = await api("get", `/workspaces/${g.workspaceId}/activity-heatmap?from=2026-09-15&to=2026-09-15`, tokenFor(g.ids.C));
    expect(dayOf(wsAgain, "2026-09-15").total).toBe(3); // 1 (bảng 1 C) + 1 (bảng 2 C) + 1 (chấm D)
    await prisma.board.deleteMany({ where: { id: board2.id } });
  });
});
