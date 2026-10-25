import type { PatchTaskDto } from "../dtos";
import type { Task } from "../entities/task.interface";
import { diffTask } from "../services/task-diff";

const U1 = "a".repeat(24);
const U2 = "b".repeat(24);
const U3 = "c".repeat(24);
const U4 = "d".repeat(24);

const task = (over: Partial<Task> = {}): Task => ({
  id: "t".repeat(24), boardId: "b".repeat(24), workspaceId: "w".repeat(24), columnId: "c_aaaaaaaa", columnKind: "TODO",
  position: "a0", title: "Tiêu đề", normalizedTitle: "tieu de", description: null, assigneeIds: [], labelIds: [],
  startDate: null, dueDate: null, storyPoints: null, checklist: [], checklistDone: 0, checklistTotal: 0, attachmentCount: 0,
  commentCount: 0, reviewState: "NONE", completedAt: null, completionCount: 0, createdBy: U1, clientTaskId: null, dueVersion: 0,
  deletedFromColumnId: null, deletedAt: null, deletedBy: null, version: 3,
  createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-01T00:00:00Z"), ...over,
});

const patch = (over: Partial<PatchTaskDto>): PatchTaskDto => ({ expectedVersion: 3, ...over });

describe("diffTask", () => {
  it("đổi 3 trường (tiêu đề + hạn + người làm) → 3 activity, đúng thứ tự và đúng loại", () => {
    const due = new Date("2026-10-01T10:00:00Z");
    const diff = diffTask(task(), patch({ title: "Tên mới", dueDate: due, assigneeIds: [U2] }));

    expect(diff.activities.map((a) => a.type)).toEqual(["RENAMED", "ASSIGNED", "DUE_CHANGED"]);
    expect(diff.activities[0]).toMatchObject({ before: { title: "Tiêu đề" }, after: { title: "Tên mới" } });
    expect(diff.activities[2]).toMatchObject({ before: { dueDate: null }, after: { dueDate: due.toISOString() } });
    expect(diff.changed).toEqual(["title", "assignees", "dueDate"]);
    expect(diff.set).toMatchObject({ title: "Tên mới", normalizedTitle: "ten moi", assigneeIds: [U2], dueDate: due, dueVersion: 1 });
    expect(diff.dueChanged).toBe(true);
  });

  it("người làm: thêm 2 bớt 1 → 3 activity (mỗi người một bản ghi), theo dõi người mới/bị gỡ", () => {
    const diff = diffTask(task({ assigneeIds: [U1, U2] }), patch({ assigneeIds: [U2, U3, U4] }));

    expect(diff.activities.map((a) => [a.type, a.after?.["userId"] ?? a.before?.["userId"]])).toEqual([
      ["ASSIGNED", U3], ["ASSIGNED", U4], ["UNASSIGNED", U1],
    ]);
    expect(diff.addedAssigneeIds).toEqual([U3, U4]);
    expect(diff.removedAssigneeIds).toEqual([U1]);
    expect(diff.set.assigneeIds).toEqual([U2, U3, U4]);
  });

  it("chỉ đổi THỨ TỰ người làm/nhãn hoặc gửi lại đúng giá trị hiện tại → không đổi gì (set rỗng, 0 activity)", () => {
    const diff = diffTask(
      task({ assigneeIds: [U1, U2], labelIds: [U3, U4], title: "Tiêu đề", storyPoints: 5, description: "abc" }),
      patch({ assigneeIds: [U2, U1], labelIds: [U4, U3], title: "Tiêu đề", storyPoints: 5, description: "abc" })
    );
    expect(diff.set).toEqual({});
    expect(diff.activities).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("mô tả: activity CHỈ ghi độ dài (không toàn văn); rỗng/toàn khoảng trắng ≡ null; xoá mô tả cũng tính là đổi", () => {
    const set = diffTask(task(), patch({ description: "Nội dung **riêng tư** dài" }));
    expect(set.activities).toEqual([{ type: "DESCRIPTION", before: { length: 0 }, after: { length: 25 } }]);
    expect(JSON.stringify(set.activities)).not.toContain("riêng tư");

    expect(diffTask(task(), patch({ description: "   \n " })).set).toEqual({}); // null → null: không đổi
    const cleared = diffTask(task({ description: "abc" }), patch({ description: null }));
    expect(cleared.set).toEqual({ description: null });
    expect(cleared.activities[0]).toMatchObject({ type: "DESCRIPTION", before: { length: 3 }, after: { length: 0 } });
  });

  it("mô tả giữ NGUYÊN thụt lề/ký tự markdown (không trim) — chỉ mô tả rỗng mới thành null", () => {
    const code = "```ts\n  if (a < b && c > d) {}\n```";
    expect(diffTask(task(), patch({ description: code })).set.description).toBe(code);
  });

  it("hạn: đổi → dueVersion +1 (khoá job nhắc); xoá hạn (null) cũng +1; cùng thời điểm → không đổi", () => {
    const due = new Date("2026-10-01T10:00:00Z");
    expect(diffTask(task({ dueDate: due, dueVersion: 4 }), patch({ dueDate: new Date("2026-10-02T10:00:00Z") })).set.dueVersion).toBe(5);
    const cleared = diffTask(task({ dueDate: due, dueVersion: 4 }), patch({ dueDate: null }));
    expect(cleared.set).toEqual({ dueDate: null, dueVersion: 5 });
    expect(cleared.dueChanged).toBe(true);
    expect(diffTask(task({ dueDate: due }), patch({ dueDate: new Date(due.getTime()) })).set).toEqual({});
  });

  it("ngày bắt đầu / điểm / nhãn → START_CHANGED / POINTS / LABELS với before/after; điểm 0 khác null", () => {
    const start = new Date("2026-09-10T00:00:00Z");
    const diff = diffTask(task({ storyPoints: null }), patch({ startDate: start, storyPoints: 0, labelIds: [U3] }));
    expect(diff.activities.map((a) => a.type)).toEqual(["LABELS", "START_CHANGED", "POINTS"]);
    expect(diff.activities[2]).toMatchObject({ before: { storyPoints: null }, after: { storyPoints: 0 } });
    expect(diff.changed).toEqual(["labels", "startDate", "storyPoints"]);
  });
});
