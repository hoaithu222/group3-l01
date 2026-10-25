import { installMocks, redisStore } from "./contribution-test-mocks";
import { buildRig, cleanupGroups, ensureContributionIndexes, seedGroup, seedTask, type Group } from "./contribution-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import type { TaskFactInput } from "../../entities/contribution.interface";

const rig = buildRig();
const c = rig.container;

describe("contribution — fact idempotent trên Mongo thật (PM2-09) + đối soát", () => {
  const groups: Group[] = [];
  const setup = async () => {
    const g = await seedGroup({ A: "OWNER", C: "MEMBER", D: "MEMBER" });
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
  });

  const fact = (g: Group, taskId: string, n: number, over: Partial<TaskFactInput> = {}): TaskFactInput => ({
    taskId,
    boardId: g.boardId,
    workspaceId: g.workspaceId,
    assigneeIds: [g.ids.C],
    storyPoints: 5,
    dueDate: null,
    completedAt: new Date(`2026-09-1${n}T08:00:00Z`),
    completionCount: n,
    reviewApproved: null,
    ...over,
  });
  const facts = (taskId: string) => prisma.contributionTaskFact.findMany({ where: { taskId } });

  it("cùng task.completed chạy song song 8 lần → đúng MỘT bản ghi, kết quả 1 CREATED + 7 SKIPPED", async () => {
    const g = await setup();
    const taskId = newObjectId();
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => c.facts.applyCompleted(fact(g, taskId, 1))));
    expect((await facts(taskId)).length).toBe(1);
    expect(outcomes.filter((o) => o === "CREATED")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "SKIPPED")).toHaveLength(7);
  });

  it("completed c1 → reopened c1 → completed c2: một bản ghi, completedAt mới, hoạt động trở lại", async () => {
    const g = await setup();
    const taskId = newObjectId();
    await c.facts.applyCompleted(fact(g, taskId, 1));
    expect(await c.facts.applyReopened({ taskId, boardId: g.boardId, workspaceId: g.workspaceId, assigneeIds: [g.ids.C], completionCount: 1, reopenedAt: new Date() })).toBe("DEACTIVATED");
    expect((await facts(taskId))[0].active).toBe(false);
    expect(await c.facts.applyCompleted(fact(g, taskId, 2, { storyPoints: 8 }))).toBe("UPDATED");
    const rows = await facts(taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ active: true, completionCount: 2, storyPoints: 8 });
    expect(rows[0].completedAt.toISOString()).toBe("2026-09-12T08:00:00.000Z");
    expect(await c.facts.applyCompleted(fact(g, taskId, 1))).toBe("SKIPPED"); // sự kiện cũ tới muộn
  });

  it("reopened tới TRƯỚC completed: bản giữ chỗ (inactive) chặn completed c1 muộn; hai reopened song song vẫn một bản ghi", async () => {
    const g = await setup();
    const taskId = newObjectId();
    const reopened = { taskId, boardId: g.boardId, workspaceId: g.workspaceId, assigneeIds: [g.ids.C], completionCount: 1, reopenedAt: new Date() };
    const outcomes = await Promise.all([c.facts.applyReopened(reopened), c.facts.applyReopened(reopened), c.facts.applyReopened(reopened)]);
    expect((await facts(taskId)).length).toBe(1);
    expect(outcomes.filter((o) => o === "PLACEHOLDER")).toHaveLength(1);
    expect(await c.facts.applyCompleted(fact(g, taskId, 1))).toBe("SKIPPED");
    expect((await facts(taskId))[0].active).toBe(false);
    expect(await c.facts.applyCompleted(fact(g, taskId, 2))).toBe("UPDATED");
    expect((await facts(taskId))[0].active).toBe(true);
  });

  it("lượt chấm insert-only theo reviewId, song song vẫn một bản ghi", async () => {
    const g = await setup();
    const review = { reviewId: newObjectId(), taskId: newObjectId(), boardId: g.boardId, workspaceId: g.workspaceId, reviewerId: g.ids.D, assigneeIds: [g.ids.C], status: "APPROVED" as const, score10: 9, submittedAt: new Date() };
    const results = await Promise.all([c.facts.insertReviewFact(review), c.facts.insertReviewFact(review), c.facts.insertReviewFact(review)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.contributionReviewFact.count({ where: { reviewId: review.reviewId } })).toBe(1);
  });

  it("state: hai consumer cùng tạo state MỚI không lỗi; factsVersion tăng đúng số lần thay đổi", async () => {
    const g = await setup();
    const defaults = { weights: { points: 60, onTime: 20, peer: 20 }, onTimeGraceHours: 0, unestimatedPoints: 1 };
    await Promise.all(Array.from({ length: 5 }, () => c.states.bumpFactsVersion(g.boardId, g.workspaceId, defaults)));
    const state = await prisma.contributionBoardState.findMany({ where: { boardId: g.boardId } });
    expect(state).toHaveLength(1);
    expect(state[0].factsVersion).toBe(5);
    expect(state[0].defaultsSnapshot).toEqual(defaults);
    expect(state[0].activityDirtyAt).toBeNull();
  });

  describe("contribution.reconcile — dựng lại fact từ Task/TaskReview (lưới an toàn khi mất sự kiện)", () => {
    it("thẻ ở cột DONE chưa có fact → tạo; fact còn active mà thẻ đã rời DONE → vô hiệu; thẻ đã xoá hẳn khỏi DB → GIỮ fact; chạy lại không đổi gì", async () => {
      const g = await setup();
      const done = await seedTask(g, { assignees: [g.ids.C], storyPoints: 5, done: true, completedAt: new Date("2026-09-10T08:00:00Z") });
      const softDeleted = await seedTask(g, { assignees: [g.ids.D], storyPoints: 2, done: true, completedAt: new Date("2026-09-11T08:00:00Z"), deletedAt: new Date() });
      const reopenedTask = await seedTask(g, { assignees: [g.ids.C], storyPoints: 3, done: false });
      await c.facts.applyCompleted(fact(g, reopenedTask, 1)); // mất sự kiện task.reopened
      const purged = newObjectId(); // thẻ đã bị xoá hẳn khỏi DB nhưng fact lịch sử vẫn còn
      await c.facts.applyCompleted(fact(g, purged, 1, { assigneeIds: [g.ids.D] }));

      const first = await c.reconcile.run();
      expect(first).toMatchObject({ boards: 1, fixedBoards: 1 });
      expect((await facts(done))[0]).toMatchObject({ active: true, completionCount: 1, storyPoints: 5, assigneeIds: [g.ids.C] });
      expect((await facts(softDeleted))[0].active).toBe(true); // xoá mềm vẫn là dữ liệu lịch sử
      expect((await facts(reopenedTask))[0].active).toBe(false);
      expect((await facts(purged))[0].active).toBe(true);

      const state = await prisma.contributionBoardState.findUnique({ where: { boardId: g.boardId } });
      expect(state?.factsVersion).toBeGreaterThan(0);
      expect(rig.queue.jobs.length).toBeGreaterThan(0);

      const second = await c.reconcile.run();
      expect(second).toMatchObject({ boards: 1, fixedBoards: 0 });
      expect((await prisma.contributionBoardState.findUnique({ where: { boardId: g.boardId } }))?.factsVersion).toBe(state?.factsVersion);
    });

    it("lượt chấm đã nộp mà chưa có fact → thêm (người làm hiện tại); lượt chưa nộp bị bỏ", async () => {
      const g = await setup();
      const taskId = await seedTask(g, { assignees: [g.ids.C], storyPoints: 3, done: true, completedAt: new Date() });
      const submitted = await prisma.taskReview.create({
        data: { roundId: newObjectId(), taskId, boardId: g.boardId, workspaceId: g.workspaceId, reviewerId: g.ids.D, status: "APPROVED", submittedAt: new Date(), score10: 8.5, rubricScores: [], feedback: null, cancelReason: null, replacedById: null, assignedBy: null },
      });
      await prisma.taskReview.create({
        data: { roundId: newObjectId(), taskId, boardId: g.boardId, workspaceId: g.workspaceId, reviewerId: g.ids.A, status: "PENDING", submittedAt: null, score10: null, rubricScores: [], feedback: null, cancelReason: null, replacedById: null, assignedBy: null },
      });
      const result = await c.reconcile.run();
      expect(result.reviewsSeen).toBe(1);
      const stored = await prisma.contributionReviewFact.findMany({ where: { boardId: g.boardId } });
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ reviewId: submitted.id, reviewerId: g.ids.D, score10: 8.5, status: "APPROVED", assigneeIds: [g.ids.C] });
      await c.reconcile.run();
      expect(await prisma.contributionReviewFact.count({ where: { boardId: g.boardId } })).toBe(1);
    });

    it("recompute thật từ fact dựng lại: điểm, %, số gốc khớp Task nguồn", async () => {
      const g = await setup();
      const due = new Date("2026-09-10T10:00:00Z");
      await seedTask(g, { assignees: [g.ids.C], storyPoints: 8, done: true, completedAt: new Date("2026-09-10T08:00:00Z"), dueDate: due });
      await seedTask(g, { assignees: [g.ids.D], storyPoints: 4, done: true, completedAt: new Date("2026-09-11T08:00:00Z"), dueDate: due });
      await c.reconcile.run();
      await c.reports.recompute(g.boardId);
      const rows = await prisma.contributionSnapshot.findMany({ where: { boardId: g.boardId, periodKey: "ALL" } });
      const byUser = Object.fromEntries(rows.map((r) => [r.userId, r]));
      expect(byUser[g.ids.C]).toMatchObject({ storyPointsDone: 8, tasksOnTime: 1, tasksLate: 0, teamTasksDone: 2, teamStoryPoints: 12 });
      expect(byUser[g.ids.D]).toMatchObject({ storyPointsDone: 4, tasksOnTime: 0, tasksLate: 1 });
      expect(rows.reduce((sum, r) => sum + Math.round(r.share * 10), 0)).toBe(1000);
    });
  });
});
