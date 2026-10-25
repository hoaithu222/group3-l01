import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { TaskRescheduleBulkCompletedPayload } from "../events/project-events";
import type { BoardRescheduledPayload } from "../realtime/board-emitter";
import type { RescheduleOutcome } from "../services/reschedule.service";
import { RescheduleBatchSweeper } from "../services/reschedule-batch-sweeper";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let member: AuthUser;
let board: Board;
let A: Task;
let chain: Task[];
let nowMs: number;
let sweeper: RescheduleBatchSweeper;

const at = (s: string): Date => new Date(`2026-${s}+07:00`);
const NEW_DUE = "10-05T17:00:00";
const MIN = 60_000;
const STALE = LIMITS.task.rescheduleBatchStaleMinutes;
const outboxOf = (type: string) => h.outbox.events.filter((e) => e.type === type);
const boardEvents = () => h.emitter.of("board:rescheduled").map((e) => e.payload as BoardRescheduledPayload);

/** A → T1 → … → T5; `rescheduleSyncMax: 2` ⇒ lô nền (5 thẻ), lượt 2 thẻ. */
beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  member = h.addUser("MEMBER");
  board = await h.createBoard(owner);
  A = await h.addDatedTask(member, board, "A", { start: "2026-10-01T09:00:00+07:00", due: "2026-10-03T17:00:00+07:00" });
  chain = [];
  for (let i = 1; i <= 5; i += 1) {
    const day = 3 + i;
    const t = await h.addDatedTask(member, board, `T${i}`, { start: `2026-10-0${day}T09:00:00+07:00`, due: `2026-10-0${day}T17:00:00+07:00` });
    await h.dependencyService.add(member, t.id, i === 1 ? A.id : chain[i - 2].id);
    chain.push(t);
  }
  A = (await h.tasks.findById(A.id)) as Task;
  h.limitsOverride = { rescheduleSyncMax: 2 };
  h.batchProcessorDeps.chunkSize = 2;
  nowMs = Date.now();
  sweeper = new RescheduleBatchSweeper({ batches: h.batchRepo, processor: h.batchProcessor, clock: () => new Date(nowMs) });
});

/** Xếp một lô QUEUED (nguồn đã đổi, thẻ sau chưa) rồi dọn dấu vết của lúc xếp. */
async function enqueue(): Promise<string> {
  const p = await h.rescheduleService.preview(member, A.id, { dueDate: at(NEW_DUE) });
  const out = (await h.rescheduleService.apply(member, A.id, { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: p.previewToken })) as Extract<RescheduleOutcome, { status: 202 }>;
  expect(out.status).toBe(202);
  h.outbox.events.length = 0;
  h.emitter.events.length = 0;
  return out.data.batchId;
}

