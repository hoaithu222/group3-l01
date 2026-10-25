// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { TaskCompletedPayload } from "../events/project-events";
import { needsRebalance } from "../services/task-position";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let member: AuthUser;
let board: Board;
let todo: string;
let doing: string;
let done: string;

const mid = () => `mutation-${Math.random().toString(36).slice(2, 12)}`;

beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  member = h.addUser("MEMBER");
  board = await h.createBoard(owner);
  [todo, doing, done] = [h.columnId(board, "TODO"), h.columnId(board, "IN_PROGRESS"), h.columnId(board, "DONE")];
});

async function move(
  user: AuthUser,
  task: Task,
  to: { columnId: string; afterTaskId?: string | null; beforeTaskId?: string | null; expectedVersion?: number }
) {
  const current = await h.tasks.findById(task.id);
  return h.moveService.move(user, task.id, {
    columnId: to.columnId,
    afterTaskId: to.afterTaskId ?? null,
    beforeTaskId: to.beforeTaskId ?? null,
    expectedVersion: to.expectedVersion ?? current?.version ?? 1,
    clientMutationId: mid(),
  });
}

const order = async (columnId: string) => (await h.tasks.listColumnAll(board.id, columnId)).map((t) => t.title);
const catchError = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};

describe("task.service.move — vị trí (server tính khoá giữa hai hàng xóm hiện tại)", () => {
  it("chèn giữa hai thẻ trong cùng cột; version +1; không ghi activity MOVED", async () => {
    const [t1, t2, t3] = [await h.addTask(member, board, "t1"), await h.addTask(member, board, "t2"), await h.addTask(member, board, "t3")];
    const res = await move(member, t3, { columnId: todo, afterTaskId: t1.id, beforeTaskId: t2.id });

    expect(await order(todo)).toEqual(["t1", "t3", "t2"]);
    expect(res.version).toBe(2);
    expect(h.activities.activities.filter((a) => a.type === "MOVED")).toHaveLength(0);
  });

  it("chỉ có beforeTaskId → ngay TRƯỚC thẻ đó; cả hai null → cuối cột", async () => {
    const [t1, t2, t3] = [await h.addTask(member, board, "t1"), await h.addTask(member, board, "t2"), await h.addTask(member, board, "t3")];
    await move(member, t3, { columnId: todo, beforeTaskId: t1.id });
    expect(await order(todo)).toEqual(["t3", "t1", "t2"]);
    await move(member, t3, { columnId: todo });
    expect(await order(todo)).toEqual(["t1", "t2", "t3"]);
    void t2;
  });

  it("client dữ liệu cũ: giữa after và before đã có thẻ khác → đặt NGAY SAU after, thứ tự vẫn hợp lệ", async () => {
    const [t1, t3] = [await h.addTask(member, board, "t1"), await h.addTask(member, board, "t3")];
    // Client nhìn thấy t1 · t3 nhưng người khác đã chèn t2 giữa hai thẻ.
    await h.addTask(member, board, "t2", { afterTaskId: t1.id });
    const t4 = await h.addTask(member, board, "t4");
    await move(member, t4, { columnId: todo, afterTaskId: t1.id, beforeTaskId: t3.id });
    expect(await order(todo)).toEqual(["t1", "t4", "t2", "t3"]);
  });

  it("after nằm SAU before (dữ liệu cũ đảo thứ tự) → tự sửa theo after, không lỗi", async () => {
    const [t1, t2] = [await h.addTask(member, board, "t1"), await h.addTask(member, board, "t2")];
    const t3 = await h.addTask(member, board, "t3");
    await move(member, t3, { columnId: todo, afterTaskId: t2.id, beforeTaskId: t1.id });
    expect(await order(todo)).toEqual(["t1", "t2", "t3"]);
  });

  it("sang cột khác: hàng xóm phải thuộc cột đích, không thì 400 VAL_001", async () => {
    const [t1, t2] = [await h.addTask(member, board, "t1"), await h.addTask(member, board, "t2")];
    const err = await catchError(move(member, t2, { columnId: doing, afterTaskId: t1.id }));
    expect(err).toMatchObject({ statusCode: 400, errorCode: "VAL_001" });
    expect(err.details).toEqual({ afterTaskId: expect.any(Array) });
  });

  it("hàng xóm là chính thẻ đang kéo hoặc thẻ đã xoá → 400", async () => {
    const t1 = await h.addTask(member, board, "t1");
    const t2 = await h.addTask(member, board, "t2");
    expect(await catchError(move(member, t1, { columnId: todo, afterTaskId: t1.id }))).toMatchObject({ statusCode: 400 });
    h.tasks.tasks.get(t2.id)!.deletedAt = new Date();
    expect(await catchError(move(member, t1, { columnId: todo, beforeTaskId: t2.id }))).toMatchObject({ statusCode: 400 });
  });

  it("after hợp lệ + before vừa bị xoá mềm / kéo sang cột khác → KHÔNG lỗi, đặt NGAY SAU after (before không dùng nên không kiểm)", async () => {
    const [t1, t2, t3] = [await h.addTask(member, board, "t1"), await h.addTask(member, board, "t2"), await h.addTask(member, board, "t3")];
    const [t4, t5] = [await h.addTask(member, board, "t4"), await h.addTask(member, board, "t5")];
    // Client vẫn thấy t1 · t2 · t3 nhưng người khác vừa xoá t2 và kéo t3 sang cột khác.
    h.tasks.tasks.get(t2.id)!.deletedAt = new Date();
    await move(member, t3, { columnId: doing });

    await move(member, t4, { columnId: todo, afterTaskId: t1.id, beforeTaskId: t2.id });
    expect(await order(todo)).toEqual(["t1", "t4", "t5"]);
    await move(member, t5, { columnId: todo, afterTaskId: t1.id, beforeTaskId: t3.id });
    expect(await order(todo)).toEqual(["t1", "t5", "t4"]);
  });

  it("after đã bị kéo sang cột khác + before hợp lệ → đặt NGAY TRƯỚC before", async () => {
    await h.addTask(member, board, "t1");
    const [t2, t3, t4] = [await h.addTask(member, board, "t2"), await h.addTask(member, board, "t3"), await h.addTask(member, board, "t4")];
    // Client thả t4 giữa t2 · t3 nhưng t2 vừa bị người khác kéo sang cột khác.
    await move(member, t2, { columnId: doing });
    await move(member, t4, { columnId: todo, afterTaskId: t2.id, beforeTaskId: t3.id });
    expect(await order(todo)).toEqual(["t1", "t4", "t3"]);
  });

  it("cả after lẫn before đều không hợp lệ → 400 VAL_001 báo theo afterTaskId; chỉ gửi before không hợp lệ → báo theo beforeTaskId", async () => {
    const [t1, t2, t3] = [await h.addTask(member, board, "t1"), await h.addTask(member, board, "t2"), await h.addTask(member, board, "t3")];
    await move(member, t1, { columnId: doing });
    h.tasks.tasks.get(t2.id)!.deletedAt = new Date();

    const both = await catchError(move(member, t3, { columnId: todo, afterTaskId: t1.id, beforeTaskId: t2.id }));
    expect(both).toMatchObject({ statusCode: 400, errorCode: "VAL_001" });
    expect(both.details).toEqual({ afterTaskId: expect.any(Array) });
    const onlyBefore = await catchError(move(member, t3, { columnId: todo, beforeTaskId: t2.id }));
    expect(onlyBefore.details).toEqual({ beforeTaskId: expect.any(Array) });
    expect((await h.tasks.findById(t3.id))?.version).toBe(1);
  });

  it("cột không tồn tại → TASK_001 (400)", async () => {
    const t1 = await h.addTask(member, board, "t1");
    const err = await catchError(move(member, t1, { columnId: "c_zzzzzzzz" }));
    expect(err).toMatchObject({ statusCode: 400, errorCode: "TASK_001" });
  });
});

