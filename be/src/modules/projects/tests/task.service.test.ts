// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { TaskAssignedPayload, TaskCompletedPayload, TaskCreatedPayload, TaskDueChangedPayload } from "../events/project-events";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let member: AuthUser;
let board: Board;

beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  member = h.addUser("MEMBER");
  board = await h.createBoard(owner);
});

const create = (user: AuthUser, dto: Partial<Parameters<ServiceHarness["taskService"]["create"]>[2]> = {}) =>
  h.taskService.create(user, board.id, { title: "Thẻ mới", assigneeIds: [], labelIds: [], ...dto });

const catchError = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};

describe("task.service.create", () => {
  it("mặc định vào cột TODO đầu tiên, cuối cột; ghi CREATED + outbox task.created (không có tiêu đề)", async () => {
    const a = (await create(member, { title: "A" })).task;
    const b = (await create(member, { title: "B" })).task;

    expect(a.columnKind).toBe("TODO");
    expect(a.position < b.position).toBe(true);
    expect(a).toMatchObject({ version: 1, completedAt: null, isOverdue: false, assignees: [] });
    expect(h.activities.activities.map((x) => x.type)).toEqual(["CREATED", "CREATED"]);

    const created = h.outbox.events.find((e) => e.dedupeKey === `task.created:task:${a.id}`)!;
    expect(created.payload as unknown as TaskCreatedPayload).toMatchObject({ event: "task.created", taskId: a.id, createdBy: member.id, assigneeIds: [] });
    expect(JSON.stringify(created.payload)).not.toContain('"A"');
  });

  it("ghi null tường minh cho mọi trường lọc sau này (deletedAt/completedAt/dueDate…)", async () => {
    const { task } = await create(member);
    const stored = await h.tasks.findById(task.id);
    expect(stored).toMatchObject({ deletedAt: null, completedAt: null, dueDate: null, startDate: null, storyPoints: null });
  });

  it("afterTaskId: chèn NGAY SAU thẻ đó; thẻ không thuộc cột → 400", async () => {
    const a = (await create(member, { title: "A" })).task;
    await create(member, { title: "B" });
    const c = (await create(member, { title: "C", afterTaskId: a.id })).task;
    expect((await h.tasks.listColumnAll(board.id, c.columnId)).map((t) => t.title)).toEqual(["A", "C", "B"]);

    const doing = h.columnId(board, "IN_PROGRESS");
    const err = await catchError(create(member, { columnId: doing, afterTaskId: a.id }));
    expect(err).toMatchObject({ statusCode: 400, errorCode: "VAL_001" });
  });

  it("cột không tồn tại → TASK_001; bảng đủ thẻ → TASK_010 (409)", async () => {
    expect(await catchError(create(member, { columnId: "c_zzzzzzzz" }))).toMatchObject({ statusCode: 400, errorCode: "TASK_001" });
    h.config = { ...h.config, perBoardMax: 2 };
    await create(member, { title: "1" });
    await create(member, { title: "2" });
    expect(await catchError(create(member, { title: "3" }))).toMatchObject({ statusCode: 409, errorCode: "TASK_010" });
  });

  it("người làm phải là thành viên ACTIVE không phải GUEST; nhãn phải thuộc bảng → 400 kèm id sai", async () => {
    const guest = h.addUser("GUEST");
    const stranger = "1".repeat(24);
    const foreignLabel = "2".repeat(24);
    const err = await catchError(create(member, { assigneeIds: [member.id, guest.id, stranger], labelIds: [foreignLabel] }));

    expect(err).toMatchObject({ statusCode: 400, errorCode: "VAL_001" });
    expect(err.details).toEqual({ invalidAssigneeIds: [guest.id, stranger], invalidLabelIds: [foreignLabel] });
    expect(h.tasks.tasks.size).toBe(0);
  });

  it("người làm khác người tạo → outbox task.assigned (loại chính người tạo); có hạn → task.due-changed d1", async () => {
    const other = h.addUser("MEMBER");
    const due = new Date(Date.now() + 3 * 86_400_000);
    const { task } = await create(member, { assigneeIds: [member.id, other.id], dueDate: due });

    const assigned = h.outbox.events.find((e) => e.type === "task.assigned")!;
    expect(assigned.payload as unknown as TaskAssignedPayload).toMatchObject({ assigneeIds: [other.id], actorId: member.id });
    const dueEvt = h.outbox.events.find((e) => e.type === "task.due-changed")!;
    expect(dueEvt.dedupeKey).toBe(`task.due-changed:task:${task.id}:d1`);
    expect(dueEvt.payload as unknown as TaskDueChangedPayload).toMatchObject({ oldDue: null, newDue: due.toISOString(), dueVersion: 1 });
    expect((await h.tasks.findById(task.id))?.dueVersion).toBe(1);
  });

  it("chỉ tự giao cho mình → không phát task.assigned; không hạn → dueVersion 0, không task.due-changed", async () => {
    await create(member, { assigneeIds: [member.id] });
    expect(h.outbox.events.map((e) => e.type)).toEqual(["task.created"]);
  });

  it("clientTaskId idempotent: lần 2 trả lại thẻ cũ (created=false), không tạo trùng, không thêm outbox", async () => {
    const first = await create(member, { clientTaskId: "client-task-0001" });
    const events = h.outbox.events.length;
    const second = await create(member, { clientTaskId: "client-task-0001", title: "Tên khác" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.task.id).toBe(first.task.id);
    expect(h.tasks.tasks.size).toBe(1);
    expect(h.outbox.events).toHaveLength(events);
    // Người khác dùng cùng clientTaskId là thẻ khác.
    expect((await create(owner, { clientTaskId: "client-task-0001" })).created).toBe(true);
  });

  it("tạo thẳng vào cột DONE = một lần hoàn thành (completedAt, completionCount 1, task.completed c1)", async () => {
    const { task } = await create(member, { columnId: h.columnId(board, "DONE") });
    expect(task.completedAt).not.toBeNull();
    const stored = await h.tasks.findById(task.id);
    expect(stored?.completionCount).toBe(1);
    const evt = h.outbox.events.find((e) => e.type === "task.completed")!;
    expect(evt.dedupeKey).toBe(`task.completed:task:${task.id}:c1`);
    expect((evt.payload as unknown as TaskCompletedPayload).completionCount).toBe(1);
  });

  it("phát task:created kèm clientMutationId; GUEST → 404, bảng lưu trữ → 403", async () => {
    await create(member, { clientMutationId: "mutation-abcdef01" });
    expect(h.emitter.of("task:created")[0].payload).toMatchObject({ actorId: member.id, clientMutationId: "mutation-abcdef01" });

    const guest = h.addUser("GUEST");
    expect(await catchError(create(guest))).toMatchObject({ statusCode: 404, errorCode: "PERM_404" });
    await h.boardService.archive(owner, board.id);
    expect(await catchError(create(member))).toMatchObject({ statusCode: 403 });
  });
});

describe("task.service.list", () => {
  it("nhóm theo cột đúng thứ tự cột + position; hasMore khi vượt limitPerColumn", async () => {
    for (const title of ["A", "B", "C"]) await create(member, { title });
    await create(member, { title: "D", columnId: h.columnId(board, "IN_PROGRESS") });

    const res = await h.taskService.list(member, board.id, { limitPerColumn: 2 });
    expect(res.columns.map((c) => c.columnId)).toEqual(board.columns.map((c) => c.id));
    expect(res.columns[0].tasks.map((t) => t.title)).toEqual(["A", "B"]);
    expect(res.columns[0].hasMore).toBe(true);
    expect(res.columns[1].tasks.map((t) => t.title)).toEqual(["D"]);
    expect(res.columns[1].hasMore).toBe(false);
  });

  it("lọc: assigneeId=me, labelId, overdue (bỏ qua thẻ ở DONE), q không dấu, columnId", async () => {
    const label = (await h.labels.create({ boardId: board.id, workspaceId: h.workspaceId, name: "Gấp", normalizedName: "gap", color: "red" }))!;
    const other = h.addUser("MEMBER");
    await create(member, { title: "Viết báo cáo", assigneeIds: [member.id], labelIds: [label.id] });
    await create(member, { title: "Nộp bài", assigneeIds: [other.id], dueDate: new Date(Date.now() - 86_400_000) });
    await create(member, { title: "Đã xong trễ", dueDate: new Date(Date.now() - 86_400_000), columnId: h.columnId(board, "DONE") });
    const titles = async (q: Partial<Parameters<ServiceHarness["taskService"]["list"]>[2]>) =>
      (await h.taskService.list(member, board.id, { limitPerColumn: 100, ...q })).columns.flatMap((c) => c.tasks.map((t) => t.title));

    expect(await titles({ assigneeId: "me" })).toEqual(["Viết báo cáo"]);
    expect(await titles({ labelId: label.id })).toEqual(["Viết báo cáo"]);
    expect(await titles({ overdue: true })).toEqual(["Nộp bài"]);
    expect(await titles({ q: "bao cao" })).toEqual(["Viết báo cáo"]);
    expect(await titles({ columnId: h.columnId(board, "DONE") })).toEqual(["Đã xong trễ"]);
  });

  it("assignees có tên người dùng (một lần tra), người không còn tồn tại vẫn giữ chỗ", async () => {
    const { task } = await create(member, { assigneeIds: [member.id] });
    h.directory.users.delete(member.id);
    const res = await h.taskService.list(member, board.id, { limitPerColumn: 100 });
    expect(res.columns[0].tasks[0].assignees).toEqual([{ id: member.id, name: "", avatarUrl: null }]);
    expect(task.id).toBe(res.columns[0].tasks[0].id);
  });

  it("GUEST → 404", async () => {
    const guest = h.addUser("GUEST");
    expect(await catchError(h.taskService.list(guest, board.id, { limitPerColumn: 10 }))).toMatchObject({ statusCode: 404 });
  });
});
