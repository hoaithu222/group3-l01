// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { TaskAssignedPayload, TaskDueChangedPayload } from "../events/project-events";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let admin: AuthUser;
let member: AuthUser;
let other: AuthUser;
let guest: AuthUser;
let board: Board;
let task: Task;

beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  admin = h.addUser("ADMIN");
  member = h.addUser("MEMBER");
  other = h.addUser("MEMBER");
  guest = h.addUser("GUEST");
  board = await h.createBoard(owner);
  task = await h.addTask(member, board, "Thẻ gốc");
});

const catchError = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};
const fresh = async () => (await h.tasks.findById(task.id)) as Task;
/** DTO đã qua Zod: `startDate`/`dueDate` là `Date` (test viết chuỗi ISO cho gọn rồi đổi ở đây). */
const revive = (dto: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(dto).map(([k, v]) => [k, (k === "startDate" || k === "dueDate") && typeof v === "string" ? new Date(v) : v]));
const patch = (user: AuthUser, dto: Record<string, unknown>) =>
  h.detailService.patch(user, task.id, { expectedVersion: task.version, ...revive(dto) } as Parameters<typeof h.detailService.patch>[2]);
const outboxOf = (type: string) => h.outbox.events.filter((e) => e.type === type && e.aggregateId === task.id);

describe("task-detail.service.get", () => {
  it("trả TaskDetailDto đủ trường + myPermissions do server tính (MEMBER sửa/bình luận/đính kèm; xoá thẻ của mình)", async () => {
    const dto = await h.detailService.get(member, task.id, {});
    expect(dto).toMatchObject({
      id: task.id, title: "Thẻ gốc", description: null, startDate: null, checklist: [], createdBy: member.id, labels: [], deletedAt: null,
      myPermissions: { edit: true, delete: true, comment: true, attach: true, restore: false },
    });
    const foreign = await h.detailService.get(other, task.id, {});
    expect(foreign.myPermissions).toMatchObject({ edit: true, delete: false, comment: true, attach: true }); // không xoá thẻ người khác
    expect((await h.detailService.get(admin, task.id, {})).myPermissions.delete).toBe(true);
  });

  it("GUEST/người ngoài → 404 trung tính; bảng đã lưu trữ → xem được nhưng mọi quyền ghi = false", async () => {
    expect((await catchError(h.detailService.get(guest, task.id, {}))).statusCode).toBe(404);
    expect((await catchError(h.detailService.get(userStranger(), task.id, {}))).statusCode).toBe(404);
    await h.boardService.archive(owner, board.id);
    const dto = await h.detailService.get(member, task.id, {});
    expect(dto.myPermissions).toEqual({ edit: false, delete: false, comment: false, attach: false, restore: false });
  });

  it("thẻ đã xoá: 404, trừ ?includeDeleted=true cho NGƯỜI XOÁ hoặc OWNER/ADMIN (kèm deletedAt + restore=true)", async () => {
    await h.detailService.remove(member, task.id);
    expect((await catchError(h.detailService.get(member, task.id, {}))).statusCode).toBe(404);
    expect((await catchError(h.detailService.get(other, task.id, { includeDeleted: true }))).statusCode).toBe(404);

    for (const who of [member, admin, owner]) {
      const dto = await h.detailService.get(who, task.id, { includeDeleted: true });
      expect(dto.deletedAt).not.toBeNull();
      expect(dto.myPermissions).toMatchObject({ restore: true, edit: false, comment: false, delete: false });
    }
  });

  const userStranger = (): AuthUser => ({ id: newObjectId(), email: "x@e.com" });
});