describe("task.service.move — CAS version (PM2-01 mức service)", () => {
  it("expectedVersion lệch → 409 RES_003 kèm current (vị trí server) để client hoàn tác", async () => {
    const t1 = await h.addTask(member, board, "t1");
    await move(member, t1, { columnId: doing }); // version 2
    const err = await catchError(move(member, t1, { columnId: todo, expectedVersion: 1 }));

    expect(err).toMatchObject({ statusCode: 409, errorCode: "RES_003" });
    expect(err.details).toMatchObject({ currentVersion: 2, current: { id: t1.id, columnId: doing, version: 2 } });
    expect((await h.tasks.findById(t1.id))?.columnId).toBe(doing);
  });

  it("thẻ đã xoá mềm hoặc không tồn tại → 404 PERM_404", async () => {
    const t1 = await h.addTask(member, board, "t1");
    h.tasks.tasks.get(t1.id)!.deletedAt = new Date();
    expect(await catchError(move(member, t1, { columnId: doing }))).toMatchObject({ statusCode: 404, errorCode: "PERM_404" });
  });
});

describe("task.service.move — hoàn thành (PM2-19 mức service)", () => {
  const completedRows = () => h.outbox.events.filter((e) => e.type === "task.completed");
  const reopenedRows = () => h.outbox.events.filter((e) => e.type === "task.reopened");

  it("vào DONE → completedAt, completionCount 1, outbox task.completed đủ trường + dedupeKey c1", async () => {
    const label = await h.labels.create({ boardId: board.id, workspaceId: h.workspaceId, name: "ReactJS", normalizedName: "reactjs", color: "blue" });
    const { task } = await h.taskService.create(member, board.id, {
      title: "Làm slide",
      assigneeIds: [member.id],
      labelIds: [label!.id],
      dueDate: new Date(Date.now() + 86_400_000),
    });
    const res = await h.moveService.move(member, task.id, { columnId: done, afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mid() });

    expect(res.columnKind).toBe("DONE");
    expect(res.completedAt).not.toBeNull();
    const rows = completedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "task.completed",
      aggregateType: "Task",
      aggregateId: task.id,
      queue: "notifications",
      jobName: "task.events",
      dedupeKey: `task.completed:task:${task.id}:c1`,
    });
    const p = rows[0].payload as unknown as TaskCompletedPayload;
    expect(p).toMatchObject({
      taskId: task.id,
      boardId: board.id,
      workspaceId: h.workspaceId,
      assigneeIds: [member.id],
      completionCount: 1,
      onTime: true,
      labelNames: ["ReactJS"],
      review: { enabled: false, approved: false },
      actorId: member.id,
    });
    expect(new Date(p.taskCreatedAt).getTime()).toBeLessThanOrEqual(new Date(p.completedAt).getTime());
    // Không chứa tiêu đề thẻ (dữ liệu nhóm).
    expect(JSON.stringify(rows[0].payload)).not.toContain("Làm slide");
    expect(h.activities.activities.filter((a) => a.type === "MOVED")).toHaveLength(1);
  });

  it("vào DONE, ra, vào lại → task.completed c1 rồi c2 (dedupeKey khác), task.reopened c1", async () => {
    const t = await h.addTask(member, board, "t");
    await move(member, t, { columnId: done });
    await move(member, t, { columnId: doing });
    await move(member, t, { columnId: done });

    expect(completedRows().map((e) => e.dedupeKey)).toEqual([`task.completed:task:${t.id}:c1`, `task.completed:task:${t.id}:c2`]);
    expect(reopenedRows().map((e) => e.dedupeKey)).toEqual([`task.reopened:task:${t.id}:c1`]);
    const final = await h.tasks.findById(t.id);
    expect(final).toMatchObject({ completionCount: 2, columnKind: "DONE" });
    expect(final?.completedAt).not.toBeNull();
  });

  it("rời DONE → completedAt null; sắp xếp lại trong cột DONE không phát thêm sự kiện", async () => {
    const [a, b] = [await h.addTask(member, board, "a"), await h.addTask(member, board, "b")];
    await move(member, a, { columnId: done });
    await move(member, b, { columnId: done });
    await move(member, a, { columnId: done, afterTaskId: b.id }); // DONE → DONE
    expect(completedRows()).toHaveLength(2);
    expect(reopenedRows()).toHaveLength(0);

    await move(member, a, { columnId: todo });
    expect((await h.tasks.findById(a.id))?.completedAt).toBeNull();
    expect(reopenedRows()).toHaveLength(1);
  });

  it("onTime = false khi quá hạn hoặc không có hạn", async () => {
    const late = (await h.taskService.create(member, board.id, { title: "trễ", assigneeIds: [], labelIds: [], dueDate: new Date(Date.now() - 86_400_000) })).task;
    const noDue = await h.addTask(member, board, "không hạn");
    await move(member, (await h.tasks.findById(late.id))!, { columnId: done });
    await move(member, noDue, { columnId: done });
    expect(completedRows().map((e) => (e.payload as unknown as TaskCompletedPayload).onTime)).toEqual([false, false]);
  });
});

