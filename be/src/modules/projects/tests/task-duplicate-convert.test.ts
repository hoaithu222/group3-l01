import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import { TaskConvertService, convertClientTaskId } from "../services/task-convert.service";
import { TaskDuplicateService, copyTitle } from "../services/task-duplicate.service";
import { defaultBoardReview } from "../services/review/review-config.schema";
import { ReviewHarness } from "./support/review-harness";

/** `ReviewHarness` (mở rộng `ServiceHarness`) để một ca bật chấm chéo trên bảng; các ca khác dùng bảng chưa bật (review = null). */
let h: ReviewHarness;
let owner: AuthUser;
let member: AuthUser;
let other: AuthUser;
let guest: AuthUser;
let board: Board;
let duplicate: TaskDuplicateService;
let convert: TaskConvertService;

const outbox = (type: string) => h.outbox.events.filter((e) => e.type === type);
const live = (): Task[] => [...h.tasks.tasks.values()].filter((t) => !t.deletedAt);
const fresh = async (id: string): Promise<Task> => (await h.tasks.findById(id)) as Task;

beforeEach(async () => {
  h = new ReviewHarness();
  owner = h.addUser("OWNER");
  member = h.addUser("MEMBER");
  other = h.addUser("MEMBER");
  guest = h.addUser("GUEST");
  board = await h.createBoard(owner);
  duplicate = new TaskDuplicateService({ access: h.access, labels: h.labels, directory: h.directory }, h.taskService);
  convert = new TaskConvertService(
    { access: h.access, tasks: h.tasks, checklist: h.checklistRepo, activityRepo: h.activities, emitter: h.emitter, directory: h.directory, clock: h.clock },
    h.taskService
  );
});

/** Thẻ giàu dữ liệu: mô tả, ngày, điểm, nhãn, người làm, checklist (một mục đã tick). */
async function richTask(columnKind: Task["columnKind"] = "TODO"): Promise<Task> {
  const label = await h.labels.create({ boardId: board.id, workspaceId: h.workspaceId, name: "Gấp", normalizedName: "gap", color: "red" });
  const t = await h.addTask(member, board, "Viết báo cáo cuối kỳ", { columnId: h.columnId(board, columnKind === "DONE" ? "TODO" : columnKind) });
  const items = [
    { id: "0".repeat(23) + "1", text: "Chương 1", done: true, doneBy: member.id, doneAt: new Date(), order: 1024 },
    { id: "0".repeat(23) + "2", text: "Chương 2", done: false, doneBy: null, doneAt: null, order: 2048 },
  ];
  h.setTask(t.id, {
    description: "Nội dung **chi tiết**",
    startDate: new Date("2026-10-01T02:00:00Z"),
    dueDate: new Date("2026-10-10T10:00:00Z"),
    dueVersion: 1,
    storyPoints: 5,
    labelIds: [label!.id],
    assigneeIds: [other.id],
    checklist: items,
    checklistTotal: 2,
    checklistDone: 1,
    attachmentCount: 3,
    commentCount: 4,
    ...(columnKind === "DONE" && { columnId: h.columnId(board, "DONE"), columnKind: "DONE" as const, completedAt: new Date(), completionCount: 1 }),
  });
  return fresh(t.id);
}