describe("RescheduleBatchSweeper — cron TĨNH reschedule-batch.sweep (p4-04 be.md §5.6)", () => {
  it("lô QUEUED quá hạn → FAILED, nhả activeKey, báo người yêu cầu (bulk-completed FAILED) + board:rescheduled final; bảng dời lịch được lại", async () => {
    const batchId = await enqueue();
    expect(await h.batchRepo.findActiveByBoard(board.id)).not.toBeNull();
    nowMs += (STALE + 1) * MIN;

    expect(await sweeper.sweep()).toEqual({ scanned: 1, failed: 1 });

    const batch = (await h.batchRepo.findById(batchId))!;
    expect(batch).toMatchObject({ status: "FAILED", activeKey: `batch:${batchId}`, appliedCount: 0 });
    expect(batch.error).toContain(`${STALE} phút`);
    expect(batch.finishedAt).not.toBeNull();
    expect(await h.batchRepo.findActiveByBoard(board.id)).toBeNull();
    expect(outboxOf("task.rescheduled")).toHaveLength(0);
    const done = outboxOf("task.reschedule-bulk.completed");
    expect(done).toHaveLength(1);
    expect(done[0].dedupeKey).toBe(`task.reschedule-bulk.completed:batch:${batchId}`);
    expect(done[0].payload as unknown as TaskRescheduleBulkCompletedPayload).toMatchObject({ batchId, requestedBy: member.id, status: "FAILED" });
    expect(boardEvents()).toEqual([expect.objectContaining({ batchId, taskIds: [], count: 0, final: true })]);

    // Không còn TASK_020: lệnh dời mới xếp được lô mới trên cùng bảng.
    const p = await h.rescheduleService.preview(member, A.id, { dueDate: at("10-06T17:00:00") });
    const fresh = (await h.tasks.findById(A.id)) as Task;
    const again = await h.rescheduleService.apply(member, A.id, { dueDate: at("10-06T17:00:00"), expectedVersion: fresh.version, previewToken: p.previewToken });
    expect(again.status).toBe(202);
  });

  it("lô RUNNING đã áp dở lượt 1 mà treo → FAILED; thẻ đã áp GIỮ NGUYÊN (không hoàn tác/không áp đôi), không phát task.rescheduled", async () => {
    const batchId = await enqueue();
    const original = h.boards.findById.bind(h.boards);
    let calls = 0;
    jest.spyOn(h.boards, "findById").mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error("worker chết giữa lô"));
      return original(...args);
    });
    await expect(h.batchProcessor.process(batchId)).rejects.toThrow("worker chết giữa lô");
    jest.restoreAllMocks();
    const t1 = (await h.tasks.findById(chain[0].id)) as Task;
    expect(await h.batchRepo.findById(batchId)).toMatchObject({ status: "RUNNING", cursor: 2, appliedCount: 2 });
    h.outbox.events.length = 0;

    nowMs += (STALE + 1) * MIN; // `startedAt` của lô ≈ bây giờ (thật) ⇒ quá hạn sau STALE phút
    expect(await sweeper.sweep()).toEqual({ scanned: 1, failed: 1 });

    expect(await h.batchRepo.findById(batchId)).toMatchObject({ status: "FAILED", appliedCount: 2, cursor: 2, activeKey: `batch:${batchId}` });
    expect(((await h.tasks.findById(chain[0].id)) as Task).version).toBe(t1.version);
    expect(outboxOf("task.rescheduled")).toHaveLength(0);
    expect(outboxOf("task.reschedule-bulk.completed")[0].payload as unknown as TaskRescheduleBulkCompletedPayload).toMatchObject({ status: "FAILED", appliedCount: 2 });
    // Job BullMQ đến muộn thấy lô đã kết thúc ⇒ bỏ qua.
    expect(await h.batchProcessor.process(batchId)).toBe("SKIPPED");
  });

  it("chưa quá hạn → không đụng tới (QUEUED và RUNNING đều tính từ mốc bắt đầu)", async () => {
    const batchId = await enqueue();
    nowMs += (STALE - 1) * MIN;
    expect(await sweeper.sweep()).toEqual({ scanned: 0, failed: 0 });
    await h.batchRepo.markRunning(batchId, new Date(nowMs)); // vừa chạy: quá hạn tính từ startedAt, không phải createdAt
    nowMs += (STALE - 1) * MIN;
    expect(await sweeper.sweep()).toEqual({ scanned: 0, failed: 0 });
    expect(await h.batchRepo.findById(batchId)).toMatchObject({ status: "RUNNING", activeKey: `board:${board.id}` });
    expect(h.outbox.events).toHaveLength(0);
    nowMs += 2 * MIN; // giờ mới quá STALE phút kể từ startedAt
    expect(await sweeper.sweep()).toEqual({ scanned: 1, failed: 1 });
  });

  it("lô đã kết thúc (DONE/PARTIAL/FAILED) không bao giờ bị quét, dù cũ đến đâu", async () => {
    const batchId = await enqueue();
    expect(await h.batchProcessor.process(batchId)).toBe("DONE");
    h.outbox.events.length = 0;
    nowMs += 10 * 24 * 60 * MIN;
    expect(await sweeper.sweep()).toEqual({ scanned: 0, failed: 0 });
    expect(await h.batchRepo.findById(batchId)).toMatchObject({ status: "DONE" });
    expect(h.outbox.events).toHaveLength(0);
  });

  it("idempotent: quét lặp không phát thêm outbox/realtime; lô đua với worker vừa xong (đã kết thúc giữa findStale và fail) → không ghi đè", async () => {
    const batchId = await enqueue();
    nowMs += (STALE + 1) * MIN;
    expect(await sweeper.sweep()).toEqual({ scanned: 1, failed: 1 });
    const outboxCount = h.outbox.events.length;
    const eventCount = h.emitter.events.length;
    expect(await sweeper.sweep()).toEqual({ scanned: 0, failed: 0 });
    expect(await sweeper.sweep()).toEqual({ scanned: 0, failed: 0 });
    expect(h.outbox.events).toHaveLength(outboxCount);
    expect(h.emitter.events).toHaveLength(eventCount);

    // Đua: findStale thấy lô (còn RUNNING) nhưng worker kết thúc nó ngay trước khi sweeper gọi fail().
    const second = await h.batchRepo.create({ workspaceId: h.workspaceId, boardId: board.id, sourceTaskId: A.id, requestedBy: member.id, sourceDueDate: at(NEW_DUE), items: [] });
    const racing = new RescheduleBatchSweeper({
      batches: h.batchRepo,
      processor: {
        fail: async (id, msg) => {
          await h.batchProcessor.process(id); // worker kết thúc lô (DONE) trước khi fail() chạy
          return h.batchProcessor.fail(id, msg);
        },
      },
      clock: () => new Date(nowMs + 2 * (STALE + 1) * MIN),
    });
    expect(await racing.sweep()).toEqual({ scanned: 1, failed: 0 });
    expect(await h.batchRepo.findById(second.id)).toMatchObject({ status: "DONE" });
    expect(batchId).not.toBe(second.id);
  });

  it("trần mỗi lượt `sweepMax`: cũ nhất trước, phần còn lại xử lý ở lượt sau; `staleMinutes` tuỳ chỉnh được", async () => {
    const other = await h.createBoard(owner);
    const mk = (boardId: string) => h.batchRepo.create({ workspaceId: h.workspaceId, boardId, sourceTaskId: A.id, requestedBy: member.id, sourceDueDate: at(NEW_DUE), items: [] });
    const b1 = await mk(board.id);
    const b2 = await mk(other.id);
    const small = new RescheduleBatchSweeper({ batches: h.batchRepo, processor: h.batchProcessor, staleMinutes: 5, sweepMax: 1, clock: () => new Date(nowMs + 6 * MIN) });

    expect(await small.sweep()).toEqual({ scanned: 1, failed: 1 });
    expect((await h.batchRepo.findById(b1.id))!.status).toBe("FAILED"); // cũ nhất trước
    expect((await h.batchRepo.findById(b2.id))!.status).toBe("QUEUED");
    expect(await small.sweep()).toEqual({ scanned: 1, failed: 1 });
    expect((await h.batchRepo.findById(b2.id))!.status).toBe("FAILED");
    expect(await small.sweep()).toEqual({ scanned: 0, failed: 0 });
  });

  it("bảng không còn (ScopeNotFound khi ghi) → fail() nuốt lỗi, sweeper không ném và không tính là đã đóng", async () => {
    const batchId = await enqueue();
    nowMs += (STALE + 1) * MIN;
    jest.spyOn(h.boards, "touch").mockResolvedValue(false);
    expect(await sweeper.sweep()).toEqual({ scanned: 1, failed: 0 });
    expect((await h.batchRepo.findById(batchId))!.status).toBe("QUEUED");
  });
});
