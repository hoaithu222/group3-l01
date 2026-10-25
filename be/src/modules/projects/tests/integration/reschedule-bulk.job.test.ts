import { installMocks, redisStore } from "./projects-test-mocks";

/** Bắt processor mà file job đăng ký (`registerJob` giữ processor trong Map riêng tư) để gọi trực tiếp như worker. */
type JobLike = { id?: string; data: unknown; attemptsMade?: number; opts?: { attempts?: number } };
const registered = new Map<string, (job: JobLike) => Promise<unknown>>();
jest.mock("../../../../infrastructure/queue", () => ({
  ...jest.requireActual("../../../../infrastructure/queue"),
  registerJob: jest.fn((queue: string, name: string, fn: (job: JobLike) => Promise<unknown>) => {
    registered.set(`${queue}/${name}`, fn);
  }),
}));

import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, seedChain, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { getRescheduleNotificationHandler } from "../../jobs/task-detail-wiring";
import { PrismaRescheduleBatchRepository } from "../../repositories/reschedule-batch.repository.prisma";
import { RuntimeDependencyLimits, STATIC_DEPENDENCY_LIMITS } from "../../services/dependency-limits";
import type { TaskEventPayload } from "../../events/project-events";

// Mongo memory replset chậm (mỗi request/transaction tính bằng trăm ms trên Windows) — các ca có nhiều lời gọi tuần tự cần trần rộng hơn 5 s mặc định.
jest.setTimeout(90_000);

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };
type Preview = { mode: string; affectedCount: number; previewToken: string };

const NEW_DUE = "2026-10-05T10:00:00.000Z"; // +2 ngày so với hạn gốc 10-03 17:00 (+07)
const N = 10; // số thẻ SAU trong chuỗi (thu nhỏ từ 250 vì Mongo memory + Windows chậm; lượt = rescheduleSyncMax hiệu lực = 4)
const CHUNK = 4;
const day = (offset: number, time: "02:00" | "10:00"): string => new Date(Date.UTC(2026, 9, 4 + offset)).toISOString().slice(0, 10) + `T${time}:00.000Z`;