describe("TaskDuplicateService — sao chép thẻ (p3-03 P1)", () => {
  it("mặc định: sao chép mô tả/ngày/điểm/nhãn/checklist (bỏ tick, id mới); KHÔNG người làm/đính kèm/bình luận/hoàn thành; ngay SAU thẻ gốc; title '(bản sao)'", async () => {
    const src = await richTask();
    const sibling = await h.addTask(member, board, "Thẻ liền sau");
    h.outbox.events.length = 0;
    h.emitter.events.length = 0;

    const res = await duplicate.duplicate(member, src.id, { keepAssignees: false, keepChecklist: true });

    expect(res.created).toBe(true);
    const copy = await fresh(res.task.id);
    expect(copy).toMatchObject({
      title: "Viết báo cáo cuối kỳ (bản sao)",
      description: "Nội dung **chi tiết**",
      storyPoints: 5,
      labelIds: src.labelIds,
      assigneeIds: [],
      columnId: src.columnId,
      columnKind: "TODO",
      createdBy: member.id,
      attachmentCount: 0,
      commentCount: 0,
      completedAt: null,
      completionCount: 0,
      reviewState: "NONE",
      version: 1,
      checklistTotal: 2,
      checklistDone: 0,
    });
    expect(copy.startDate?.toISOString()).toBe("2026-10-01T02:00:00.000Z");
    expect(copy.dueDate?.toISOString()).toBe("2026-10-10T10:00:00.000Z");
    expect(copy.checklist.map((i) => [i.text, i.done, i.doneBy, i.order])).toEqual([["Chương 1", false, null, 1024], ["Chương 2", false, null, 2048]]);
    expect(copy.checklist.map((i) => i.id)).not.toEqual(src.checklist.map((i) => i.id));
    // Vị trí: giữa thẻ gốc và thẻ liền sau.
    expect(src.position < copy.position && copy.position < sibling.position).toBe(true);
    // Thẻ gốc không bị đổi.
    expect(await fresh(src.id)).toMatchObject({ version: src.version, checklistDone: 1, attachmentCount: 3 });
    // Sự kiện: tạo + hạn (nhắc hạn tính theo dueVersion 1); KHÔNG completed/assigned.
    expect(outbox("task.created")).toHaveLength(1);
    expect(outbox("task.due-changed")).toHaveLength(1);
    expect(outbox("task.completed")).toHaveLength(0);
    expect(outbox("task.assigned")).toHaveLength(0);
    expect(h.emitter.of("task:created")).toHaveLength(1);
  });

  it("keepAssignees giữ người làm còn hợp lệ (người đã rời nhóm bị bỏ, không lỗi); keepChecklist=false bỏ checklist; title/columnId tuỳ chọn", async () => {
    const src = await richTask();
    h.setTask(src.id, { assigneeIds: [other.id, member.id] });
    h.directory.members.delete(other.id);
    const res = await duplicate.duplicate(member, src.id, { keepAssignees: true, keepChecklist: false, title: "Bản làm lại", columnId: h.columnId(board, "IN_PROGRESS") });
    const copy = await fresh(res.task.id);
    expect(copy).toMatchObject({ title: "Bản làm lại", assigneeIds: [member.id], checklistTotal: 0, columnKind: "IN_PROGRESS" });
    expect(copy.checklist).toEqual([]);
    expect(outbox("task.assigned")).toHaveLength(0); // giao cho chính người sao chép: không tự thông báo
  });

  it("thẻ gốc ở DONE (hoặc REVIEW) → bản sao vào cột TODO đầu tiên, KHÔNG phải một lần hoàn thành mới; thẻ ở IN_PROGRESS → cùng cột", async () => {
    const done = await richTask("DONE");
    h.outbox.events.length = 0;
    const res = await duplicate.duplicate(member, done.id, { keepAssignees: false, keepChecklist: true });
    expect(await fresh(res.task.id)).toMatchObject({ columnKind: "TODO", completedAt: null, completionCount: 0 });
    expect(outbox("task.completed")).toHaveLength(0);

    const inProgress = await h.addTask(member, board, "Đang làm", { columnId: h.columnId(board, "IN_PROGRESS") });
    const res2 = await duplicate.duplicate(member, inProgress.id, { keepAssignees: false, keepChecklist: true });
    expect(await fresh(res2.task.id)).toMatchObject({ columnKind: "IN_PROGRESS", columnId: inProgress.columnId });
  });

  it("chọn cột DONE khi bảng bật chấm chéo → 409 TASK_002 (cùng chính sách tạo thẻ)", async () => {
    const src = await richTask();
    h.setBoardReview(board.id, defaultBoardReview(2, true));
    await expect(duplicate.duplicate(member, src.id, { keepAssignees: false, keepChecklist: true, columnId: h.columnId(board, "DONE") })).rejects.toMatchObject({ statusCode: 409, errorCode: "TASK_002" });
  });

  it("replay cùng clientTaskId → thẻ cũ (created:false), không tạo thêm; đủ trần số thẻ → TASK_010", async () => {
    const src = await richTask();
    const first = await duplicate.duplicate(member, src.id, { keepAssignees: false, keepChecklist: true, clientTaskId: "dup-client-key-1" });
    const before = live().length;
    const again = await duplicate.duplicate(member, src.id, { keepAssignees: false, keepChecklist: true, clientTaskId: "dup-client-key-1" });
    expect([again.created, again.task.id]).toEqual([false, first.task.id]);
    expect(live()).toHaveLength(before);

    h.config = { ...h.config, perBoardMax: live().length };
    await expect(duplicate.duplicate(member, src.id, { keepAssignees: false, keepChecklist: true })).rejects.toMatchObject({ statusCode: 409, errorCode: "TASK_010" });
  });

  it("quyền: GUEST/người ngoài → 404; bảng lưu trữ → 403; tiêu đề gốc rất dài được cắt vừa trần", async () => {
    const src = await richTask();
    await expect(duplicate.duplicate(guest, src.id, { keepAssignees: false, keepChecklist: true })).rejects.toMatchObject({ statusCode: 404 });
    expect(copyTitle("x".repeat(LIMITS.task.titleMax)).length).toBe(LIMITS.task.titleMax);
    expect(copyTitle("Ngắn")).toBe("Ngắn (bản sao)");
    h.boards.boards.get(board.id)!.archivedAt = new Date();
    await expect(duplicate.duplicate(member, src.id, { keepAssignees: false, keepChecklist: true })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("TaskConvertService — chuyển mục checklist thành thẻ (p3-03 P1)", () => {
  it("mục bị GỠ khỏi checklist cha (bộ đếm đúng theo done) và thành thẻ mới ở TODO đầu (không người làm/nhãn/hạn); activity CHECKLIST_REMOVED kèm convertedTaskId; realtime", async () => {
    const parent = await richTask("IN_PROGRESS");
    h.outbox.events.length = 0;
    h.emitter.events.length = 0;

    const res = await convert.convert(member, parent.id, "0".repeat(23) + "2", {});

    expect(res.created).toBe(true);
    expect(res.source).toMatchObject({ taskId: parent.id, checklistTotal: 1, checklistDone: 1 });
    const card = await fresh(res.task.id);
    expect(card).toMatchObject({ title: "Chương 2", columnKind: "TODO", assigneeIds: [], labelIds: [], dueDate: null, createdBy: member.id, clientTaskId: convertClientTaskId("0".repeat(23) + "2") });
    expect((await fresh(parent.id)).checklist.map((i) => i.text)).toEqual(["Chương 1"]);
    const activity = h.activities.activities.find((a) => a.taskId === parent.id && a.type === "CHECKLIST_REMOVED");
    expect(activity).toMatchObject({ actorId: member.id, before: { itemId: "0".repeat(23) + "2", text: "Chương 2" }, after: { convertedTaskId: card.id } });
    expect(outbox("task.created")).toHaveLength(1);
    expect(h.emitter.of("task:created")).toHaveLength(1);
    expect(h.emitter.of("task:updated").some((e) => (e.payload as { changed: string[] }).changed.includes("checklist"))).toBe(true);
  });

  it("mục đã tick: gỡ khỏi bộ đếm done; chọn columnId tuỳ ý", async () => {
    const parent = await richTask();
    const res = await convert.convert(member, parent.id, "0".repeat(23) + "1", { columnId: h.columnId(board, "IN_PROGRESS") });
    expect(res.source).toMatchObject({ checklistTotal: 1, checklistDone: 0 });
    expect(await fresh(res.task.id)).toMatchObject({ title: "Chương 1", columnKind: "IN_PROGRESS" });
  });

  it("gọi lại (mất mạng) → 200 created:false với CHÍNH thẻ đã tạo, không tạo thêm; người KHÁC gọi mục đã biến mất → 404; mục lạ → 404", async () => {
    const parent = await richTask();
    const first = await convert.convert(member, parent.id, "0".repeat(23) + "2", {});
    const count = live().length;
    const again = await convert.convert(member, parent.id, "0".repeat(23) + "2", {});
    expect([again.created, again.task.id]).toEqual([false, first.task.id]);
    expect(live()).toHaveLength(count);
    await expect(convert.convert(other, parent.id, "0".repeat(23) + "2", {})).rejects.toMatchObject({ statusCode: 404 });
    await expect(convert.convert(member, parent.id, "f".repeat(24), {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("hai người cùng chuyển MỘT mục → đúng một thẻ mới (lệnh gỡ nguyên tử), người còn lại 404", async () => {
    const parent = await richTask();
    const results = await Promise.allSettled([
      convert.convert(member, parent.id, "0".repeat(23) + "2", {}),
      convert.convert(other, parent.id, "0".repeat(23) + "2", {}),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(live().filter((t) => t.title === "Chương 2")).toHaveLength(1);
  });

  it("tạo thẻ lỗi (bảng đủ thẻ) → mục được TRẢ VỀ checklist (chưa tick, đúng order), lỗi gốc được ném, không có thẻ mới, không activity", async () => {
    const parent = await richTask();
    h.config = { ...h.config, perBoardMax: live().length };
    await expect(convert.convert(member, parent.id, "0".repeat(23) + "1", {})).rejects.toMatchObject({ statusCode: 409, errorCode: "TASK_010" });
    const after = await fresh(parent.id);
    expect(after.checklist.map((i) => [i.text, i.done, i.order])).toEqual([["Chương 1", false, 1024], ["Chương 2", false, 2048]]);
    expect(after.checklistTotal).toBe(2);
    expect(h.activities.activities.some((a) => a.type === "CHECKLIST_REMOVED")).toBe(false);
  });

  it("quyền: GUEST/người ngoài → 404; bảng lưu trữ → 403 và mục KHÔNG bị gỡ", async () => {
    const parent = await richTask();
    await expect(convert.convert(guest, parent.id, "0".repeat(23) + "2", {})).rejects.toMatchObject({ statusCode: 404 });
    h.boards.boards.get(board.id)!.archivedAt = new Date();
    await expect(convert.convert(member, parent.id, "0".repeat(23) + "2", {})).rejects.toMatchObject({ statusCode: 403 });
    expect((await fresh(parent.id)).checklistTotal).toBe(2);
  });
});