describe("task.service.move — TaskMovePolicy / TaskMoveEffect (registry cho p4-05)", () => {
  it("policy ném TASK_002 → chặn vào DONE, không ghi gì (thẻ giữ nguyên, không outbox)", async () => {
    h.registry.registerPolicy({
      name: "review-done",
      check: async () => {
        throw new AppError("Chưa đủ điều kiện", 409, "TASK_002");
      },
    });
    const t = await h.addTask(member, board, "t");
    const outboxBefore = h.outbox.events.length;

    const err = await catchError(move(member, t, { columnId: done }));
    expect(err).toMatchObject({ statusCode: 409, errorCode: "TASK_002" });
    expect(await h.tasks.findById(t.id)).toMatchObject({ columnId: todo, version: 1, completedAt: null });
    expect(h.outbox.events).toHaveLength(outboxBefore);
  });

  it("policy chỉ chạy khi VÀO DONE; metadata review được gộp vào task.completed", async () => {
    const checked: string[] = [];
    h.registry.registerPolicy({
      name: "p",
      check: async (ctx) => {
        checked.push(ctx.toColumn.kind);
        return { review: { enabled: true, approved: true, roundId: "r1" } };
      },
    });
    const t = await h.addTask(member, board, "t");
    await move(member, t, { columnId: doing });
    expect(checked).toEqual([]);
    await move(member, t, { columnId: done });
    expect(checked).toEqual(["DONE"]);

    const payload = h.outbox.events.find((e) => e.type === "task.completed")!.payload as unknown as TaskCompletedPayload;
    expect(payload.review).toEqual({ enabled: true, approved: true, roundId: "r1" });
  });

  it("effect chạy trong move khi ĐỔI LOẠI cột (rời/vào), không chạy khi cùng loại; thấy thẻ đã ghi", async () => {
    const calls: string[] = [];
    h.registry.registerEffect({
      name: "e",
      onLeaveKind: async (kind, ctx) => void calls.push(`leave:${kind}:v${ctx.before.version}`),
      onEnterKind: async (kind, ctx) => void calls.push(`enter:${kind}:v${ctx.after.version}`),
    });
    const t = await h.addTask(member, board, "t");
    await move(member, t, { columnId: doing });
    await move(member, t, { columnId: doing }); // cùng cột → không đổi loại
    expect(calls).toEqual(["leave:TODO:v1", "enter:IN_PROGRESS:v2"]);
  });

  it("effect ném lỗi → move thất bại (p4-05: không có thẻ ở REVIEW mà thiếu lượt chấm)", async () => {
    h.registry.registerEffect({
      name: "boom",
      onEnterKind: async () => {
        throw new AppError("effect lỗi", 500, "SYS_500");
      },
    });
    const t = await h.addTask(member, board, "t");
    await expect(move(member, t, { columnId: doing })).rejects.toThrow("effect lỗi");
  });
});

