import { installMocks, redisStore } from "./contribution-test-mocks";
import { buildRig, cleanupGroups, completedPayload, ensureContributionIndexes, makeApi, seedGroup, seedTask, tokenFor, type Group } from "./contribution-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const rig = buildRig();
const api = makeApi(rig.app);
const c = rig.container;

// Nhóm: A chủ nhóm, B quản trị, C/D thành viên, G khách. Fixture PM2-33: C = An (8 điểm), D = Bình (4 điểm), B/A không đóng góp.
describe("contribution — báo cáo, công thức, quyền (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  const setup = async (opts: { archivedBoard?: boolean } = {}) => {
    const g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", D: "MEMBER", G: "GUEST" }, opts);
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
    rig.queue.jobs = [];
    rig.audit.records = [];
    rig.emitter.events = [];
  });

  /** Ghi thẻ hoàn thành qua ĐÚNG đường sự kiện (`task.completed`) như sink `p4-06.contribution` sẽ gọi. */
  async function complete(g: Group, who: string[], storyPoints: number | null, n = 1, over: { due?: Date | null; completedAt?: Date } = {}): Promise<string> {
    const completedAt = over.completedAt ?? new Date("2026-09-10T08:00:00Z");
    const taskId = await seedTask(g, { assignees: who.map((w) => g.ids[w]), storyPoints, done: true, completedAt, dueDate: over.due ?? null });
    await c.factsService.onTaskCompleted(
      completedPayload(g, taskId, n, {
        assigneeIds: who.map((w) => g.ids[w]),
        storyPoints,
        dueDate: over.due ? over.due.toISOString() : null,
        completedAt: completedAt.toISOString(),
      })
    );
    return taskId;
  }

  async function fixture(g: Group): Promise<string[]> {
    const due = new Date("2026-09-10T10:00:00Z");
    const ids = [
      await complete(g, ["C"], 3, 1, { due, completedAt: new Date("2026-09-10T08:00:00Z") }),
      await complete(g, ["C"], 2, 1, { due, completedAt: new Date("2026-09-10T09:00:00Z") }),
      await complete(g, ["C"], 2, 1, { due, completedAt: new Date("2026-09-10T10:00:00Z") }),
      await complete(g, ["C"], 1, 1, { due, completedAt: new Date("2026-09-11T02:00:00Z") }), // trễ hạn
      await complete(g, ["D"], 2, 1, { due, completedAt: new Date("2026-09-10T11:00:00Z") }),
      await complete(g, ["D"], 2, 1, { due, completedAt: new Date("2026-09-10T12:00:00Z") }),
    ];
    const reviews: Array<[string, number]> = [["C", 7], ["C", 8], ["C", 8], ["C", 8], ["C", 9], ["D", 7]];
    for (const [i, [who, score]] of reviews.entries()) {
      await c.factsService.onReviewSubmitted({
        reviewId: newObjectId(),
        taskId: ids[0],
        boardId: g.boardId,
        workspaceId: g.workspaceId,
        reviewerId: g.ids.A,
        assigneeIds: [g.ids[who]],
        status: i % 2 === 0 ? "APPROVED" : "REQUEST_CHANGES",
        score10: score,
        submittedAt: "2026-09-12T05:00:00.000Z",
      });
    }
    await c.reports.recompute(g.boardId);
    return ids;
  }

  const get = (g: Group, who: string, path: string) => api("get", path, tokenFor(g.ids[who]));

  describe("PM2-07 — báo cáo chỉ đọc", () => {
    it("OWNER gọi PATCH/PUT/DELETE/POST tới /contribution → 405 CONTRIB_001 (header Allow: GET); snapshot không đổi", async () => {
      const g = await setup();
      await fixture(g);
      const before = await prisma.contributionSnapshot.findMany({ where: { boardId: g.boardId }, orderBy: { id: "asc" } });
      for (const method of ["patch", "put", "delete", "post"] as const) {
        const res = await api(method, `/boards/${g.boardId}/contribution`, tokenFor(g.ids.A), { members: [{ userId: g.ids.D, score: 100 }] });
        expect([res.status, res.body.error.code, res.headers["allow"]]).toEqual([405, "CONTRIB_001", "GET"]);
      }
      const sub = await api("put", `/boards/${g.boardId}/contribution/members/${g.ids.C}/tasks`, tokenFor(g.ids.A), { score: 100 });
      expect([sub.status, sub.body.error.code]).toEqual([405, "CONTRIB_001"]);
      const after = await prisma.contributionSnapshot.findMany({ where: { boardId: g.boardId }, orderBy: { id: "asc" } });
      expect(after).toEqual(before);
    });

    it("PUT contribution-config kèm members[] (hoặc trường lạ) → 400 VAL_001; chưa đăng nhập → 401", async () => {
      const g = await setup();
      const res = await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.A), {
        weights: { points: 60, onTime: 20, peer: 20 },
        expectedVersion: 0,
        members: [{ userId: g.ids.D, score: 100 }],
      });
      expect([res.status, res.body.error.code]).toEqual([400, "VAL_001"]);
      const unknownWeight = await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.A), { weights: { points: 60, onTime: 20, peer: 10, bonus: 10 }, expectedVersion: 0 });
      expect(unknownWeight.status).toBe(400);
      const anonymous = await api("patch", `/boards/${g.boardId}/contribution`, "not-a-token");
      expect(anonymous.status).toBe(401);
    });
  });

  describe("PM2-33 — bảng đóng góp qua API", () => {
    it("MEMBER xem cả bảng: điểm, %, số gốc, thành viên không đóng góp có dòng 0, khách không xuất hiện", async () => {
      const g = await setup();
      await fixture(g);
      const res = await get(g, "D", `/boards/${g.boardId}/contribution?period=ALL`);
      expect(res.status).toBe(200);
      const report = res.body.data;
      const byName = Object.fromEntries((report.members as Array<{ user: { name: string }; score: number; share: number; explanation: string }>).map((m) => [m.user.name, m]));
      expect(byName["Người C"]).toMatchObject({ score: 91, share: 58.7, storyPointsDone: 8, tasksDone: 4, tasksOnTime: 3, tasksLate: 1, reviewCount: 5, peerScoreAvg: 8 });
      expect(byName["Người D"]).toMatchObject({ score: 64, share: 41.3, storyPointsDone: 4, tasksOnTime: 2, peerScoreAvg: 7 });
      expect(byName["Người A"]).toMatchObject({ score: 0, share: 0 });
      expect(byName["Người B"]).toMatchObject({ score: 0, share: 0 });
      expect(byName["Người G"]).toBeUndefined(); // khách không có trong bảng đóng góp
      expect(byName["Người C"].explanation).toBe("60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0");
      expect(report).toMatchObject({ stale: false, totals: { storyPointsDone: 12, tasksDone: 6 }, maxStoryPoints: 8, period: { key: "ALL", timezone: "Asia/Ho_Chi_Minh" } });
      expect(report.formula).toMatchObject({ weights: { points: 60, onTime: 20, peer: 20 }, changedAt: null, changedBy: null });
    });

    it("kỳ tháng/tuần/không tồn tại; kỳ sai → 400 CONTRIB_003; danh sách kỳ", async () => {
      const g = await setup();
      await fixture(g);
      const month = await get(g, "C", `/boards/${g.boardId}/contribution?period=M:2026-09`);
      expect(month.body.data.members.find((m: { user: { name: string } }) => m.user.name === "Người C").score).toBe(91);
      const week = await get(g, "C", `/boards/${g.boardId}/contribution?period=W:2026-W37`);
      expect(week.body.data.members.find((m: { user: { name: string } }) => m.user.name === "Người D").tasksDone).toBe(2);
      const otherMonth = await get(g, "C", `/boards/${g.boardId}/contribution?period=M:2026-10`);
      expect(otherMonth.body.data.totals).toEqual({ storyPointsDone: 0, tasksDone: 0 });
      const bad = await get(g, "C", `/boards/${g.boardId}/contribution?period=W:2025-W53`);
      expect([bad.status, bad.body.error.code]).toEqual([400, "CONTRIB_003"]);
      const periods = await get(g, "C", `/boards/${g.boardId}/contribution/periods`);
      expect(periods.body.data).toMatchObject({ timezone: "Asia/Ho_Chi_Minh", months: ["M:2026-09"], weeks: ["W:2026-W37"] });
    });

    it("kỳ tuần được cache theo (factsVersion, configVersion): fact mới tăng phiên bản → số liệu mới", async () => {
      const g = await setup();
      await fixture(g);
      const q = `/boards/${g.boardId}/contribution?period=W:2026-W37`;
      const first = await get(g, "C", q);
      expect([...redisStore.keys()].some((k) => k.startsWith(`contrib:${g.boardId}:W:2026-W37:`))).toBe(true);
      await complete(g, ["D"], 5, 1, { completedAt: new Date("2026-09-11T05:00:00Z") });
      const second = await get(g, "C", q);
      const tasksOf = (r: { body: { data: { members: Array<{ user: { name: string }; tasksDone: number }> } } }) => r.body.data.members.find((m) => m.user.name === "Người D")?.tasksDone;
      expect(tasksOf(first)).toBe(2);
      expect(tasksOf(second)).toBe(3);
    });

    it("thẻ được tính của một người: cursor, điểm, đúng/trễ hạn; người lạ 404", async () => {
      const g = await setup();
      await fixture(g);
      const page1 = await get(g, "D", `/boards/${g.boardId}/contribution/members/${g.ids.C}/tasks?limit=3`);
      expect(page1.status).toBe(200);
      expect(page1.body.data).toHaveLength(3);
      expect(page1.body.meta).toMatchObject({ hasMore: true, limit: 3 });
      const page2 = await get(g, "D", `/boards/${g.boardId}/contribution/members/${g.ids.C}/tasks?limit=3&cursor=${encodeURIComponent(page1.body.meta.nextCursor as string)}`);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.meta.hasMore).toBe(false);
      const all = [...page1.body.data, ...page2.body.data] as Array<{ onTime: boolean; sharedPoints: number; title: string }>;
      expect(all.filter((t) => t.onTime).length).toBe(3);
      expect(all.reduce((sum, t) => sum + t.sharedPoints, 0)).toBe(8);
      const stranger = await get(g, "D", `/boards/${g.boardId}/contribution/members/${newObjectId()}/tasks`);
      expect(stranger.status).toBe(404);
      const tooMany = await get(g, "D", `/boards/${g.boardId}/contribution/members/${g.ids.C}/tasks?limit=500`);
      expect(tooMany.status).toBe(400);
    });

    it("recompute chạy lại nhiều lần cho cùng snapshot (ghi đè theo phiên bản, không nhân bản dòng)", async () => {
      const g = await setup();
      await fixture(g);
      const count = () => prisma.contributionSnapshot.count({ where: { boardId: g.boardId } });
      const first = await count();
      await c.reports.recompute(g.boardId);
      await c.reports.recompute(g.boardId);
      expect(await count()).toBe(first);
      const state = await prisma.contributionBoardState.findUnique({ where: { boardId: g.boardId } });
      expect(state?.computedVersion).toBe(state?.factsVersion);
    });
  });

  describe("quyền — khách và người ngoài", () => {
    it("GUEST và người ngoài nhận 404 trung tính ở MỌI endpoint; nền tảng admin không có API xem điểm", async () => {
      const g = await setup();
      await fixture(g);
      const outsider = tokenFor(newObjectId());
      const guest = tokenFor(g.ids.G);
      const paths: Array<[string, string, unknown?]> = [
        ["get", `/boards/${g.boardId}/contribution`],
        ["get", `/boards/${g.boardId}/contribution/periods`],
        ["get", `/boards/${g.boardId}/contribution/members/${g.ids.C}/tasks`],
        ["get", `/boards/${g.boardId}/contribution-config`],
        ["get", `/boards/${g.boardId}/heatmap?from=2026-09-01&to=2026-09-30`],
        ["get", `/workspaces/${g.workspaceId}/activity-heatmap?from=2026-09-01&to=2026-09-30`],
        ["post", `/boards/${g.boardId}/contribution/export`, { period: "ALL" }],
        ["put", `/boards/${g.boardId}/contribution-config`, { weights: { points: 60, onTime: 20, peer: 20 }, expectedVersion: 0 }],
      ];
      for (const token of [guest, outsider]) {
        for (const [method, path, body] of paths) {
          const res = await api(method as "get", path, token, body);
          expect([method, path, res.status, res.body.error?.code]).toEqual([method, path, 404, "PERM_404"]);
        }
      }
      expect(rig.audit.records).toHaveLength(0);
    });
  });

  describe("PM2-34 — đổi trọng số minh bạch", () => {
    it("OWNER đổi 50/30/20 → 200, Board.contribution + state, audit, job tính lại ngay, board:updated; báo cáo hiện thời điểm + người + trọng số cũ", async () => {
      const g = await setup();
      await fixture(g);
      const before = await get(g, "C", `/boards/${g.boardId}/contribution-config`);
      expect(before.body.data).toMatchObject({ weights: { points: 60, onTime: 20, peer: 20 }, version: 0, isDefault: true });

      const put = await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.A), { weights: { points: 50, onTime: 30, peer: 20 }, expectedVersion: 0 });
      expect(put.status).toBe(200);
      expect(put.body.data).toMatchObject({ weights: { points: 50, onTime: 30, peer: 20 }, version: 1, isDefault: false, changedBy: { id: g.ids.A, name: "Người A" }, previousWeights: { points: 60, onTime: 20, peer: 20 } });

      const board = await prisma.board.findUnique({ where: { id: g.boardId }, select: { contribution: true, version: true } });
      expect(board?.contribution).toEqual({ weights: { points: 50, onTime: 30, peer: 20 }, onTimeGraceHours: 0, unestimatedPoints: 1 });
      expect(board?.version).toBe(1); // KHÔNG đụng Board.version
      expect(rig.audit.records).toEqual([expect.objectContaining({ action: "board.contribution-config", targetType: "Board", targetId: g.boardId, actorId: g.ids.A })]);
      expect(rig.queue.jobs.some((j) => j.jobId === `contribution.recompute:board:${g.boardId}:c1` && j.delayMs === 0)).toBe(true);
      expect(rig.emitter.events).toEqual([{ boardId: g.boardId, version: 1 }]);

      const report = await get(g, "D", `/boards/${g.boardId}/contribution`);
      const an = report.body.data.members.find((m: { user: { name: string } }) => m.user.name === "Người C");
      expect(an.score).toBe(88.5); // 50×1 + 30×0,75 + 20×0,8 — tính tại chỗ ngay cả khi job chưa chạy
      expect(report.body.data.formula).toMatchObject({ weights: { points: 50, onTime: 30, peer: 20 }, changedBy: { name: "Người A" }, previousWeights: { points: 60, onTime: 20, peer: 20 } });
      expect(report.body.data.formula.changedAt).toEqual(expect.any(String));

      await c.reports.recompute(g.boardId);
      const snap = await prisma.contributionSnapshot.findFirst({ where: { boardId: g.boardId, userId: g.ids.C, periodKey: "ALL" } });
      expect(snap?.score).toBe(88.5);
    });

    it("MEMBER thử đổi → 403; tổng 110 → 400 CONTRIB_002; lệch version → 409 RES_003 kèm currentVersion; ADMIN đổi được", async () => {
      const g = await setup();
      const body = { weights: { points: 50, onTime: 30, peer: 20 }, expectedVersion: 0 };
      const member = await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.C), body);
      expect([member.status, member.body.error.code]).toEqual([403, "PERM_001"]);
      const bad = await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.A), { ...body, weights: { points: 50, onTime: 30, peer: 30 } });
      expect([bad.status, bad.body.error.code]).toEqual([400, "CONTRIB_002"]);
      expect(await prisma.contributionBoardState.count({ where: { boardId: g.boardId, configVersion: { gt: 0 } } })).toBe(0);

      const admin = await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.B), body);
      expect(admin.status).toBe(200);
      const stale = await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.A), { ...body, weights: { points: 40, onTime: 30, peer: 30 } });
      expect([stale.status, stale.body.error.code, stale.body.error.details]).toEqual([409, "RES_003", { currentVersion: 1 }]);
    });

    it("hai lệnh đổi cùng expectedVersion đồng thời: đúng MỘT thắng, một 409", async () => {
      const g = await setup();
      const [x, y] = await Promise.all([
        api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.A), { weights: { points: 50, onTime: 30, peer: 20 }, expectedVersion: 0 }),
        api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.B), { weights: { points: 40, onTime: 40, peer: 20 }, expectedVersion: 0 }),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 409]);
      expect(rig.audit.records).toHaveLength(1);
    });

    it("bảng đã lưu trữ: đọc được, đổi công thức bị 403", async () => {
      const g = await setup({ archivedBoard: true });
      expect((await get(g, "C", `/boards/${g.boardId}/contribution-config`)).status).toBe(200);
      const put = await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.A), { weights: { points: 50, onTime: 30, peer: 20 }, expectedVersion: 0 });
      expect(put.status).toBe(403);
    });
  });

  describe("admin nền tảng — chỉ số đếm", () => {
    it("GET /admin/workspaces/:id/contribution-stats: chỉ số đếm, KHÔNG có điểm/thành viên; người thường 403", async () => {
      const g = await setup();
      await fixture(g);
      await api("put", `/boards/${g.boardId}/contribution-config`, tokenFor(g.ids.A), { weights: { points: 50, onTime: 30, peer: 20 }, expectedVersion: 0 });
      const admin = await api("get", `/admin/workspaces/${g.workspaceId}/contribution-stats?days=30`, tokenFor(newObjectId(), "admin"));
      expect(admin.status).toBe(200);
      expect(Object.keys(admin.body.data).sort()).toEqual(["boardsWithCustomWeights", "exports", "lastComputedAt", "pendingBoards", "staleBoards"]);
      expect(admin.body.data).toMatchObject({ boardsWithCustomWeights: 1, exports: { ready: 0, failed: 0 } });
      expect(JSON.stringify(admin.body.data)).not.toMatch(/score|share|members|Người/);
      const plain = await api("get", `/admin/workspaces/${g.workspaceId}/contribution-stats`, tokenFor(g.ids.A));
      expect(plain.status).toBe(403);
    });
  });
});
