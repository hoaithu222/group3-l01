import { installMocks } from "./career-test-mocks";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { buildRig, cleanup, completedPayload, ensureCareerIndexes, seedDoneTask, seedUser, seedWorkspace, type Rig } from "./career-test-kit";

/** Consumer tiến độ + đối soát + xem trước với Prisma THẬT (Mongo in-memory, unique index tạo tay). */
let rig: Rig;
const users: string[] = [];
const workspaces: string[] = [];
const skills: string[] = [];
const ADMIN = { id: newObjectId(), email: "a@e.com", role: "admin" };
let dev: string;
let ws: string;

async function newSkill(criteria: Record<string, unknown>, labels: string[] = ["ReactJS"]) {
  const s = await rig.c.admin.create(ADMIN, { code: `s-${newObjectId().slice(-10)}`, name: "ReactJS", category: "FRONTEND", labelMatch: labels, criteria, icon: "keyboard", order: 0 });
  skills.push(s.id);
  await rig.c.admin.setActive(ADMIN, s.id, true, "Bật để kiểm thử tích hợp");
  return s.id;
}

async function reviewedRound(taskId: string, scores: number[]): Promise<string> {
  const roundId = newObjectId();
  for (const score10 of scores) {
    await prisma.taskReview.create({
      data: { roundId, taskId, boardId: newObjectId(), workspaceId: ws, reviewerId: newObjectId(), status: "APPROVED", assignedBy: null, assignedAt: new Date(), score10, submittedAt: new Date() },
    });
  }
  return roundId;
}

beforeAll(async () => {
  installMocks();
  await ensureCareerIndexes();
  rig = buildRig();
  dev = await seedUser("Lập trình viên");
  users.push(dev);
  ws = await seedWorkspace(`Nhóm ${dev.slice(-4)}`, { [dev]: "OWNER" });
  workspaces.push(ws);
});

beforeEach(() => installMocks());

afterAll(async () => {
  await prisma.userSkillProgress.deleteMany({ where: { skillId: { in: skills } } });
  await cleanup(users, workspaces, skills);
});

describe("tiến độ kỹ năng (Prisma thật)", () => {
  it("CR-01: 50 task nhãn ReactJS, review TB 8,2; tiêu chí 50 task / 8,0 / qua review → một huy hiệu, proof top 5, một thông báo", async () => {
    const skillId = await newSkill({ requiredTasksDone: 50, minAvgPeerScore: 8, requireReview: true });
    for (let i = 0; i < 52; i += 1) {
      const taskId = await seedDoneTask(ws, `Việc ${i}`, [dev]);
      const roundId = await reviewedRound(taskId, [8, 8.4]);
      await rig.c.progressService.onTaskCompleted(completedPayload(taskId, ws, [dev], { storyPoints: (i % 5) + 1, labelNames: ["ReactJS"], review: { enabled: true, approved: true, roundId } }));
    }
    const badges = await prisma.userSkillBadge.findMany({ where: { userId: dev, skillId } });
    expect(badges).toHaveLength(1);
    expect(badges[0].proof).toMatchObject({ tasksDone: 50, avgPeerScoreX10: 82 });
    expect(badges[0].proof.taskCreditIds).toHaveLength(5);
    expect(await prisma.notification.count({ where: { type: "career.skill-unlocked", dedupeKey: `skill-unlocked:${dev}:${skillId}` } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { dedupeKey: `skill.unlocked:user:${dev}:skill:${skillId}` } })).toBe(1);
    expect((await prisma.userSkillProgress.findFirst({ where: { userId: dev, skillId } }))?.tasksDone).toBe(52);
  });

  it("hai job song song cùng thẻ → MỘT credit (unique + thử lại), tiến độ +1; mở lại → trừ; đối soát giữ đúng", async () => {
    const skillId = await newSkill({ requiredTasksDone: 100, requireReview: false }, ["Node.js"]);
    const taskId = await seedDoneTask(ws, "Việc song song", [dev]);
    const p = completedPayload(taskId, ws, [dev], { labelNames: ["node js"] });
    await Promise.all([rig.c.progressService.onTaskCompleted(p), rig.c.progressService.onTaskCompleted(p), rig.c.progressService.onTaskCompleted(p)]);
    expect(await prisma.userSkillTaskCredit.count({ where: { taskId, skillId } })).toBe(1);
    expect((await prisma.userSkillProgress.findFirst({ where: { userId: dev, skillId } }))?.tasksDone).toBe(1);

    await prisma.task.update({ where: { id: taskId }, data: { columnKind: "IN_PROGRESS" } });
    await rig.c.progressService.onTaskReopened({ event: "task.reopened", taskId, workspaceId: ws, assigneeIds: [dev], completionCount: 1, reopenedAt: new Date().toISOString() });
    expect(await prisma.userSkillProgress.findFirst({ where: { userId: dev, skillId } })).toMatchObject({ tasksDone: 0, storyPointsX10: 0 });

    await prisma.userSkillProgress.updateMany({ where: { userId: dev, skillId }, data: { tasksDone: 7 } });
    const r = await rig.c.reconcile.nightly();
    expect(r.fixed).toBeGreaterThanOrEqual(1);
    expect((await prisma.userSkillProgress.findFirst({ where: { userId: dev, skillId } }))?.tasksDone).toBe(0);
  });

  it("CR-27: xem trước trên 10.000 hàng tiến độ trả số trong ≤ 3 s (aggregate, không quét task)", async () => {
    const skillId = await newSkill({ requiredTasksDone: 20, minAvgPeerScore: 8, requireReview: false });
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      userId: newObjectId(),
      skillId,
      tasksDone: i % 40,
      storyPointsX10: (i % 40) * 30,
      reviewScoreSumX10: (i % 40) * (70 + (i % 20)),
      reviewScoreCount: i % 40,
      lastTaskAt: null,
    }));
    for (let i = 0; i < rows.length; i += 2000) await prisma.userSkillProgress.createMany({ data: rows.slice(i, i + 2000) });
    const expected = rows.filter((r) => r.tasksDone >= 20 && r.reviewScoreCount > 0 && Math.round(r.reviewScoreSumX10 / r.reviewScoreCount) >= 80).length;
    const started = Date.now();
    const preview = await rig.c.preview.eligible(skillId);
    expect(Date.now() - started).toBeLessThanOrEqual(3000);
    expect(preview).toMatchObject({ eligibleCount: expected, alreadyHolding: 0, willGrant: expected });
    expect(preview.sampleUserIds).toHaveLength(5);
  }, 60_000);
});
