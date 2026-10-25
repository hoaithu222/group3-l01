// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { TaskRescheduleBulkCompletedPayload, TaskRescheduledPayload } from "../events/project-events";
import type { BoardRescheduledPayload } from "../realtime/board-emitter";
import type { RescheduleOutcome } from "../services/reschedule.service";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let member: AuthUser;
let lan: AuthUser;
let board: Board;
let A: Task;
let chain: Task[];

const at = (s: string): Date => new Date(`2026-${s}+07:00`);
const fresh = async (t: Task): Promise<Task> => (await h.tasks.findById(t.id)) as Task;
const NEW_DUE = "10-05T17:00:00";

/** A → T1 → T2 → T3 → T4 → T5 (mỗi thẻ 1 ngày, T1 do Lan làm). Hạn A 10-03 → 10-05 kéo cả chuỗi. */
beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  member = h.addUser("MEMBER");
  lan = h.addUser("MEMBER");
  board = await h.createBoard(owner);
  A = await h.addDatedTask(member, board, "A", { start: "2026-10-01T09:00:00+07:00", due: "2026-10-03T17:00:00+07:00" });
  chain = [];
  for (let i = 1; i <= 5; i += 1) {
    const day = 3 + i; // T1 bắt đầu 10-04, T2 10-05, ...
    const t = await h.addDatedTask(
      member,
      board,
      `T${i}`,
      { start: `2026-10-0${day}T09:00:00+07:00`, due: `2026-10-0${day}T17:00:00+07:00` },
      i === 1 ? [lan.id] : []
    );
    await h.dependencyService.add(member, t.id, i === 1 ? A.id : chain[i - 2].id);
    chain.push(t);
  }
  A = await fresh(A);
  chain = await Promise.all(chain.map(fresh));
  h.limitsOverride = { rescheduleSyncMax: 2 }; // 5 thẻ > 2 ⇒ lô nền
  h.batchProcessorDeps.chunkSize = 2; // lượt 2 + 2 + 1
  h.emitter.events.length = 0;
  h.outbox.events.length = 0;
  h.activities.activities.length = 0;
});

/** Gọi `apply` để có lô QUEUED (nguồn đã đổi, thẻ sau chưa). */
async function enqueue(): Promise<string> {
  const p = await h.rescheduleService.preview(member, A.id, { dueDate: at(NEW_DUE) });
  expect(p.mode).toBe("BULK");
  const out = (await h.rescheduleService.apply(member, A.id, { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: p.previewToken })) as Extract<RescheduleOutcome, { status: 202 }>;
  expect(out.status).toBe(202);
  h.emitter.events.length = 0; // bỏ task:updated của thẻ nguồn (đã kiểm ở reschedule.service.test)
  return out.data.batchId;
}
const outboxOf = (type: string) => h.outbox.events.filter((e) => e.type === type);
const boardEvents = () => h.emitter.of("board:rescheduled").map((e) => e.payload as BoardRescheduledPayload);

