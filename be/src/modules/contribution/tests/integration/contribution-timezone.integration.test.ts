import { installMocks, redisStore } from "./contribution-test-mocks";
import { buildRig, cleanupGroups, ensureContributionIndexes, makeApi, seedGroup, seedTask, tokenFor, type Group } from "./contribution-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { FakeConfig } from "../support/fakes";

const ICT = "Asia/Ho_Chi_Minh";
const UTC = "UTC";
const TOKYO = "Asia/Tokyo";
// "Bây giờ" cố định: 15/09/2026 10:00 giờ VN (03:00Z) — đồng hồ của cả container.
const NOW = new Date("2026-09-15T03:00:00Z");
const config = new FakeConfig();
const rig = buildRig({ now: () => NOW, config });
const api = makeApi(rig.app);
const c = rig.container;

describe("contribution — đổi múi giờ (pm.timezone) trên Mongo thật", () => {
  const groups: Group[] = [];
  const stateIds: string[] = [];
  const setup = async () => {
    const g = await seedGroup({ A: "OWNER", C: "MEMBER", D: "MEMBER" });
    groups.push(g);
    return g;
  };

  beforeAll(async () => {
    await ensureContributionIndexes();
  });
  beforeEach(() => {
    installMocks();
    config.tz = ICT;
  });
  afterEach(async () => {
    await prisma.contributionBoardState.deleteMany({ where: { boardId: { in: stateIds.splice(0) } } });
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
    rig.queue.jobs = [];
  });

  const stateOf = (boardId: string) => prisma.contributionBoardState.findUnique({ where: { boardId } });
  const jobsFor = (boardId: string) => rig.queue.jobs.filter((j) => j.boardId === boardId);

  it("state: hai trường múi giờ khởi tạo null TƯỜNG MINH (lọc {field:null} khớp); markComputed/setActivityRefreshed ghi múi giờ; làm mới một phần KHÔNG đổi múi giờ của ô", async () => {
    const g = await setup();
    const defaults = await config.defaults();
    await c.states.ensure(g.boardId, g.workspaceId, defaults);
    expect(await prisma.contributionBoardState.count({ where: { boardId: g.boardId, snapshotTimezone: null, activityTimezone: null } })).toBe(1);

    await c.states.markComputed(g.boardId, 0, NOW, ICT);
    await c.states.setActivityRefreshed(g.boardId, NOW, ICT);
    expect(await stateOf(g.boardId)).toMatchObject({ snapshotTimezone: ICT, activityTimezone: ICT });

    const later = new Date(NOW.getTime() + 5000);
    await c.states.setActivityRefreshed(g.boardId, later); // làm mới một phần: không truyền múi giờ
    const state = await stateOf(g.boardId);
    expect(state?.activityRefreshedAt?.toISOString()).toBe(later.toISOString());
    expect(state?.activityTimezone).toBe(ICT);
    // Job tính lại cũ chạy chậm (version thấp hơn) không ghi đè kết quả mới hơn, kể cả múi giờ.
    await c.states.bumpFactsVersion(g.boardId, g.workspaceId, defaults);
    await c.states.markComputed(g.boardId, 1, later, UTC);
    await c.states.markComputed(g.boardId, 0, later, ICT);
    expect(await stateOf(g.boardId)).toMatchObject({ computedVersion: 1, snapshotTimezone: UTC });
  });

  it("listPage: theo boardId tăng dần, phân trang bằng con trỏ, không sót không lặp", async () => {
    const defaults = await config.defaults();
    const mine = Array.from({ length: 5 }, () => newObjectId());
    stateIds.push(...mine);
    for (const boardId of mine) await c.states.ensure(boardId, newObjectId(), defaults);

    const seen: string[] = [];
    let after: string | null = null;
    for (;;) {
      const page = await c.states.listPage(after, 2);
      expect(page.length).toBeLessThanOrEqual(2);
      seen.push(...page.map((s) => s.boardId));
      if (page.length < 2) break;
      after = page[page.length - 1].boardId;
    }
    expect(seen).toEqual([...seen].sort()); // tăng dần
    expect(new Set(seen).size).toBe(seen.length); // không lặp
    expect(seen.filter((id) => mine.includes(id))).toEqual([...mine].sort()); // đủ 5 bảng của test
  });

  it("đổi múi giờ: báo cáo tháng và heatmap ĐÚNG NGAY; lượt quét đêm + job kéo phần còn lại về múi giờ mới; quét lại không đụng gì", async () => {
    const g = await setup();
    const api$ = (path: string, who = "C") => api("get", path, tokenFor(g.ids[who]));
    const memberOf = (res: { body: { data: { members: Array<{ user: { id: string }; tasksDone: number }> } } }) => res.body.data.members.find((m) => m.user.id === g.ids.C)!;

    // Thẻ xong lúc 01:00 ICT ngày 01/09 (= 18:00Z ngày 31/08); một hoạt động lúc 00:30 ICT ngày 15/09 (= 17:30Z ngày 14/09).
    const completedAt = new Date("2026-08-31T18:00:00Z");
    const taskId = await seedTask(g, { assignees: [g.ids.C], storyPoints: 3, done: true, completedAt });
    await c.facts.applyCompleted({ taskId, boardId: g.boardId, workspaceId: g.workspaceId, assigneeIds: [g.ids.C], storyPoints: 3, dueDate: null, completedAt, completionCount: 1, reviewApproved: null });
    await c.states.bumpFactsVersion(g.boardId, g.workspaceId, await config.defaults());
    await c.reports.recompute(g.boardId);
    await prisma.taskActivity.create({ data: { taskId: newObjectId(), boardId: g.boardId, workspaceId: g.workspaceId, actorId: g.ids.C, type: "MOVED", groupKey: null, at: new Date("2026-09-14T17:30:00Z") } });

    // — Múi giờ ICT: tháng 9 có thẻ; heatmap ghi ô ngày 15/09 và múi giờ của ô.
    const sepIct = await api$(`/boards/${g.boardId}/contribution?period=M:2026-09`);
    expect(sepIct.body.data.period.timezone).toBe(ICT);
    expect(memberOf(sepIct).tasksDone).toBe(1);
    const heatIct = await api$(`/boards/${g.boardId}/heatmap?from=2026-09-13&to=2026-09-16`);
    expect(heatIct.body.data.days.filter((d: { total: number }) => d.total > 0).map((d: { date: string }) => d.date)).toEqual(["2026-09-15"]);
    expect(await stateOf(g.boardId)).toMatchObject({ snapshotTimezone: ICT, activityTimezone: ICT });
    // Ô "ma" của múi giờ cũ nằm NGOÀI khoảng dựng lại (trước ngày làm mới) — lần dựng đầy đủ phải dọn được.
    await prisma.activityDaily.create({ data: { workspaceId: g.workspaceId, boardId: g.boardId, userId: g.ids.D, date: "2026-07-31", taskEvents: 4, checklistEvents: 0, commentEvents: 0, reviewEvents: 0, total: 4 } });

    // — Admin đổi sang UTC (chưa có job nào chạy): xem là đúng ngay, dù snapshot/ô đã lưu còn theo ICT và còn "tươi" theo đồng hồ.
    config.tz = UTC;
    const sepUtc = await api$(`/boards/${g.boardId}/contribution?period=M:2026-09`);
    expect(sepUtc.body.data.period.timezone).toBe(UTC);
    expect(memberOf(sepUtc).tasksDone).toBe(0);
    expect(memberOf(await api$(`/boards/${g.boardId}/contribution?period=M:2026-08`)).tasksDone).toBe(1);
    expect(jobsFor(g.boardId).length).toBeGreaterThan(0); // xem xong đã xếp job tính lại

    const heatUtc = await api$(`/boards/${g.boardId}/heatmap?from=2026-07-30&to=2026-09-16`);
    expect(heatUtc.body.data.timezone).toBe(UTC);
    expect(heatUtc.body.data.days.filter((d: { total: number }) => d.total > 0).map((d: { date: string; total: number }) => [d.date, d.total])).toEqual([["2026-09-14", 1]]);
    expect((await prisma.activityDaily.findMany({ where: { boardId: g.boardId } })).map((r) => r.date)).toEqual(["2026-09-14"]); // ô ICT 15/09 và ô ma 31/07 đã bị thay
    expect(await stateOf(g.boardId)).toMatchObject({ activityTimezone: UTC });

    // — Job tính lại chạy: snapshot theo UTC (tháng 9 không còn thẻ).
    await c.reports.recompute(g.boardId);
    expect(await stateOf(g.boardId)).toMatchObject({ snapshotTimezone: UTC });
    const periodKeys = new Set((await prisma.contributionSnapshot.findMany({ where: { boardId: g.boardId } })).map((r) => r.periodKey));
    expect(periodKeys).toEqual(new Set(["ALL", "M:2026-08"])); // tháng 9 theo ICT không còn: thẻ nằm ở tháng 8 theo UTC

    // — Đổi tiếp sang Tokyo, KHÔNG ai mở báo cáo: lượt quét đêm xếp tính lại + đánh dấu heatmap; job chạy xong thì quét lại không đụng gì.
    config.tz = TOKYO;
    rig.queue.jobs = [];
    const swept = await c.timezoneSync.run();
    expect(swept.recompute).toBeGreaterThanOrEqual(1);
    expect(swept.heatmap).toBeGreaterThanOrEqual(1);
    expect(jobsFor(g.boardId)).toHaveLength(1);
    expect((await stateOf(g.boardId))?.activityDirtyAt).not.toBeNull();

    await c.reports.recompute(g.boardId);
    expect(await c.refresh.aggregateDirty()).toBeGreaterThanOrEqual(1);
    expect(await stateOf(g.boardId)).toMatchObject({ snapshotTimezone: TOKYO, activityTimezone: TOKYO, activityDirtyAt: null });
    rig.queue.jobs = [];
    await c.timezoneSync.run();
    expect(jobsFor(g.boardId)).toHaveLength(0);
    expect((await stateOf(g.boardId))?.activityDirtyAt).toBeNull();
  });
});