describe("task-detail.service.patch", () => {
  it("PM2-15: đổi tiêu đề + hạn + người làm trong 1 request → 3 activity; outbox due-changed + assigned (đúng MỘT sự kiện cho người được giao)", async () => {
    const due = new Date(Date.now() + 3 * 86_400_000);
    const dto = await patch(other, { title: "Tên mới", dueDate: due.toISOString(), assigneeIds: [member.id] });

    expect(dto).toMatchObject({ title: "Tên mới", dueDate: due.toISOString(), version: task.version + 1 });
    expect(dto.assignees.map((a) => a.id)).toEqual([member.id]);
    const acts = h.activities.activities.filter((a) => a.taskId === task.id && a.type !== "CREATED");
    expect(acts.map((a) => a.type)).toEqual(["RENAMED", "ASSIGNED", "DUE_CHANGED"]);
    expect(acts.every((a) => a.actorId === other.id)).toBe(true);

    // Người được giao (`member`) ≠ người thực hiện (`other`) → một sự kiện; dedupeKey theo version mới.
    const assigned = outboxOf("task.assigned").filter((e) => e.dedupeKey.includes(":v"))[0];
    expect(outboxOf("task.assigned").filter((e) => e.dedupeKey.includes(":v"))).toHaveLength(1);
    expect(assigned.dedupeKey).toBe(`task.assigned:task:${task.id}:v${dto.version}`);
    expect((assigned.payload as unknown as TaskAssignedPayload).assigneeIds).toEqual([member.id]);
    const dueEvt = outboxOf("task.due-changed")[0];
    expect(dueEvt.dedupeKey).toBe(`task.due-changed:task:${task.id}:d1`);
    expect(dueEvt.payload as unknown as TaskDueChangedPayload).toMatchObject({ oldDue: null, newDue: due.toISOString(), dueVersion: 1 });

    expect(h.emitter.of("task:updated").at(-1)?.payload).toMatchObject({ changed: ["title", "assignees", "dueDate"], actorId: other.id });
    expect(h.emitter.of("task:activity")).toHaveLength(3);
    expect((await fresh()).dueVersion).toBe(1);
  });

  it("chỉ tự giao cho mình / không đổi gì → KHÔNG có outbox assigned; PATCH rỗng không tăng version, không phát sự kiện", async () => {
    await patch(member, { assigneeIds: [member.id] });
    expect(outboxOf("task.assigned").filter((e) => e.dedupeKey.includes(":v"))).toHaveLength(0);

    const version = (await fresh()).version;
    const events = h.emitter.events.length;
    const noop = await h.detailService.patch(member, task.id, { expectedVersion: version, title: "Thẻ gốc", assigneeIds: [member.id] });
    expect(noop.version).toBe(version);
    expect(h.emitter.events).toHaveLength(events);
  });

  it("lệch expectedVersion → 409 RES_003 {currentVersion}, KHÔNG ghi gì", async () => {
    await patch(member, { title: "Lần 1" });
    const before = h.activities.activities.length;
    const err = await catchError(h.detailService.patch(other, task.id, { expectedVersion: task.version, title: "Lần 2" }));

    expect([err.statusCode, err.errorCode]).toEqual([409, "RES_003"]);
    expect(err.details).toMatchObject({ currentVersion: task.version + 1 });
    expect((await fresh()).title).toBe("Lần 1");
    expect(h.activities.activities).toHaveLength(before);
  });

  it("người làm không hợp lệ (GUEST/người ngoài) hoặc nhãn bảng khác → 400 VAL_001 kèm id sai; không ghi gì", async () => {
    const stranger = newObjectId();
    const foreignLabel = newObjectId();
    const err = await catchError(patch(member, { assigneeIds: [guest.id, stranger, other.id], labelIds: [foreignLabel] }));

    expect([err.statusCode, err.errorCode]).toEqual([400, "VAL_001"]);
    expect(err.details).toEqual({ invalidAssigneeIds: [guest.id, stranger], invalidLabelIds: [foreignLabel] });
    expect((await fresh()).version).toBe(task.version);
  });

  it("chỉ kiểm người/nhãn MỚI thêm: người làm cũ đã rời nhóm vẫn được giữ hoặc gỡ, không chặn lưu trường khác", async () => {
    const leaver = h.addUser("MEMBER");
    await patch(member, { assigneeIds: [leaver.id] });
    h.directory.members.delete(leaver.id); // rời nhóm
    const v = (await fresh()).version;

    const kept = await h.detailService.patch(member, task.id, { expectedVersion: v, assigneeIds: [leaver.id], title: "Đổi tên" });
    expect(kept.assignees.map((a) => a.id)).toEqual([leaver.id]);
    const removed = await h.detailService.patch(member, task.id, { expectedVersion: kept.version, assigneeIds: [] });
    expect(removed.assignees).toEqual([]);
  });

  it("TASK_013 (400): bắt đầu sau hạn — kể cả khi chỉ gửi MỘT ngày (so với ngày kia đang lưu); bằng nhau thì được", async () => {
    await patch(member, { dueDate: "2026-10-10T00:00:00.000Z" });
    const v = (await fresh()).version;
    const err = await catchError(h.detailService.patch(member, task.id, { expectedVersion: v, startDate: new Date("2026-10-11T00:00:00.000Z") }));
    expect([err.statusCode, err.errorCode]).toEqual([400, "TASK_013"]);

    const both = await catchError(h.detailService.patch(member, task.id, { expectedVersion: v, startDate: new Date("2026-11-01T00:00:00Z"), dueDate: new Date("2026-10-01T00:00:00Z") }));
    expect(both.errorCode).toBe("TASK_013");

    const equal = await h.detailService.patch(member, task.id, { expectedVersion: v, startDate: new Date("2026-10-10T00:00:00.000Z") });
    expect(equal.startDate).toBe("2026-10-10T00:00:00.000Z");
  });

  it("đổi hạn lần 2 → dueVersion 2 (dedupeKey khác); xoá hạn → due-changed newDue null", async () => {
    await patch(member, { dueDate: "2026-12-01T10:00:00.000Z" });
    const v1 = (await fresh()).version;
    await h.detailService.patch(member, task.id, { expectedVersion: v1, dueDate: new Date("2026-12-01T14:00:00.000Z") });
    const v2 = (await fresh()).version;
    await h.detailService.patch(member, task.id, { expectedVersion: v2, dueDate: null });

    expect(outboxOf("task.due-changed").map((e) => e.dedupeKey)).toEqual([
      `task.due-changed:task:${task.id}:d1`, `task.due-changed:task:${task.id}:d2`, `task.due-changed:task:${task.id}:d3`,
    ]);
    expect((outboxOf("task.due-changed")[2].payload as unknown as TaskDueChangedPayload).newDue).toBeNull();
  });

  it("mô tả markdown: lưu nguyên, activity DESCRIPTION chỉ có độ dài; điểm/ngày bắt đầu/nhãn được lưu; GUEST 404; bảng lưu trữ 403", async () => {
    const label = (await h.labelService.create(member, board.id, { name: "ReactJS", color: "blue" })).id;
    const md = "# Tiêu đề\n```ts\nconst a = b < c;\n```";
    const dto = await patch(member, { description: md, storyPoints: 5, labelIds: [label], startDate: "2026-09-01T00:00:00.000Z" });

    expect(dto).toMatchObject({ description: md, storyPoints: 5, labelIds: [label], startDate: "2026-09-01T00:00:00.000Z" });
    expect(dto.labels.map((l) => l.name)).toEqual(["ReactJS"]);
    expect(JSON.stringify(h.activities.activities.filter((a) => a.type === "DESCRIPTION"))).not.toContain("const a");

    expect((await catchError(h.detailService.patch(guest, task.id, { expectedVersion: dto.version, title: "x" }))).statusCode).toBe(404);
    await h.boardService.archive(owner, board.id);
    expect((await catchError(h.detailService.patch(member, task.id, { expectedVersion: dto.version, title: "x" }))).statusCode).toBe(403);
  });
});