describe("task.service.move — realtime, rebalance, quyền", () => {
  it("phát task:moved sau khi ghi, kèm clientMutationId + fromColumnId + actorId", async () => {
    const t = await h.addTask(member, board, "t");
    const clientMutationId = mid();
    await h.moveService.move(member, t.id, { columnId: doing, afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId });
    const [evt] = h.emitter.of("task:moved");
    expect(evt.payload).toMatchObject({ id: t.id, boardId: board.id, fromColumnId: todo, columnId: doing, columnKind: "IN_PROGRESS", version: 2, actorId: member.id, clientMutationId });
  });

  it("khoá vị trí > 50 ký tự → xếp job board.rebalance-column (không xếp khi còn ngắn)", async () => {
    const [a, b, c] = [await h.addTask(member, board, "a"), await h.addTask(member, board, "b"), await h.addTask(member, board, "c")];
    await move(member, c, { columnId: todo, afterTaskId: a.id }); // giữa a0 và a1: khoá ngắn
    expect(h.rebalance.calls).toHaveLength(0);

    // Khoá của `a` đã cực dài (51 ký tự) → khoá chèn giữa nó và `b` dài hơn 50.
    h.tasks.tasks.get(a.id)!.position = `a0${"z".repeat(49)}`;
    await move(member, c, { columnId: todo, afterTaskId: a.id, beforeTaskId: b.id });
    const moved = await h.tasks.findById(c.id);
    expect(needsRebalance(moved!.position)).toBe(true);
    expect(h.rebalance.calls).toEqual([{ boardId: board.id, columnId: todo }]);
  });

  it("khoá hàng xóm hỏng (sai định dạng) hoặc TRÙNG nhau → 503 SYS_503 retryable + xếp job nén; job nén chữa xong thì kéo lại được", async () => {
    const [a, b, c] = [await h.addTask(member, board, "a"), await h.addTask(member, board, "b"), await h.addTask(member, board, "c")];
    h.tasks.tasks.get(a.id)!.position = "a00"; // số 0 ở cuối = sai định dạng
    h.tasks.tasks.get(b.id)!.position = "a00"; // và trùng với a

    const err = await catchError(move(member, c, { columnId: todo, afterTaskId: a.id }));
    expect(err).toMatchObject({ statusCode: 503, errorCode: "SYS_503", details: { retryable: true, reason: "POSITION_KEY_INVALID" } });
    expect(h.rebalance.calls).toEqual([{ boardId: board.id, columnId: todo }]);
    expect((await h.tasks.findById(c.id))?.version).toBe(1);

    const repaired = await h.rebalanceService.rebalanceColumn(board.id, todo);
    expect(repaired.skipped).toBe(false);
    const keys = (await h.tasks.listColumnAll(board.id, todo)).map((t) => t.position);
    expect(new Set(keys).size).toBe(3);
    await move(member, c, { columnId: todo, afterTaskId: a.id });
    expect((await h.tasks.findById(c.id))?.version).toBe(2);
  });

  it("GUEST và người ngoài → 404 PERM_404; bảng đã lưu trữ → 403; nhóm ARCHIVED → 403", async () => {
    const t = await h.addTask(member, board, "t");
    const guest = h.addUser("GUEST");
    const outsider: AuthUser = { id: "0".repeat(24), email: "x@e.com", name: "X", role: "user", permissions: [] };
    expect(await catchError(move(guest, t, { columnId: doing }))).toMatchObject({ statusCode: 404, errorCode: "PERM_404" });
    expect(await catchError(move(outsider, t, { columnId: doing }))).toMatchObject({ statusCode: 404, errorCode: "PERM_404" });

    h.workspaceStatus = "ARCHIVED";
    expect(await catchError(move(member, t, { columnId: doing }))).toMatchObject({ statusCode: 403 });
    h.workspaceStatus = "ACTIVE";

    await h.boardService.archive(owner, board.id);
    expect(await catchError(move(member, t, { columnId: doing }))).toMatchObject({ statusCode: 403, errorCode: "PERM_001" });
  });
});
