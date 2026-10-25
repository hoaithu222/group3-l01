import { newObjectId } from "../../../core/utils/object-id";
import { toStoredCriteria } from "../../../shared/criteria/skill-criteria";
import { addSkill, buildHarness, completed, reopened, type Harness } from "./support/harness";

const A = newObjectId();
const ADMIN = { id: newObjectId(), email: "admin@e.com", name: "Vận hành", role: "admin" };
const REASON = "Phát hiện gắn nhãn tràn lan để lấy huy hiệu";

let h: Harness;
beforeEach(() => {
  h = buildHarness();
});

async function doneTasks(n: number, over: { sp?: number; roundAvg?: number } = {}) {
  for (let i = 0; i < n; i += 1) {
    const roundId = newObjectId();
    if (over.roundAvg !== undefined) h.source.roundAvg.set(roundId, over.roundAvg);
    const review = over.roundAvg !== undefined ? { enabled: true, approved: true, roundId } : undefined;
    await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A], sp: over.sp ?? (i % 5) + 1, review }));
  }
}

describe("SkillEvaluationService — cấp huy hiệu + minh chứng", () => {
  it("CR-01: 50 task ReactJS Done, review TB 8,2; tiêu chí 50 task / TB 8,0 → cấp MỘT lần, proof top 5, một thông báo, outbox skill.unlocked", async () => {
    const skill = await addSkill(h, { criteria: { requiredTasksDone: 50, minAvgPeerScore: 8, requireReview: true } });
    await doneTasks(49, { roundAvg: 82 });
    expect(await h.badges.find(A, skill.id)).toBeNull();
    await doneTasks(3, { roundAvg: 82 });

    const badge = await h.badges.find(A, skill.id);
    expect(badge).not.toBeNull();
    expect(badge?.proof).toMatchObject({ tasksDone: 50, avgPeerScoreX10: 82 });
    expect(badge?.proof.taskCreditIds).toHaveLength(5);
    const top = await h.credits.findByIds(badge?.proof.taskCreditIds ?? []);
    expect(top.every((c) => c.storyPointsX10 === 50)).toBe(true);
    expect(h.notifier.sent.filter((n) => n.type === "career.skill-unlocked")).toHaveLength(1);
    expect(h.outbox.rows.filter((r) => r.type === "skill.unlocked")).toHaveLength(1);
    expect(h.badges.rows.size).toBe(1);
  });

  it("mở lại task sau khi đã có huy hiệu → tracker giảm nhưng huy hiệu GIỮ (không tự thu hồi)", async () => {
    const skill = await addSkill(h, { criteria: { requiredTasksDone: 1 } });
    const t = completed(h, { assignees: [A] });
    await h.c.progressService.onTaskCompleted(t);
    await h.c.progressService.onTaskReopened(reopened(h, t.taskId, 1, [A]));
    expect((await h.progress.find(A, skill.id))?.tasksDone).toBe(0);
    expect((await h.badges.find(A, skill.id))?.revokedAt).toBeNull();
  });

  it("CR-24: đổi tiêu chí khó hơn → huy hiệu đã cấp giữ nguyên (criteriaSnapshot cũ); tracker hiện tiêu chí mới", async () => {
    const skill = await addSkill(h, { criteria: { requiredTasksDone: 2 } });
    await doneTasks(2);
    const updated = await h.c.admin.update(ADMIN, skill.id, { expectedVersion: 1, criteria: { requiredTasksDone: 10, requireReview: false } });
    expect(updated.criteriaHarder).toBe(true);
    expect(h.outbox.rows.some((r) => r.jobName === "skill.reevaluate-skill")).toBe(true);
    const badge = await h.badges.find(A, skill.id);
    expect(badge?.revokedAt).toBeNull();
    expect(badge?.criteriaSnapshot.requiredTasksDone).toBe(2);
    const [item] = await h.c.query.catalog(A);
    expect(item.criteria.requiredTasksDone).toBe(10);
    expect(item.myProgress).toMatchObject({ tasksDone: 2, achieved: false, remaining: { tasks: 8 } });
    expect(item.myBadge).toMatchObject({ revoked: false });
  });

  it("CR-25: thu hồi rồi làm thêm task → KHÔNG tự cấp lại; vận hành Khôi phục mới có lại", async () => {
    const skill = await addSkill(h, { criteria: { requiredTasksDone: 1 } });
    await doneTasks(1);
    await h.c.badgeAdmin.revoke(ADMIN, A, skill.id, REASON);
    expect(h.notifier.sent.some((n) => n.type === "career.skill-revoked")).toBe(true);
    await doneTasks(3);
    await h.c.reconcile.reevaluateAll();
    expect((await h.badges.find(A, skill.id))?.revokedAt).not.toBeNull();
    expect(h.badges.rows.size).toBe(1);

    await expect(h.c.badgeAdmin.revoke(ADMIN, A, skill.id, REASON)).rejects.toMatchObject({ statusCode: 409 });
    await h.c.badgeAdmin.restore(ADMIN, A, skill.id, "Rà soát lại: hợp lệ, khôi phục");
    expect((await h.badges.find(A, skill.id))?.revokedAt).toBeNull();
    await expect(h.c.badgeAdmin.restore(ADMIN, A, skill.id, "Rà soát lại: hợp lệ, khôi phục")).rejects.toMatchObject({ errorCode: "SKILL_004" });
    await expect(h.c.badgeAdmin.revoke(ADMIN, newObjectId(), skill.id, REASON)).rejects.toMatchObject({ errorCode: "SKILL_003" });
    expect(h.audit.records.map((r) => r.action)).toEqual(["skill.revoke", "skill.restore"]);
  });

  it("bật kỹ năng / đổi tiêu chí dễ hơn → đánh giá lại cấp cho người đã đủ; đối soát dựng lại tiến độ từ credit", async () => {
    const skill = await addSkill(h, { isActive: false, criteria: { requiredTasksDone: 3 } });
    await doneTasks(3);
    expect(await h.badges.find(A, skill.id)).toBeNull();
    await h.c.admin.setActive(ADMIN, skill.id, true, "Bật kỹ năng sau khi xem trước");
    expect(await h.c.reconcile.reevaluateSkill(skill.id)).toBe(1);

    const other = await addSkill(h, { code: "nodejs", labels: ["nodejs"], criteria: { requiredTasksDone: 1 } });
    await h.progress.overwrite({ userId: A, skillId: other.id, tasksDone: 99, storyPointsX10: 0, reviewScoreSumX10: 0, reviewScoreCount: 0, lastTaskAt: null });
    const r = await h.c.reconcile.nightly();
    expect(r.fixed).toBeGreaterThanOrEqual(1);
    expect((await h.progress.find(A, other.id))?.tasksDone).toBe(0);
    h.config.reconcile = false;
    expect((await h.c.reconcile.nightly()).skipped).toBe(true);
  });

  it("xem trước (CR-27, in-memory): đủ / đã có / sẽ cấp theo tiêu chí CHƯA lưu", async () => {
    const skill = await addSkill(h, { isActive: false, criteria: { requiredTasksDone: 5 } });
    await doneTasks(2);
    expect(await h.c.preview.eligible(skill.id)).toMatchObject({ eligibleCount: 0, willGrant: 0 });
    expect(await h.c.preview.eligible(skill.id, { requiredTasksDone: 2, requireReview: false })).toMatchObject({ eligibleCount: 1, alreadyHolding: 0, willGrant: 1, sampleUserIds: [A] });
    await expect(h.c.preview.eligible(skill.id, { requiredTasksDone: 0 })).rejects.toMatchObject({ errorCode: "SKILL_002" });
    expect(toStoredCriteria({ requiredTasksDone: 2, requireReview: false }).requiredTasksDone).toBe(2);
  });
});
