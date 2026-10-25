import { newObjectId } from "../../../core/utils/object-id";
import { taskCompletedSchema, taskReopenedSchema } from "../../../shared/events/domain-events";
import { completedEvent, reopenedEvent } from "../../projects/events/task-event.factory";
import type { Task } from "../../projects/entities/task.interface";
import { addSkill, buildHarness, completed, WS, type Harness } from "./support/harness";

const OWNER = newObjectId();
const TEAMMATE = newObjectId();
const OUTSIDER = newObjectId();
const user = (id: string, role = "user") => ({ id, email: `${id}@e.com`, role });

let h: Harness;
let skillId: string;

beforeEach(async () => {
  h = buildHarness();
  skillId = (await addSkill(h, { criteria: { requiredTasksDone: 1 } })).id;
  const t = completed(h, { assignees: [OWNER] });
  h.source.taskRefs.set(t.taskId, { id: t.taskId, title: "Trang đăng nhập dự án bí mật", workspaceId: WS });
  h.source.wsNames.set(WS, "Nhóm Alpha");
  h.source.memberships.set(OWNER, [WS]);
  h.source.memberships.set(TEAMMATE, [WS]);
  await h.c.progressService.onTaskCompleted(t);
});

describe("SkillVisibilityService + SkillQueryService — ai xem được gì (README §6)", () => {
  it("CR-26: người ngoài nhóm + proofTitles=false → không tiêu đề task, không tên nhóm", async () => {
    // Người ngoài được xem huy hiệu nhờ luật cắm thêm (vd nhà tuyển dụng p6-08) — minh chứng vẫn phải ẩn.
    const { registerSkillViewerRule } = await import("../services/skill-visibility.service");
    registerSkillViewerRule("test.outsider", async ({ viewerId }) => viewerId === OUTSIDER);
    const proof = await h.c.query.proof(user(OUTSIDER), OWNER, skillId);
    expect(proof.tasks).toHaveLength(1);
    expect(proof.tasks[0]).toMatchObject({ title: null, workspaceName: null, storyPoints: 5 });
    expect(JSON.stringify(proof)).not.toContain("bí mật");
    registerSkillViewerRule("test.outsider", async () => false);
  });

  it("proofTitles=true → người ngoài thấy tiêu đề nhưng KHÔNG thấy tên nhóm; thành viên cùng nhóm thấy cả hai", async () => {
    await h.c.profile.updateVisibility(OWNER, { showSkills: true, proofTitles: true, showContribution: false, showQuiz: false });
    const byAdmin = await h.c.query.proof(user(OUTSIDER, "admin"), OWNER, skillId);
    expect(byAdmin.tasks[0]).toMatchObject({ title: "Trang đăng nhập dự án bí mật", workspaceName: null });
    const byTeammate = await h.c.query.proof(user(TEAMMATE), OWNER, skillId);
    expect(byTeammate.tasks[0]).toMatchObject({ title: "Trang đăng nhập dự án bí mật", workspaceName: "Nhóm Alpha" });
  });

  it("huy hiệu người khác: cùng nhóm + showSkills → thấy; tắt showSkills / người ngoài → 404", async () => {
    expect(await h.c.query.userBadges(user(TEAMMATE), OWNER)).toHaveLength(1);
    await expect(h.c.query.userBadges(user(OUTSIDER), OWNER)).rejects.toMatchObject({ statusCode: 404 });
    await h.c.profile.updateVisibility(OWNER, { showSkills: false, proofTitles: false, showContribution: false, showQuiz: false });
    await expect(h.c.query.userBadges(user(TEAMMATE), OWNER)).rejects.toMatchObject({ statusCode: 404 });
    expect(await h.c.query.userBadges(user(OWNER), OWNER)).toHaveLength(1);
    expect(await h.c.query.userBadges(user(OUTSIDER, "manager"), OWNER)).toHaveLength(1);
  });

  it("huy hiệu bị thu hồi chỉ chính chủ thấy (câu trung tính), người khác 404", async () => {
    await h.c.badgeAdmin.revoke(user(newObjectId(), "admin"), OWNER, skillId, "Gắn nhãn không đúng thực tế công việc");
    const mine = await h.c.query.myBadges(OWNER);
    expect(mine[0]).toMatchObject({ revoked: true, revokedNotice: "Huy hiệu đã được thu hồi sau rà soát" });
    expect(JSON.stringify(mine)).not.toContain("Gắn nhãn");
    expect(await h.c.query.userBadges(user(TEAMMATE), OWNER)).toEqual([]);
    await expect(h.c.query.proof(user(TEAMMATE), OWNER, skillId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("admin proof: chỉ id rút gọn, không tiêu đề", async () => {
    const p = await h.c.query.adminProof(OWNER, skillId);
    expect(p.tasks[0].taskRef).toMatch(/^#[0-9a-f]{6}$/);
    expect(JSON.stringify(p)).not.toContain("bí mật");
  });

  it("PUT visibility giữ appearInOthersPortfolios khi body không gửi (p6-07)", async () => {
    await h.c.profile.updateVisibility(OWNER, { showSkills: true, proofTitles: false, showContribution: false, showQuiz: false, appearInOthersPortfolios: true });
    const next = await h.c.profile.updateVisibility(OWNER, { showSkills: false, proofTitles: false, showContribution: false, showQuiz: true });
    expect(next.visibility).toEqual({ showSkills: false, proofTitles: false, showContribution: false, showQuiz: true, appearInOthersPortfolios: true });
  });
});

describe("hợp đồng sự kiện p3-02 → p6-06 (việc #1)", () => {
  const task = {
    id: newObjectId(),
    boardId: newObjectId(),
    workspaceId: WS,
    assigneeIds: [OWNER],
    storyPoints: 3,
    dueDate: null,
    completedAt: new Date(),
    completionCount: 2,
    createdAt: new Date(Date.now() - 1000),
  } as unknown as Task;

  it("payload completedEvent/reopenedEvent của producer khớp schema Zod chung", () => {
    const done = completedEvent(task, OWNER, ["ReactJS"], { enabled: true, approved: true, roundId: newObjectId(), autoApproved: false, waived: false }).payload;
    expect(taskCompletedSchema.safeParse(done).success).toBe(true);
    expect(taskReopenedSchema.safeParse(reopenedEvent(task, OWNER, new Date()).payload).success).toBe(true);
    expect(taskCompletedSchema.safeParse({ ...done, labelNames: undefined }).success).toBe(false);
  });
});