describe("RescheduleBatchProcessor (p4-04 be.md §5.6, PM2-27)", () => {
  it("áp theo lượt (2+2+1): mọi thẻ dời đúng kế hoạch, batch DONE + nhả activeKey; outbox due-changed/rescheduled/bulk-completed; board:rescheduled mỗi lượt, final ở lượt cuối", async () => {
    const batchId = await enqueue();
    h.outbox.events.length = 0; // bỏ due-changed của thẻ nguồn (đã kiểm ở reschedule.service.test)
    const before = await Promise.all(chain.map(fresh));

    expect(await h.batchProcessor.process(batchId)).toBe("DONE");

    for (let i = 0; i < 5; i += 1) {
      const t = await fresh(chain[i]);
      expect(t.version).toBe(before[i].version + 1);
      expect(t.dueDate?.toISOString()).toBe(at(`10-${String(6 + i).padStart(2, "0")}T17:00:00`).toISOString()); // mỗi thẻ +2 ngày: T1 10-04 → 10-06, T2 10-05 → 10-07, …
    }
    const batch = (await h.batchRepo.findById(batchId))!;
    expect(batch).toMatchObject({ status: "DONE", cursor: 5, appliedCount: 5, conflictCount: 0, activeKey: `batch:${batchId}`, error: null });
    expect(batch.startedAt).not.toBeNull();
    expect(batch.finishedAt).not.toBeNull();
    expect(batch.items.every((i) => i.result === "APPLIED")).toBe(true);

    // Activity RESCHEDULED ghi batchId; outbox: due-changed 5 (theo dueVersion mới), rescheduled 1 (mọi thẻ đã áp), bulk-completed 1.
    const acts = h.activities.activities.filter((a) => a.type === "RESCHEDULED");
    expect(acts).toHaveLength(5);
    expect(acts[0].after).toMatchObject({ sourceTaskId: A.id, rescheduleId: batchId, batchId });
    expect(acts[0].actorId).toBe(member.id);
    expect(outboxOf("task.due-changed")).toHaveLength(5);
    const resched = outboxOf("task.rescheduled");
    expect(resched).toHaveLength(1);
    expect(resched[0].dedupeKey).toBe(`task.rescheduled:op:${batchId}`);
    const rp = resched[0].payload as unknown as TaskRescheduledPayload;
    expect(rp).toMatchObject({ rescheduleId: batchId, batchId, sourceTaskId: A.id, actorId: member.id });
    expect(rp.items.map((i) => i.taskId)).toEqual(chain.map((t) => t.id));
    expect(rp.items[0].assigneeIds).toEqual([lan.id]);
    const done = outboxOf("task.reschedule-bulk.completed");
    expect(done).toHaveLength(1);
    expect(done[0].dedupeKey).toBe(`task.reschedule-bulk.completed:batch:${batchId}`);
    expect(done[0].payload as unknown as TaskRescheduleBulkCompletedPayload).toMatchObject({ batchId, requestedBy: member.id, status: "DONE", appliedCount: 5, conflictCount: 0, actorId: member.id });

    // Realtime: một board:rescheduled mỗi lượt (không phát task:updated từng thẻ), chỉ lượt cuối final.
    expect(boardEvents().map((e) => [e.taskIds.length, e.final])).toEqual([[2, false], [2, false], [1, true]]);
    expect(boardEvents().every((e) => e.batchId === batchId && e.rescheduleId === batchId && e.boardId === board.id)).toBe(true);
    expect(h.emitter.of("task:updated")).toHaveLength(0);
  });

  it("idempotent: chạy lại lô đã kết thúc (BullMQ retry/trùng job) → SKIPPED, không ghi/phát thêm", async () => {
    const batchId = await enqueue();
    await h.batchProcessor.process(batchId);
    const outboxCount = h.outbox.events.length;
    const eventCount = h.emitter.events.length;
    const versions = (await Promise.all(chain.map(fresh))).map((t) => t.version);
    expect(await h.batchProcessor.process(batchId)).toBe("SKIPPED");
    expect(await h.batchProcessor.process("f".repeat(24))).toBe("SKIPPED"); // lô không tồn tại
    expect(h.outbox.events).toHaveLength(outboxCount);
    expect(h.emitter.events).toHaveLength(eventCount);
    expect((await Promise.all(chain.map(fresh))).map((t) => t.version)).toEqual(versions);
  });

  it("PM2-27: một thẻ bị sửa giữa lô → CONFLICT (không dời), lô PARTIAL; thẻ xong/đã xoá cũng CONFLICT; task.rescheduled chỉ gồm thẻ đã áp; bulk-completed ghi 3 áp / 2 xung đột", async () => {
    const batchId = await enqueue();
    const t3Before = await fresh(chain[2]);
    h.setTask(chain[2].id, { version: chain[2].version + 1, title: "Đã sửa giữa lô" }); // T3 bị người khác sửa
    h.setTask(chain[3].id, { deletedAt: new Date() }); // T4 bị xoá
    h.outbox.events.length = 0;

    expect(await h.batchProcessor.process(batchId)).toBe("PARTIAL");

    expect((await fresh(chain[2])).dueDate?.toISOString()).toBe(t3Before.dueDate?.toISOString()); // không dời
    const batch = (await h.batchRepo.findById(batchId))!;
    expect(batch).toMatchObject({ status: "PARTIAL", appliedCount: 3, conflictCount: 2, activeKey: `batch:${batchId}` });
    expect(batch.items.map((i) => i.result)).toEqual(["APPLIED", "APPLIED", "CONFLICT", "CONFLICT", "APPLIED"]);

    const rp = outboxOf("task.rescheduled")[0].payload as unknown as TaskRescheduledPayload;
    expect(rp.items.map((i) => i.taskId)).toEqual([chain[0].id, chain[1].id, chain[4].id]);
    const dp = outboxOf("task.reschedule-bulk.completed")[0].payload as unknown as TaskRescheduleBulkCompletedPayload;
    expect(dp).toMatchObject({ status: "PARTIAL", appliedCount: 3, conflictCount: 2 });
    expect(outboxOf("task.due-changed")).toHaveLength(3);

    // GET /reschedule-batches/:id liệt kê xung đột (tiêu đề hiện tại; thẻ đã xoá → tiêu đề rỗng).
    const dto = await h.rescheduleService.batchStatus(member, batchId);
    expect(dto.conflicts.map((c) => c.taskId)).toEqual([chain[2].id, chain[3].id]);
    expect(dto.conflicts[0].title).toBe("Đã sửa giữa lô");
  });

  it("thẻ đã ở cột DONE khi lô chạy → CONFLICT (không dời thẻ đã xong)", async () => {
    const batchId = await enqueue();
    h.setTask(chain[1].id, { columnKind: "DONE" });
    expect(await h.batchProcessor.process(batchId)).toBe("PARTIAL");
    expect((await h.batchRepo.findById(batchId))!.items[1].result).toBe("CONFLICT");
  });

  it("worker chết TRƯỚC khi ghi lượt 2 → chạy lại tiếp từ cursor: thẻ lượt 1 KHÔNG bị áp đôi, kết quả như chạy liền mạch", async () => {
    const batchId = await enqueue();
    const before = await Promise.all(chain.map(fresh));
    const original = h.boards.findById.bind(h.boards);
    let calls = 0;
    jest.spyOn(h.boards, "findById").mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error("worker chết giữa lô")); // đầu lượt 2, trước mọi thao tác ghi
      return original(...args);
    });

    await expect(h.batchProcessor.process(batchId)).rejects.toThrow("worker chết giữa lô");
    let batch = (await h.batchRepo.findById(batchId))!;
    expect(batch).toMatchObject({ status: "RUNNING", cursor: 2, appliedCount: 2, activeKey: `board:${board.id}` }); // đang chạy dở, vẫn giữ khoá bảng
    expect(outboxOf("task.reschedule-bulk.completed")).toHaveLength(0);

    expect(await h.batchProcessor.process(batchId)).toBe("DONE"); // BullMQ retry
    batch = (await h.batchRepo.findById(batchId))!;
    expect(batch).toMatchObject({ status: "DONE", cursor: 5, appliedCount: 5, conflictCount: 0 });
    for (let i = 0; i < 5; i += 1) expect((await fresh(chain[i])).version).toBe(before[i].version + 1); // đúng MỘT lần mỗi thẻ
    expect(outboxOf("task.due-changed")).toHaveLength(5 + 1); // + thẻ nguồn lúc xếp lô
    expect(outboxOf("task.reschedule-bulk.completed")).toHaveLength(1);
    expect(outboxOf("task.rescheduled")).toHaveLength(1);
  });

  it("hết lượt retry → fail(): FAILED, nhả activeKey, vẫn phát bulk-completed (status FAILED) nhưng KHÔNG task.rescheduled; gọi lại/process sau đó vô hại", async () => {
    const batchId = await enqueue();
    const original = h.boards.findById.bind(h.boards);
    let calls = 0;
    jest.spyOn(h.boards, "findById").mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error("Mongo sập"));
      return original(...args);
    });
    await expect(h.batchProcessor.process(batchId)).rejects.toThrow("Mongo sập");
    h.outbox.events.length = 0;
    h.emitter.events.length = 0;

    await h.batchProcessor.fail(batchId, "Mongo sập");
    const batch = (await h.batchRepo.findById(batchId))!;
    expect(batch).toMatchObject({ status: "FAILED", activeKey: `batch:${batchId}`, error: "Mongo sập", appliedCount: 2 });
    expect(outboxOf("task.rescheduled")).toHaveLength(0);
    expect(outboxOf("task.reschedule-bulk.completed")[0].payload as unknown as TaskRescheduleBulkCompletedPayload).toMatchObject({ status: "FAILED", appliedCount: 2, conflictCount: 0 });
    expect(boardEvents()).toEqual([expect.objectContaining({ batchId, taskIds: [], final: true })]);

    await h.batchProcessor.fail(batchId, "lần nữa"); // đã kết thúc → không ghi thêm
    expect(outboxOf("task.reschedule-bulk.completed")).toHaveLength(1);
    expect(await h.batchProcessor.process(batchId)).toBe("SKIPPED");
    // Bảng không còn bị chặn: lệnh dời mới không gặp TASK_020.
    expect(await h.batchRepo.findActiveByBoard(board.id)).toBeNull();
  });

  it("bảng bị lưu trữ giữa chừng → mọi thẻ còn lại CONFLICT (không ghi vào bảng đã khoá), lô PARTIAL", async () => {
    const batchId = await enqueue();
    await h.boardService.archive(owner, board.id);
    expect(await h.batchProcessor.process(batchId)).toBe("PARTIAL");
    expect(await h.batchRepo.findById(batchId)).toMatchObject({ status: "PARTIAL", appliedCount: 0, conflictCount: 5 });
    expect(outboxOf("task.rescheduled")).toHaveLength(0);
    expect((await fresh(chain[0])).version).toBe(chain[0].version);
  });

  it("lô rỗng (không thẻ nào) kết thúc DONE ngay và phát final", async () => {
    const batch = await h.batchRepo.create({ workspaceId: h.workspaceId, boardId: board.id, sourceTaskId: A.id, requestedBy: member.id, sourceDueDate: at(NEW_DUE), items: [] });
    expect(await h.batchProcessor.process(batch.id)).toBe("DONE");
    expect((await h.batchRepo.findById(batch.id))!.status).toBe("DONE");
    const events = boardEvents();
    expect(events[events.length - 1]).toMatchObject({ final: true, count: 0 });
  });
});