describe("task-detail.service.remove / restore", () => {
  it("xoá: người tạo hoặc OWNER/ADMIN; MEMBER khác → 403; ghi deletedFromColumnId + DELETED + outbox task.deleted + task:deleted", async () => {
    expect((await catchError(h.detailService.remove(other, task.id))).statusCode).toBe(403);
    expect((await catchError(h.detailService.remove(guest, task.id))).statusCode).toBe(404);

    await h.detailService.remove(member, task.id);
    const t = await fresh();
    expect(t).toMatchObject({ deletedBy: member.id, deletedFromColumnId: task.columnId });
    expect(t.deletedAt).not.toBeNull();
    expect(h.activities.activities.at(-1)).toMatchObject({ type: "DELETED", actorId: member.id, before: { columnId: task.columnId } });
    expect(outboxOf("task.deleted")[0].dedupeKey).toBe(`task.deleted:task:${task.id}:v${t.version}`);
    expect(h.emitter.of("task:deleted")[0].payload).toEqual({ id: task.id, actorId: member.id });
    expect((await catchError(h.detailService.remove(member, task.id))).statusCode).toBe(404); // đã xoá

    const other2 = await h.addTask(member, board, "Thẻ khác");
    await h.detailService.remove(admin, other2.id); // ADMIN xoá thẻ của người khác
    expect((await h.tasks.findById(other2.id))?.deletedBy).toBe(admin.id);
  });

  it("PM2-17: xoá mềm rồi khôi phục → về CUỐI cột cũ; task:deleted rồi task:created{restored}; activity còn nguyên", async () => {
    const todo = h.columnId(board, "TODO");
    const a = await h.addTask(member, board, "A");
    const b = await h.addTask(member, board, "B");
    await h.detailService.remove(member, task.id);

    const card = await h.detailService.restore(member, task.id);
    expect(card).toMatchObject({ id: task.id, columnId: todo, columnKind: "TODO" });
    const list = await h.taskService.list(owner, board.id, { limitPerColumn: 100 });
    const todoTasks = list.columns.find((c) => c.columnId === todo)!.tasks.map((t) => t.id);
    expect(todoTasks).toEqual([a.id, b.id, task.id]); // cuối cột cũ
    expect((await fresh()).deletedAt).toBeNull();
    expect(await fresh()).toMatchObject({ deletedBy: null, deletedFromColumnId: null });

    expect(h.emitter.of("task:created").at(-1)?.payload).toMatchObject({ restored: true, actorId: member.id });
    expect(h.activities.activities.filter((x) => x.taskId === task.id).map((x) => x.type)).toEqual(["CREATED", "DELETED", "RESTORED"]);
    expect(outboxOf("task.restored")[0].payload).toMatchObject({ columnId: todo });
  });

  it("khôi phục: người xoá hoặc OWNER/ADMIN; MEMBER khác → 404; hai lần = idempotent (không thêm sự kiện)", async () => {
    await h.detailService.remove(member, task.id);
    expect((await catchError(h.detailService.restore(other, task.id))).statusCode).toBe(404);
    expect((await catchError(h.detailService.restore(guest, task.id))).statusCode).toBe(404);

    await h.detailService.restore(admin, task.id);
    const events = h.outbox.events.length;
    const again = await h.detailService.restore(member, task.id);
    expect(again.id).toBe(task.id);
    expect(h.outbox.events).toHaveLength(events);
  });

  it("TASK_016 (410) quá 30 ngày; vừa đủ 30 ngày vẫn khôi phục được", async () => {
    await h.detailService.remove(member, task.id);
    h.travel(30 * 86_400_000 - 60_000);
    await expect(h.detailService.restore(member, task.id)).resolves.toMatchObject({ id: task.id });

    const t2 = await h.addTask(member, board, "Thẻ 2");
    await h.detailService.remove(member, t2.id);
    h.travel(31 * 86_400_000);
    const err = await catchError(h.detailService.restore(owner, t2.id));
    expect([err.statusCode, err.errorCode]).toEqual([410, "TASK_016"]);
    // Người xem thẻ quá hạn vẫn thấy banner nhưng restore=false.
    expect((await h.detailService.get(owner, t2.id, { includeDeleted: true })).myPermissions.restore).toBe(false);
  });

  it("cột cũ đã bị xoá → về cột TODO đầu tiên, KHÔNG lỗi (TASK_001 không lộ ra)", async () => {
    const inProgress = h.columnId(board, "IN_PROGRESS");
    await h.moveService.move(member, task.id, { columnId: inProgress, afterTaskId: null, beforeTaskId: null, expectedVersion: task.version, clientMutationId: "mutation-000001" });
    await h.detailService.remove(member, task.id);

    const current = (await h.boards.findById(board.id)) as Board;
    await h.boardService.putColumns(owner, board.id, {
      columns: current.columns.filter((c) => c.id !== inProgress).map((c) => ({ id: c.id, title: c.title, kind: c.kind, wipLimit: c.wipLimit })),
      expectedVersion: current.version,
    });

    const card = await h.detailService.restore(member, task.id);
    expect(card).toMatchObject({ columnId: h.columnId(board, "TODO"), columnKind: "TODO" });
  });

  it("bảng đã lưu trữ → 403; bảng đủ số thẻ → TASK_010 (409)", async () => {
    await h.detailService.remove(member, task.id);
    h.config.perBoardMax = 1;
    await h.addTask(member, board, "Thẻ chiếm chỗ");
    const full = await catchError(h.detailService.restore(member, task.id));
    expect([full.statusCode, full.errorCode]).toEqual([409, "TASK_010"]);

    h.config.perBoardMax = 5000;
    await h.boardService.archive(owner, board.id);
    expect((await catchError(h.detailService.restore(member, task.id))).statusCode).toBe(403);
  });

  it("khôi phục thẻ đã xoá khi ở cột DONE: giữ completedAt/completionCount, KHÔNG phát lại task.completed", async () => {
    const done = h.columnId(board, "DONE");
    await h.moveService.move(member, task.id, { columnId: done, afterTaskId: null, beforeTaskId: null, expectedVersion: task.version, clientMutationId: "mutation-000002" });
    const completed = await fresh();
    await h.detailService.remove(member, task.id);
    const completedEvents = outboxOf("task.completed").length;

    const card = await h.detailService.restore(member, task.id);
    expect(card).toMatchObject({ columnKind: "DONE", completedAt: completed.completedAt?.toISOString() });
    expect(outboxOf("task.completed")).toHaveLength(completedEvents);
    expect((await fresh()).completionCount).toBe(1);
  });
});
