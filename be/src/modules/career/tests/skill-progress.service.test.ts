import { newObjectId } from "../../../core/utils/object-id";
import { addSkill, buildHarness, completed, reopened, type Harness } from "./support/harness";

const A = newObjectId();
const B = newObjectId();
const C = newObjectId();

let h: Harness;
beforeEach(() => {
  h = buildHarness();
});

const progressOf = (userId: string, skillId: string) => h.progress.find(userId, skillId);

describe("SkillProgressService — tiến độ tăng dần từ task.completed/reopened", () => {
  it("CR-21: nhãn 'Node.js', 'node js', 'NODEJS' ở ba thẻ đều tính cho kỹ năng Node.js", async () => {
    const skill = await addSkill(h, { code: "nodejs", labels: ["nodejs"], criteria: { requiredTasksDone: 10 } });
    for (const label of ["Node.js", "node js", "NODEJS"]) await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A], labels: [label] }));
    expect((await progressOf(A, skill.id))?.tasksDone).toBe(3);
  });

  it("CR-23: thẻ 2 người, 5 điểm → mỗi người +1 task, 2,5 điểm (×10 = 25); 3 người làm tròn", async () => {
    const skill = await addSkill(h, { criteria: { requiredTasksDone: 10 } });
    await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A, B], sp: 5 }));
    expect(await progressOf(A, skill.id)).toMatchObject({ tasksDone: 1, storyPointsX10: 25 });
    expect(await progressOf(B, skill.id)).toMatchObject({ tasksDone: 1, storyPointsX10: 25 });
    await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A, B, C], sp: 5 }));
    expect((await progressOf(C, skill.id))?.storyPointsX10).toBe(17);
  });

  it("CR-22: bảng bật chấm chéo, thẻ Done khi lượt chấm CHƯA APPROVED → không tính; APPROVED → tính kèm điểm review của lượt", async () => {
    const skill = await addSkill(h, { criteria: { requiredTasksDone: 10 } });
    expect(await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A], review: { enabled: true, approved: false } }))).toBe(0);
    expect(await progressOf(A, skill.id)).toBeNull();
    const roundId = newObjectId();
    h.source.roundAvg.set(roundId, 85);
    expect(await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A], review: { enabled: true, approved: true, roundId } }))).toBe(1);
    expect(await progressOf(A, skill.id)).toMatchObject({ tasksDone: 1, reviewScoreSumX10: 85, reviewScoreCount: 1 });
  });

  it("chống farm: không story points / < ngưỡng cấu hình / không người làm / không nhãn khớp → không tính", async () => {
    await addSkill(h, { criteria: { requiredTasksDone: 10 } });
    h.config.minSp = 2;
    expect(await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A], sp: null }))).toBe(0);
    expect(await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A], sp: 1 }))).toBe(0);
    expect(await h.c.progressService.onTaskCompleted(completed(h, { assignees: [], sp: 5 }))).toBe(0);
    expect(await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A], labels: ["Backend"] }))).toBe(0);
    expect(h.credits.rows.size).toBe(0);
  });

  it("payload sai hợp đồng → bỏ qua (0), không ném lỗi làm hỏng worker", async () => {
    await addSkill(h);
    await expect(h.c.progressService.onTaskCompleted({ event: "task.completed", taskId: "x" })).resolves.toBe(0);
    await expect(h.c.progressService.onTaskReopened({ nope: true })).resolves.toBe(0);
  });

  it("CR-02: cùng sự kiện chạy lại + Done → mở lại → Done lần nữa KHÔNG đếm 2 lần", async () => {
    const skill = await addSkill(h, { criteria: { requiredTasksDone: 10 } });
    const first = completed(h, { assignees: [A], sp: 4 });
    await h.c.progressService.onTaskCompleted(first);
    await h.c.progressService.onTaskCompleted(first);
    expect(await progressOf(A, skill.id)).toMatchObject({ tasksDone: 1, storyPointsX10: 40 });

    await h.c.progressService.onTaskReopened(reopened(h, first.taskId, 1, [A]));
    expect(await progressOf(A, skill.id)).toMatchObject({ tasksDone: 0, storyPointsX10: 0 });
    await h.c.progressService.onTaskCompleted(completed(h, { taskId: first.taskId, n: 2, assignees: [A], sp: 6 }));
    expect(await progressOf(A, skill.id)).toMatchObject({ tasksDone: 1, storyPointsX10: 60 });
    expect(h.credits.rows.size).toBe(1);
  });

  it("sự kiện tới trễ: task.completed c1 tới SAU khi thẻ đã bị mở lại → không tính; c1 cũ tới sau c2 → bỏ", async () => {
    const skill = await addSkill(h, { criteria: { requiredTasksDone: 10 } });
    const late = completed(h, { assignees: [A] });
    reopened(h, late.taskId, 1, [A]);
    expect(await h.c.progressService.onTaskCompleted(late)).toBe(0);
    const c2 = completed(h, { taskId: late.taskId, n: 2, assignees: [A] });
    await h.c.progressService.onTaskCompleted(c2);
    expect(await h.c.progressService.onTaskCompleted({ ...late, completionCount: 1 })).toBe(0);
    expect((await progressOf(A, skill.id))?.tasksDone).toBe(1);
  });

  it("kỹ năng đang TẮT vẫn ghi tiến độ (xem trước CR-27) nhưng KHÔNG cấp huy hiệu", async () => {
    const skill = await addSkill(h, { isActive: false, criteria: { requiredTasksDone: 1 } });
    await h.c.progressService.onTaskCompleted(completed(h, { assignees: [A] }));
    expect((await progressOf(A, skill.id))?.tasksDone).toBe(1);
    expect(await h.badges.find(A, skill.id)).toBeNull();
  });
});