describe("projects p4-04 — lô dời lịch nền (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;
  let ids: string[]; // [root, T001 … T010]

  beforeAll(async () => {
    await ensureProjectIndexes();
    await import("../../jobs/task-reschedule-bulk.job");
    await import("../../jobs/reschedule-notification.consumer");
    await import("../../jobs/dependency-counts-rebuild.job");
  });
  beforeEach(async () => {
    installMocks();
    // Hạ `rescheduleSyncMax` (SystemConfig limits.task) còn 4: > 4 thẻ → lô nền, mỗi lượt 4 thẻ ⇒ vài lượt trên 10 thẻ.
    jest.spyOn(RuntimeDependencyLimits.prototype, "load").mockImplementation(async () => ({ ...(await STATIC_DEPENDENCY_LIMITS.load()), rescheduleSyncMax: CHUNK }));
    g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", L: "MEMBER", G: "GUEST" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data;
    ids = await seedChain(board.id, g.workspaceId, board.columns[0].id, g.ids.C, N, { assigneeId: g.ids.L });
  });
  afterEach(async () => {
    const wsIds = groups.map((x) => x.workspaceId);
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const task = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });
  const runJob = (batchId: string, job: Partial<JobLike> = {}) => registered.get("reports/task.reschedule-bulk")!({ id: `job-${batchId}`, data: { batchId }, attemptsMade: 0, opts: { attempts: 3 }, ...job });
  let batchIdsHolder: string[] = [];
  const outbox = (type: string) => prisma.outboxEvent.findMany({ where: { type, aggregateType: { in: ["Task", "RescheduleBatch"] }, aggregateId: { in: [...ids, ...batchIdsHolder] } } });

  async function enqueue(): Promise<string> {
    const p = (await api("post", `/tasks/${ids[0]}/reschedule-preview`, as("C"), { dueDate: NEW_DUE })).body.data as Preview;
    expect([p.mode, p.affectedCount]).toEqual(["BULK", N]);
    const res = await api("post", `/tasks/${ids[0]}/reschedule`, as("C"), { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken });
    expect(res.status).toBe(202);
    expect(res.body.data.affectedCount).toBe(N);
    batchIdsHolder = [res.body.data.batchId];
    return res.body.data.batchId;
  }

  it("registerJob: đăng ký đúng `reports/task.reschedule-bulk`, sink thông báo (task.events) và cron TĨNH `cron/dependency-counts.rebuild`", async () => {
    // (`resetMocks` xoá cài đặt của `registerJob` giả trước MỖI test ⇒ mọi file job phải import ở `beforeAll`.)
    expect(registered.has("reports/task.reschedule-bulk")).toBe(true);
    expect(registered.has("cron/dependency-counts.rebuild")).toBe(true);
  });

  it("PM2-27: 202 {batchId}; nguồn đổi ngay, thẻ sau chưa; lệnh thứ hai TASK_020; sửa 1 thẻ giữa lô → CONFLICT; lô PARTIAL; báo người yêu cầu; GET trạng thái đúng quyền", async () => {
    const batchId = await enqueue();

    // Trạng thái sau khi xếp lô: QUEUED giữ activeKey; job nền được ghi vào outbox (queue reports).
    const batch = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch).toMatchObject({ status: "QUEUED", activeKey: `board:${board.id}`, requestedBy: g.ids.C, sourceTaskId: ids[0], cursor: 0, appliedCount: 0, conflictCount: 0, affectedCount: N, startedAt: null, finishedAt: null, error: null });
    expect(batch.items.map((i) => i.taskId)).toEqual(ids.slice(1)); // sắp tô-pô
    expect((await task(ids[0])).dueDate?.toISOString()).toBe(NEW_DUE);
    expect((await task(ids[1])).version).toBe(1);
    const jobRow = (await prisma.outboxEvent.findMany({ where: { type: "task.reschedule-bulk", aggregateId: batchId } }))[0];
    expect(jobRow).toMatchObject({ queue: "reports", jobName: "task.reschedule-bulk", dedupeKey: `task.reschedule-bulk:batch:${batchId}` });
    expect(redisStore.has(`reschedule:board:${board.id}`)).toBe(false); // khoá Redis đã nhả, DB giữ chỗ

    // GET /reschedule-batches/:id — người yêu cầu và OWNER/ADMIN thấy; MEMBER khác/GUEST 404.
    const get = (who: string) => api("get", `/reschedule-batches/${batchId}`, as(who));
    expect((await get("C")).body.data).toMatchObject({ id: batchId, status: "QUEUED", affectedCount: N, appliedCount: 0, conflictCount: 0, conflicts: [], finishedAt: null });
    expect((await get("B")).status).toBe(200);
    expect((await get("A")).status).toBe(200);
    expect((await get("L")).status).toBe(404);
    expect((await get("G")).status).toBe(404);

    // Lệnh thứ hai trên cùng bảng khi lô đang giữ chỗ → 409 TASK_020.
    const p2 = (await api("post", `/tasks/${ids[0]}/reschedule-preview`, as("C"), { dueDate: "2026-10-06T10:00:00.000Z" })).body.data as Preview;
    const second = await api("post", `/tasks/${ids[0]}/reschedule`, as("B"), { dueDate: "2026-10-06T10:00:00.000Z", expectedVersion: 2, previewToken: p2.previewToken });
    expect([second.status, second.body.error.code]).toEqual([409, "TASK_020"]);

    // Một thẻ bị sửa giữa lô (T005: version tăng nhưng KHÔNG dời).
    await prisma.task.update({ where: { id: ids[5] }, data: { title: "Sửa giữa lô", version: { increment: 1 } } });
    const t5Before = await task(ids[5]);
    await runJob(batchId);

    const done = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(done).toMatchObject({ status: "PARTIAL", cursor: N, appliedCount: N - 1, conflictCount: 1, activeKey: `batch:${batchId}`, error: null });
    expect(done.startedAt).not.toBeNull();
    expect(done.finishedAt).not.toBeNull();
    expect(done.items.map((i) => i.result)).toEqual(ids.slice(1).map((_, i) => (i === 4 ? "CONFLICT" : "APPLIED")));

    for (let i = 1; i <= N; i += 1) {
      const t = await task(ids[i]);
      if (i === 5) {
        expect(t.dueDate?.toISOString()).toBe(t5Before.dueDate?.toISOString());
        expect(t.version).toBe(t5Before.version);
        continue;
      }
      expect([t.startDate?.toISOString(), t.dueDate?.toISOString(), t.version]).toEqual([day(i + 1, "02:00"), day(i + 1, "10:00"), 2]); // +2 ngày, giữ giờ trong ngày
    }
    const acts = await prisma.taskActivity.findMany({ where: { boardId: board.id, type: "RESCHEDULED" } });
    expect(acts).toHaveLength(N - 1);
    expect(acts[0].after).toMatchObject({ sourceTaskId: ids[0], rescheduleId: batchId, batchId });
    expect(await prisma.taskActivity.count({ where: { taskId: ids[5], type: "RESCHEDULED" } })).toBe(0);

    // Outbox: due-changed = thẻ đã áp + thẻ nguồn; MỘT task.rescheduled (thẻ đã áp); MỘT bulk-completed (PARTIAL 9/1).
    expect(await outbox("task.due-changed")).toHaveLength(N - 1 + 1);
    const rescheduled = await outbox("task.rescheduled");
    expect(rescheduled).toHaveLength(1);
    expect((rescheduled[0].payload as { items: { taskId: string }[] }).items.map((i) => i.taskId)).toEqual(ids.slice(1).filter((_, i) => i !== 4));
    const completed = await outbox("task.reschedule-bulk.completed");
    expect(completed).toHaveLength(1);
    expect(completed[0].payload).toMatchObject({ batchId, requestedBy: g.ids.C, status: "PARTIAL", appliedCount: N - 1, conflictCount: 1 });

    // GET trạng thái sau khi xong: liệt kê xung đột kèm tiêu đề hiện tại.
    expect((await get("C")).body.data).toMatchObject({ status: "PARTIAL", appliedCount: N - 1, conflictCount: 1, conflicts: [{ taskId: ids[5], title: "Sửa giữa lô" }] });

    // Sink thông báo: người yêu cầu nhận TASK_RESCHEDULE_BATCH_DONE; Lan (người làm T001) nhận MỘT TASK_RESCHEDULED.
    const handler = getRescheduleNotificationHandler();
    await handler.handle(completed[0].payload as unknown as TaskEventPayload);
    await handler.handle(rescheduled[0].payload as unknown as TaskEventPayload);
    await handler.handle(rescheduled[0].payload as unknown as TaskEventPayload); // retry
    const doneNote = await prisma.notification.findMany({ where: { workspaceId: g.workspaceId, type: "task.reschedule-batch-done" } });
    expect(doneNote).toHaveLength(1);
    expect(doneNote[0].refs).toMatchObject({ batchId, boardId: board.id, status: "PARTIAL", appliedCount: N - 1, conflictCount: 1 });
    expect((await prisma.notificationRecipient.findMany({ where: { notificationId: doneNote[0].id } })).map((r) => r.recipientId)).toEqual([g.ids.C]);
    const moved = await prisma.notification.findMany({ where: { workspaceId: g.workspaceId, type: "task.rescheduled" } });
    expect(moved).toHaveLength(1);
    expect((await prisma.notificationRecipient.findMany({ where: { notificationId: moved[0].id } })).map((r) => r.recipientId)).toEqual([g.ids.L]);

    // Bảng không còn bị chặn: lệnh dời mới không gặp TASK_020.
    const p3 = (await api("post", `/tasks/${ids[0]}/reschedule-preview`, as("C"), { dueDate: "2026-10-06T10:00:00.000Z" })).body.data as Preview;
    const third = await api("post", `/tasks/${ids[0]}/reschedule`, as("C"), { dueDate: "2026-10-06T10:00:00.000Z", expectedVersion: 2, previewToken: p3.previewToken });
    expect([200, 202]).toContain(third.status);

    // Job chạy lại sau khi kết thúc (BullMQ trùng) → không đổi gì.
    const versions = await Promise.all(ids.map(async (id) => (await task(id)).version));
    await runJob(batchId);
    expect(await Promise.all(ids.map(async (id) => (await task(id)).version))).toEqual(versions);
  }, 120_000);

  it("kill giữa lượt (transaction lượt 2 bị huỷ TRƯỚC khi commit) → thẻ của lượt 2 KHÔNG đổi (rollback thật), retry chạy tiếp từ cursor và KHÔNG áp đôi", async () => {
    const batchId = await enqueue();
    const original = PrismaRescheduleBatchRepository.prototype.recordProgress;
    let calls = 0;
    jest.spyOn(PrismaRescheduleBatchRepository.prototype, "recordProgress").mockImplementation(function (this: PrismaRescheduleBatchRepository, ...args) {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error("worker chết giữa lượt 2")); // SAU khi 4 thẻ của lượt 2 đã updateMany trong transaction
      return original.apply(this, args);
    });

    await expect(runJob(batchId)).rejects.toThrow("worker chết giữa lượt 2");
    const mid = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(mid).toMatchObject({ status: "RUNNING", cursor: CHUNK, appliedCount: CHUNK, conflictCount: 0, activeKey: `board:${board.id}` });
    for (let i = 1; i <= N; i += 1) expect([i, (await task(ids[i])).version]).toEqual([i, i <= CHUNK ? 2 : 1]); // lượt 2 đã ROLLBACK
    expect(await prisma.taskActivity.count({ where: { boardId: board.id, type: "RESCHEDULED" } })).toBe(CHUNK);
    expect(await outbox("task.reschedule-bulk.completed")).toHaveLength(0);

    await runJob(batchId, { attemptsMade: 1 }); // BullMQ retry (`recordProgress` các lần sau chạy thật)
    const done = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(done).toMatchObject({ status: "DONE", cursor: N, appliedCount: N, conflictCount: 0, activeKey: `batch:${batchId}` });
    for (let i = 1; i <= N; i += 1) {
      const t = await task(ids[i]);
      expect([t.version, t.dueVersion, t.dueDate?.toISOString()]).toEqual([2, 2, day(i + 1, "10:00")]); // đúng MỘT lần mỗi thẻ
    }
    expect(await prisma.taskActivity.count({ where: { boardId: board.id, type: "RESCHEDULED" } })).toBe(N);
    expect(await outbox("task.due-changed")).toHaveLength(N + 1);
    expect(await outbox("task.reschedule-bulk.completed")).toHaveLength(1);
    expect(await outbox("task.rescheduled")).toHaveLength(1);
  }, 120_000);

  it("hết lượt retry → lô FAILED: nhả activeKey, phát bulk-completed (FAILED) nhưng KHÔNG task.rescheduled; bảng dời lịch lại được", async () => {
    const batchId = await enqueue();
    jest.spyOn(PrismaRescheduleBatchRepository.prototype, "recordProgress").mockRejectedValue(new Error("Mongo sập"));

    // Lần thử cuối (attemptsMade 2 / attempts 3) → processor tự ghi FAILED rồi ném lại để BullMQ đánh dấu job failed.
    await expect(runJob(batchId, { attemptsMade: 2, opts: { attempts: 3 } })).rejects.toThrow("Mongo sập");
    const failed = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(failed).toMatchObject({ status: "FAILED", activeKey: `batch:${batchId}`, error: "Mongo sập", appliedCount: 0 });
    expect(await outbox("task.reschedule-bulk.completed")).toEqual([expect.objectContaining({ payload: expect.objectContaining({ status: "FAILED", batchId }) })]);
    expect(await outbox("task.rescheduled")).toHaveLength(0);
    for (let i = 1; i <= N; i += 1) expect((await task(ids[i])).version).toBe(1); // không thẻ nào đổi

    expect((await api("get", `/reschedule-batches/${batchId}`, as("C"))).body.data).toMatchObject({ status: "FAILED", appliedCount: 0 });
    const p = (await api("post", `/tasks/${ids[0]}/reschedule-preview`, as("C"), { dueDate: "2026-10-06T10:00:00.000Z" })).body.data as Preview;
    const again = await api("post", `/tasks/${ids[0]}/reschedule`, as("C"), { dueDate: "2026-10-06T10:00:00.000Z", expectedVersion: 2, previewToken: p.previewToken });
    expect(again.status).not.toBe(409);
  }, 120_000);

  it("cron `reschedule-batch.sweep` (truy vấn Prisma thật): lô QUEUED/RUNNING treo quá hạn → FAILED + nhả activeKey + báo người yêu cầu; lô mới/đang chạy dở không đụng tới; quét lặp vô hại; bảng dời lại được", async () => {
    expect(registered.has("cron/reschedule-batch.sweep")).toBe(true);
    const sweepJob = () => registered.get("cron/reschedule-batch.sweep")!({ id: "cron-sweep", data: {} });
    const statusOf = async (id: string) => (await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id } })).status;
    const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000);

    const first = await enqueue();
    await sweepJob(); // vừa xếp → chưa quá hạn
    expect(await statusOf(first)).toBe("QUEUED");

    await prisma.rescheduleBatch.update({ where: { id: first }, data: { createdAt: ago(31) } });
    await sweepJob();
    expect(await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: first } })).toMatchObject({ status: "FAILED", activeKey: `batch:${first}`, appliedCount: 0 });
    await sweepJob(); // idempotent
    expect(await outbox("task.reschedule-bulk.completed")).toEqual([expect.objectContaining({ payload: expect.objectContaining({ status: "FAILED", batchId: first }) })]);
    expect(await outbox("task.rescheduled")).toHaveLength(0);
    for (let i = 1; i <= N; i += 1) expect((await task(ids[i])).version).toBe(1);

    // Bảng không còn bị chặn (TASK_020): xếp lô mới. Lô RUNNING mà `startedAt` mới (createdAt cũ) → chưa treo; `startedAt` cũ → treo.
    const p = (await api("post", `/tasks/${ids[0]}/reschedule-preview`, as("C"), { dueDate: "2026-10-06T10:00:00.000Z" })).body.data as Preview;
    const res = await api("post", `/tasks/${ids[0]}/reschedule`, as("C"), { dueDate: "2026-10-06T10:00:00.000Z", expectedVersion: 2, previewToken: p.previewToken });
    expect(res.status).toBe(202);
    const second = res.body.data.batchId as string;
    batchIdsHolder = [first, second];
    await prisma.rescheduleBatch.update({ where: { id: second }, data: { status: "RUNNING", createdAt: ago(120), startedAt: ago(5) } });
    await sweepJob();
    expect(await statusOf(second)).toBe("RUNNING");
    await prisma.rescheduleBatch.update({ where: { id: second }, data: { startedAt: ago(45) } });
    await sweepJob();
    expect(await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: second } })).toMatchObject({ status: "FAILED", activeKey: `batch:${second}` });
    expect(await prisma.rescheduleBatch.count({ where: { boardId: board.id, activeKey: { startsWith: "board:" } } })).toBe(0);
  }, 120_000);

  it("hai worker cùng chạy MỘT lô (job trùng/stalled): CAS theo cursor + write-conflict ⇒ không thẻ nào bị áp đôi; chạy lại cho tới khi xong", async () => {
    const batchId = await enqueue();
    await Promise.allSettled([runJob(batchId), runJob(batchId)]);
    for (let i = 0; i < 6; i += 1) {
      const b = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } });
      if (b.status === "DONE") break;
      await runJob(batchId, { attemptsMade: i + 1 }).catch(() => undefined); // BullMQ retry
    }
    const done = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(done).toMatchObject({ status: "DONE", cursor: N, appliedCount: N, conflictCount: 0 });
    for (let i = 1; i <= N; i += 1) expect([i, (await task(ids[i])).version]).toEqual([i, 2]);
    expect(await prisma.taskActivity.count({ where: { boardId: board.id, type: "RESCHEDULED" } })).toBe(N);
    expect(await outbox("task.reschedule-bulk.completed")).toHaveLength(1);
    expect(await outbox("task.rescheduled")).toHaveLength(1);
  }, 120_000);

  it("thẻ CHỈ có startDate (không hạn) vẫn dời được trong lô nền: lưu epoch ở biên Prisma nhưng domain/hiển thị vẫn là null; không phát due-changed cho thẻ đó", async () => {
    // T5 chỉ có ngày bắt đầu ⇒ affected = T1..T5 (5 > 4 ⇒ lô nền); thẻ không hạn không lan truyền tiếp.
    await prisma.task.update({ where: { id: ids[5] }, data: { dueDate: null } });
    const p = (await api("post", `/tasks/${ids[0]}/reschedule-preview`, as("C"), { dueDate: NEW_DUE })).body.data as Preview & { affected: { taskId: string; newDueDate: string | null }[] };
    expect([p.mode, p.affectedCount]).toEqual(["BULK", 5]);
    expect(p.affected[4]).toMatchObject({ taskId: ids[5], newDueDate: null });
    const res = await api("post", `/tasks/${ids[0]}/reschedule`, as("C"), { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken });
    expect(res.status).toBe(202);
    const batchId = res.body.data.batchId as string;
    batchIdsHolder = [batchId];

    const stored = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(stored.items[4].oldDueDate.getTime()).toBe(0); // sentinel epoch (schema: DateTime bắt buộc)
    expect(stored.items[3].oldDueDate.getTime()).not.toBe(0);

    await runJob(batchId);
    const t5 = await task(ids[5]);
    expect(t5.dueDate).toBeNull(); // KHÔNG bị ghi thành epoch
    expect(t5.startDate?.toISOString()).toBe(day(6, "02:00")); // +2 ngày (gốc: 10-08 → 10-10)
    expect((await task(ids[6])).version).toBe(1); // thẻ sau thẻ-không-hạn không bị kéo
    const acts = await prisma.taskActivity.findMany({ where: { taskId: ids[5], type: "RESCHEDULED" } });
    expect(acts).toHaveLength(1);
    expect(acts[0].after).toMatchObject({ dueDate: null, startDate: day(6, "02:00") });
    expect((await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: batchId } })).status).toBe("DONE");
    // due-changed: thẻ nguồn + T1..T4 (thẻ không hạn không đổi hạn ⇒ không có sự kiện).
    expect((await outbox("task.due-changed")).map((e) => e.aggregateId).sort()).toEqual([ids[0], ids[1], ids[2], ids[3], ids[4]].sort());
  });

  it("payload sai định dạng / lô không tồn tại → bỏ qua, không ném (không retry vô ích)", async () => {
    await expect(registered.get("reports/task.reschedule-bulk")!({ id: "j", data: { batchId: "khong-phai-id" } })).resolves.toBeUndefined();
    await expect(registered.get("reports/task.reschedule-bulk")!({ id: "j", data: null })).resolves.toBeUndefined();
    await expect(runJob("f".repeat(24))).resolves.toBeUndefined();
  });

  it("PM2-27 (kích thước thật): chuỗi 250 thẻ → 202 (không cần chạy lô); lệnh thứ hai TASK_020", async () => {
    jest.spyOn(RuntimeDependencyLimits.prototype, "load").mockRestore();
    const big = (await api("post", `/workspaces/${g.workspaceId}/boards`, as("A"), { name: "Bảng 250" })).body.data as Board;
    const chain = await seedChain(big.id, g.workspaceId, big.columns[0].id, g.ids.C, 250);
    const p = (await api("post", `/tasks/${chain[0]}/reschedule-preview`, as("C"), { dueDate: NEW_DUE })).body.data as Preview;
    expect([p.mode, p.affectedCount]).toEqual(["BULK", 250]); // mặc định rescheduleSyncMax = 200
    const res = await api("post", `/tasks/${chain[0]}/reschedule`, as("C"), { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken });
    expect([res.status, res.body.data.affectedCount]).toEqual([202, 250]);
    const batch = await prisma.rescheduleBatch.findUniqueOrThrow({ where: { id: res.body.data.batchId } });
    expect(batch.items).toHaveLength(250);
    expect(batch.items[0].taskId).toBe(chain[1]);

    const p2 = (await api("post", `/tasks/${chain[0]}/reschedule-preview`, as("C"), { dueDate: "2026-10-06T10:00:00.000Z" })).body.data as Preview;
    const second = await api("post", `/tasks/${chain[0]}/reschedule`, as("B"), { dueDate: "2026-10-06T10:00:00.000Z", expectedVersion: 2, previewToken: p2.previewToken });
    expect([second.status, second.body.error.code]).toEqual([409, "TASK_020"]);
  }, 120_000);
});
