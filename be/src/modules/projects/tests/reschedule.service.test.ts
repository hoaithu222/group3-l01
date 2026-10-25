// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { newObjectId } from "../../../core/utils/object-id";
import type { Board } from "../entities/board.interface";
import type { Task } from "../entities/task.interface";
import type { TaskDueChangedPayload, TaskRescheduledPayload } from "../events/project-events";
import type { RescheduleOutcome } from "../services/reschedule.service";
import { rescheduleLockKey } from "../services/reschedule-lock";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let admin: AuthUser;
let member: AuthUser;
let lan: AuthUser;
let guest: AuthUser;
let board: Board;
let A: Task;
let B: Task;
let C: Task;

const at = (s: string): Date => new Date(`2026-${s}+07:00`);
const fresh = async (t: Task): Promise<Task> => (await h.tasks.findById(t.id)) as Task;

const err = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};

/** A → B → C; B do Lan làm. Hạn A 10-03; lùi A tới 10-05 (+2 ngày) kéo B và C cùng +2 ngày. */
beforeEach(async () => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  admin = h.addUser("ADMIN");
  member = h.addUser("MEMBER");
  lan = h.addUser("MEMBER");
  guest = h.addUser("GUEST");
  board = await h.createBoard(owner);
  const mk = (title: string, start: string, due: string, who: string[] = []) =>
    h.addDatedTask(member, board, title, { start: `2026-${start}+07:00`, due: `2026-${due}+07:00` }, who);
  A = await mk("A", "10-01T09:00:00", "10-03T17:00:00");
  B = await mk("B", "10-04T09:00:00", "10-06T17:00:00", [lan.id]);
  C = await mk("C", "10-07T09:00:00", "10-10T17:00:00");
  await h.dependencyService.add(member, B.id, A.id);
  await h.dependencyService.add(member, C.id, B.id);
  A = await fresh(A);
  B = await fresh(B);
  C = await fresh(C);
  h.emitter.events.length = 0;
  h.outbox.events.length = 0;
  h.activities.activities.length = 0;
});

const NEW_DUE = "10-05T17:00:00";
const preview = (due = NEW_DUE, user = member) => h.rescheduleService.preview(user, A.id, { dueDate: at(due) });
const apply = async (due = NEW_DUE, user = member, over: { expectedVersion?: number; previewToken?: string } = {}): Promise<RescheduleOutcome> => {
  const p = await preview(due, user);
  return h.rescheduleService.apply(user, A.id, {
    dueDate: at(due),
    expectedVersion: over.expectedVersion ?? A.version,
    previewToken: over.previewToken ?? p.previewToken,
  });
};
const outboxOf = (type: string) => h.outbox.events.filter((e) => e.type === type);
const snapshot = () => JSON.stringify([[...h.tasks.tasks.values()], h.outbox.events, h.activities.activities, h.emitter.events]);

describe("reschedule.service.preview (chỉ đọc)", () => {
  it("trả kế hoạch: mode SYNC, affected theo tô-pô (ngày cũ → mới, +shiftDays, người làm), timezone, previewToken; KHÔNG ghi gì", async () => {
    const before = snapshot();
    const p = await preview();
    expect(snapshot()).toBe(before); // không thẻ/outbox/activity/emit nào đổi
    expect(p).toMatchObject({ mode: "SYNC", affectedCount: 2, truncated: false, skipped: [], timezone: "Asia/Ho_Chi_Minh", source: { taskId: A.id, version: A.version } });
    expect(p.source.oldDueDate).toBe(at("10-03T17:00:00").toISOString());
    expect(p.source.newDueDate).toBe(at(NEW_DUE).toISOString());
    expect(p.affected.map((a) => [a.taskId, a.shiftDays])).toEqual([[B.id, 2], [C.id, 2]]);
    expect(p.affected[0]).toMatchObject({
      title: "B",
      assigneeIds: [lan.id],
      oldStartDate: at("10-04T09:00:00").toISOString(),
      newStartDate: at("10-06T09:00:00").toISOString(),
      oldDueDate: at("10-06T17:00:00").toISOString(),
      newDueDate: at("10-08T17:00:00").toISOString(),
    });
    expect(p.previewToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it("quyền: GUEST/người ngoài 404; bảng đã lưu trữ vẫn xem trước được", async () => {
    expect((await err(preview(NEW_DUE, guest))).statusCode).toBe(404);
    expect((await err(preview(NEW_DUE, { id: newObjectId(), email: "x@e.com" }))).statusCode).toBe(404);
    await h.boardService.archive(owner, board.id);
    expect((await preview()).affectedCount).toBe(2);
  });

  it("TASK_021: chuỗi vượt rescheduleBulkMax hiệu lực", async () => {
    h.limitsOverride = { rescheduleBulkMax: 1 };
    const e = await err(preview());
    expect([e.statusCode, e.errorCode]).toEqual([409, "TASK_021"]);
  });
});

describe("reschedule.service.apply — đồng bộ (be.md §5.4, PM2-04)", () => {
  it("PM2-04: áp một lệnh → 200; thẻ sau dời +2 ngày GIỮ thời lượng; activity RESCHEDULED ghi nguồn A; outbox due-changed từng thẻ + MỘT task.rescheduled", async () => {
    const dueVersions = [A.dueVersion, B.dueVersion, C.dueVersion];
    const out = await apply();
    expect(out.status).toBe(200);
    const data = (out as Extract<RescheduleOutcome, { status: 200 }>).data;
    expect(data.skipped).toEqual([]);
    // Thẻ nguồn đứng đầu, rồi các thẻ sau theo tô-pô; `version` là phiên bản MỚI.
    expect(data.applied.map((x) => x.taskId)).toEqual([A.id, B.id, C.id]);
    expect(data.applied[1]).toMatchObject({ newStartDate: at("10-06T09:00:00").toISOString(), newDueDate: at("10-08T17:00:00").toISOString(), version: B.version + 1 });

    const [a, b, c] = [await fresh(A), await fresh(B), await fresh(C)];
    expect(a.dueDate?.toISOString()).toBe(at(NEW_DUE).toISOString());
    expect([a.version, b.version, c.version]).toEqual([A.version + 1, B.version + 1, C.version + 1]);
    expect([a.dueVersion, b.dueVersion, c.dueVersion]).toEqual(dueVersions.map((v) => v + 1));
    expect(b.startDate?.toISOString()).toBe(at("10-06T09:00:00").toISOString());
    expect(b.dueDate?.toISOString()).toBe(at("10-08T17:00:00").toISOString());
    expect(c.startDate?.toISOString()).toBe(at("10-09T09:00:00").toISOString());
    expect((b.dueDate as Date).getTime() - (b.startDate as Date).getTime()).toBe((B.dueDate as Date).getTime() - (B.startDate as Date).getTime());

    // Activity: A ghi DUE_CHANGED (như PATCH); B, C ghi RESCHEDULED kèm nguồn + id lệnh, người thực hiện = member.
    const acts = h.activities.activities;
    expect(acts.filter((x) => x.taskId === A.id).map((x) => x.type)).toEqual(["DUE_CHANGED"]);
    const resB = acts.find((x) => x.taskId === B.id && x.type === "RESCHEDULED");
    expect(resB).toMatchObject({
      actorId: member.id,
      before: { startDate: at("10-04T09:00:00").toISOString(), dueDate: at("10-06T17:00:00").toISOString() },
      after: { startDate: at("10-06T09:00:00").toISOString(), dueDate: at("10-08T17:00:00").toISOString(), sourceTaskId: A.id, rescheduleId: data.rescheduleId },
    });
    expect(acts.filter((x) => x.type === "RESCHEDULED")).toHaveLength(2);

    // Outbox: mỗi thẻ đổi hạn một `task.due-changed` (dedupeKey theo dueVersion mới); MỘT `task.rescheduled` cho cả lệnh.
    const due = outboxOf("task.due-changed");
    expect(due.map((e) => e.dedupeKey).sort()).toEqual(
      [`task.due-changed:task:${A.id}:d${a.dueVersion}`, `task.due-changed:task:${B.id}:d${b.dueVersion}`, `task.due-changed:task:${C.id}:d${c.dueVersion}`].sort()
    );
    expect((due.find((e) => e.aggregateId === B.id)?.payload as unknown as TaskDueChangedPayload).newDue).toBe(at("10-08T17:00:00").toISOString());
    const rescheduled = outboxOf("task.rescheduled");
    expect(rescheduled).toHaveLength(1);
    expect(rescheduled[0]).toMatchObject({ queue: "notifications", jobName: "task.events", dedupeKey: `task.rescheduled:op:${data.rescheduleId}` });
    const payload = rescheduled[0].payload as unknown as TaskRescheduledPayload;
    expect(payload).toMatchObject({ event: "task.rescheduled", taskId: A.id, sourceTaskId: A.id, rescheduleId: data.rescheduleId, batchId: null, actorId: member.id, boardId: board.id });
    expect(payload.items.map((i) => [i.taskId, i.assigneeIds])).toEqual([[B.id, [lan.id]], [C.id, []]]);

    // Realtime: ≤ 50 thẻ → task:updated từng thẻ (changed ["dates"]); không có board:rescheduled.
    const updated = h.emitter.of("task:updated").map((e) => e.payload as { task: { id: string }; changed: string[]; actorId: string });
    expect(updated.map((u) => u.task.id).sort()).toEqual([A.id, B.id, C.id].sort());
    expect(updated.every((u) => u.changed[0] === "dates" && u.actorId === member.id)).toBe(true);
    expect(h.emitter.of("board:rescheduled")).toHaveLength(0);
    expect(h.lock.held.size).toBe(0);
  });

  it("thẻ nguồn KHÔNG đổi ngày (cùng hạn) mà vẫn có thẻ sau vi phạm: chỉ dời thẻ sau, không ghi thẻ nguồn", async () => {
    // Đặt B lệch (bắt đầu 10-02, trước hạn A 10-03) rồi "dời lịch" với đúng hạn cũ của A.
    h.setTask(B.id, { startDate: at("10-02T09:00:00"), dueDate: at("10-04T17:00:00") });
    B = await fresh(B);
    const out = await apply("10-03T17:00:00");
    const data = (out as Extract<RescheduleOutcome, { status: 200 }>).data;
    expect(data.applied.map((x) => x.taskId)).not.toContain(A.id);
    expect((await fresh(A)).version).toBe(A.version);
    expect(h.activities.activities.some((x) => x.taskId === A.id)).toBe(false);
    expect(outboxOf("task.due-changed").some((e) => e.aggregateId === A.id)).toBe(false);
    expect((await fresh(B)).startDate?.toISOString()).toBe(at("10-04T09:00:00").toISOString());
  });

  it("startDate của thẻ nguồn: vắng = GIỮ, có giá trị = đổi (kéo cả thanh Gantt), null = XOÁ (như PATCH); thẻ sau luôn tính theo hạn mới", async () => {
    const step = async (due: string, startDate: Date | null | undefined) => {
      const src = await fresh(A);
      const input = { dueDate: at(due), ...(startDate !== undefined && { startDate }) };
      const p = await h.rescheduleService.preview(member, A.id, input);
      const out = await h.rescheduleService.apply(member, A.id, { ...input, expectedVersion: src.version, previewToken: p.previewToken });
      expect(out.status).toBe(200);
      return fresh(A);
    };
    const originalStart = A.startDate?.toISOString();

    const kept = await step(NEW_DUE, undefined); // vắng ⇒ giữ
    expect(kept.startDate?.toISOString()).toBe(originalStart);
    expect(h.activities.activities.filter((x) => x.taskId === A.id).map((x) => x.type)).toEqual(["DUE_CHANGED"]);

    const moved = await step("10-08T17:00:00", at("10-02T09:00:00")); // kéo cả thanh
    expect(moved.startDate?.toISOString()).toBe(at("10-02T09:00:00").toISOString());
    expect(moved.dueDate?.toISOString()).toBe(at("10-08T17:00:00").toISOString());
    expect(h.activities.activities.filter((x) => x.taskId === A.id).map((x) => x.type).sort()).toEqual(["DUE_CHANGED", "DUE_CHANGED", "START_CHANGED"]);

    const cleared = await step("10-09T17:00:00", null); // null ⇒ xoá
    expect(cleared.startDate).toBeNull();
    expect((await fresh(B)).startDate?.toISOString()).toBe(at("10-10T09:00:00").toISOString()); // B (giữ thời lượng) dời theo hạn A = 10-09 → bắt đầu 10-10
  });

  it("không thẻ nào bị ảnh hưởng (rút ngắn hạn): 200, chỉ thẻ nguồn đổi, KHÔNG có task.rescheduled", async () => {
    const out = await apply("10-02T17:00:00");
    const data = (out as Extract<RescheduleOutcome, { status: 200 }>).data;
    expect(data.applied.map((x) => x.taskId)).toEqual([A.id]);
    expect(outboxOf("task.rescheduled")).toHaveLength(0);
    expect((await fresh(B)).version).toBe(B.version);
  });

  it("thẻ DONE / không ngày vào `skipped` và KHÔNG bị dời (PM2-25)", async () => {
    const F = await h.addDatedTask(member, board, "F", { start: "2026-10-04T09:00:00+07:00", due: "2026-10-05T17:00:00+07:00" });
    const E = await h.addDatedTask(member, board, "E", {});
    await h.dependencyService.add(member, F.id, A.id);
    await h.dependencyService.add(member, E.id, A.id);
    h.setTask(F.id, { columnKind: "DONE" });
    A = await fresh(A);
    const fBefore = await fresh(F);
    const out = await apply();
    const data = (out as Extract<RescheduleOutcome, { status: 200 }>).data;
    expect(data.skipped.map((s) => [s.taskId, s.reason]).sort()).toEqual([[E.id, "NO_DATES"], [F.id, "DONE"]].sort());
    expect((await fresh(F)).version).toBe(fBefore.version);
    expect(data.applied.map((x) => x.taskId)).toEqual([A.id, B.id, C.id]);
  });

  it("RES_003: thẻ nguồn lệch version → 409 kèm currentVersion; không khoá còn sót, không ghi gì", async () => {
    const before = snapshot();
    const e = await err(apply(NEW_DUE, member, { expectedVersion: A.version - 1 }));
    expect([e.statusCode, e.errorCode, e.details]).toEqual([409, "RES_003", { currentVersion: A.version }]);
    expect(snapshot()).toBe(before);
    expect(h.lock.held.size).toBe(0);
  });

  it("PM2-26: xem trước rồi người khác sửa hạn thẻ C → áp với token cũ → 409 TASK_019 kèm bản xem trước MỚI; không ghi gì; nhả khoá", async () => {
    const p = await preview();
    h.setTask(C.id, { dueDate: at("10-30T17:00:00"), startDate: at("10-25T09:00:00"), version: C.version + 1 });
    const before = snapshot();
    const e = await err(h.rescheduleService.apply(member, A.id, { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: p.previewToken }));
    expect([e.statusCode, e.errorCode]).toEqual([409, "TASK_019"]);
    const fresher = (e.details as { preview: { previewToken: string; affected: { taskId: string }[] } }).preview;
    expect(fresher.previewToken).not.toBe(p.previewToken);
    expect(fresher.affected.map((x) => x.taskId)).toEqual([B.id]); // C giờ đã đủ xa, không còn bị dời
    expect(snapshot()).toBe(before);
    expect(h.lock.held.size).toBe(0);
    // Dùng token mới thì áp được.
    const ok = await h.rescheduleService.apply(member, A.id, { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: fresher.previewToken });
    expect(ok.status).toBe(200);
  });

  it("TASK_020: bảng đang bị giữ khoá Redis, hoặc còn lô nền chưa xong → 409 và nhả khoá của mình", async () => {
    const p = await preview();
    const body = { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: p.previewToken };
    h.lock.held.set(rescheduleLockKey(board.id), "rs-khac");
    expect((await err(h.rescheduleService.apply(member, A.id, body))).errorCode).toBe("TASK_020");
    expect(h.lock.held.get(rescheduleLockKey(board.id))).toBe("rs-khac"); // không nhả nhầm khoá của lệnh khác

    h.lock.held.clear();
    await h.batchRepo.create({ workspaceId: h.workspaceId, boardId: board.id, sourceTaskId: A.id, requestedBy: member.id, sourceDueDate: at(NEW_DUE), items: [] });
    const e = await err(h.rescheduleService.apply(member, A.id, body));
    expect([e.statusCode, e.errorCode]).toEqual([409, "TASK_020"]);
    expect(h.lock.held.size).toBe(0);
  });

  it("hai lệnh SONG SONG trên cùng bảng: đúng một thắng, lệnh còn lại TASK_020 (khoá theo bảng)", async () => {
    const p = await preview();
    const body = { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: p.previewToken };
    const results = await Promise.allSettled([h.rescheduleService.apply(member, A.id, body), h.rescheduleService.apply(admin, A.id, body)]);
    const codes = results.map((r) => (r.status === "fulfilled" ? "OK" : (r.reason as AppError).errorCode));
    expect(codes.sort()).toEqual(["OK", "TASK_020"]);
    expect(outboxOf("task.rescheduled")).toHaveLength(1);
  });

  it("TASK_013: hạn mới trước ngày bắt đầu của thẻ nguồn → 400; quyền: GUEST 404, bảng lưu trữ 403", async () => {
    const e = await err(h.rescheduleService.apply(member, A.id, { dueDate: at("09-20T17:00:00"), expectedVersion: A.version, previewToken: "a".repeat(64) }));
    expect([e.statusCode, e.errorCode]).toEqual([400, "TASK_013"]);
    expect((await err(h.rescheduleService.apply(guest, A.id, { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: "a".repeat(64) }))).statusCode).toBe(404);
    const p = await preview();
    await h.boardService.archive(owner, board.id);
    expect((await err(h.rescheduleService.apply(member, A.id, { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: p.previewToken }))).statusCode).toBe(403);
  });

  it("> rescheduleEmitEachMax thẻ → MỘT board:rescheduled thay cho task:updated từng thẻ sau (thẻ nguồn vẫn có task:updated)", async () => {
    h.limitsOverride = { rescheduleEmitEachMax: 1 };
    const out = await apply();
    expect(out.status).toBe(200);
    expect(h.emitter.of("task:updated").map((e) => (e.payload as { task: { id: string } }).task.id)).toEqual([A.id]);
    const bulk = h.emitter.of("board:rescheduled");
    expect(bulk).toHaveLength(1);
    expect(bulk[0].payload).toMatchObject({ boardId: board.id, taskIds: [B.id, C.id], count: 2, final: true });
    expect((bulk[0].payload as { rescheduleId: string }).rescheduleId).toBe((out as Extract<RescheduleOutcome, { status: 200 }>).data.rescheduleId);
  });
});

describe("reschedule.service.apply — lô nền (be.md §5.4 bước 3, PM2-27)", () => {
  it("> rescheduleSyncMax thẻ → 202 {batchId, affectedCount}: nguồn đổi ngay, thẻ sau CHƯA đổi, batch QUEUED giữ activeKey, outbox job reports; lệnh thứ hai TASK_020", async () => {
    h.limitsOverride = { rescheduleSyncMax: 1 };
    expect((await preview()).mode).toBe("BULK");
    const out = await apply();
    expect(out.status).toBe(202);
    const { batchId, affectedCount } = (out as Extract<RescheduleOutcome, { status: 202 }>).data;
    expect(affectedCount).toBe(2);

    const batch = (await h.batchRepo.findById(batchId))!;
    expect(batch).toMatchObject({ status: "QUEUED", activeKey: `board:${board.id}`, requestedBy: member.id, sourceTaskId: A.id, cursor: 0, affectedCount: 2, boardId: board.id });
    expect(batch.items.map((i) => [i.taskId, i.expectedVersion, i.result])).toEqual([[B.id, B.version, null], [C.id, C.version, null]]);
    expect(batch.items[0].assigneeIds).toEqual([lan.id]);

    expect((await fresh(A)).dueDate?.toISOString()).toBe(at(NEW_DUE).toISOString());
    expect((await fresh(B)).version).toBe(B.version);
    expect(outboxOf("task.due-changed").map((e) => e.aggregateId)).toEqual([A.id]);
    expect(outboxOf("task.rescheduled")).toHaveLength(0);
    const job = outboxOf("task.reschedule-bulk");
    expect(job).toHaveLength(1);
    expect(job[0]).toMatchObject({ queue: "reports", jobName: "task.reschedule-bulk", aggregateId: batchId, dedupeKey: `task.reschedule-bulk:batch:${batchId}`, payload: { batchId, boardId: board.id } });
    expect(h.lock.held.size).toBe(0);

    A = await fresh(A);
    const e = await err(apply("10-06T17:00:00"));
    expect([e.statusCode, e.errorCode]).toEqual([409, "TASK_020"]);
  });
});

describe("TaskDetailService — ReschedulePolicy (PATCH lùi hạn, be.md §5.5) + TaskDetailDto.dependencies", () => {
  const patch = (dto: Record<string, unknown>, id = A.id, version = A.version) =>
    h.detailService.patch(member, id, { expectedVersion: version, ...dto } as Parameters<typeof h.detailService.patch>[2]);

  it("PM2-26: PATCH lùi hạn A khi có thẻ sau bị ảnh hưởng → 409 TASK_006 kèm preview, KHÔNG ghi gì; dùng previewToken đó để dời thì được", async () => {
    const before = snapshot();
    const e = await err(patch({ dueDate: at(NEW_DUE) }));
    expect([e.statusCode, e.errorCode]).toEqual([409, "TASK_006"]);
    const p = (e.details as { preview: { affectedCount: number; previewToken: string; affected: { taskId: string }[] } }).preview;
    expect(p.affectedCount).toBe(2);
    expect(p.affected.map((x) => x.taskId)).toEqual([B.id, C.id]);
    expect(snapshot()).toBe(before);
    expect((await fresh(A)).dueDate?.toISOString()).toBe(at("10-03T17:00:00").toISOString());

    const ok = await h.rescheduleService.apply(member, A.id, { dueDate: at(NEW_DUE), expectedVersion: A.version, previewToken: p.previewToken });
    expect(ok.status).toBe(200);
  });

  it("PATCH vẫn chạy như cũ khi: rút ngắn hạn, chỉ đổi startDate, xoá hạn, không thẻ nào bị ảnh hưởng, thẻ nguồn đã DONE", async () => {
    // rút ngắn
    let cur = A;
    const shorter = await patch({ dueDate: at("10-02T17:00:00") }, cur.id, cur.version);
    expect(shorter.dueDate).toBe(at("10-02T17:00:00").toISOString());
    // chỉ đổi startDate
    cur = await fresh(A);
    expect((await patch({ startDate: at("09-30T09:00:00") }, cur.id, cur.version)).startDate).toBe(at("09-30T09:00:00").toISOString());
    // xoá hạn
    cur = await fresh(A);
    expect((await patch({ dueDate: null }, cur.id, cur.version)).dueDate).toBeNull();
    expect(h.outbox.events.some((e) => e.type === "task.rescheduled")).toBe(false);
    expect((await fresh(B)).version).toBe(B.version); // KHÔNG tự dời thẻ sau

    // thẻ sau ở rất xa → lùi hạn không ảnh hưởng ai
    h.setTask(B.id, { startDate: at("12-01T09:00:00"), dueDate: at("12-05T17:00:00") });
    h.setTask(C.id, { startDate: at("12-10T09:00:00"), dueDate: at("12-12T17:00:00") });
    h.setTask(A.id, { dueDate: at("10-03T17:00:00") });
    cur = await fresh(A);
    expect((await patch({ dueDate: at("10-20T17:00:00") }, cur.id, cur.version)).dueDate).toBe(at("10-20T17:00:00").toISOString());

    // thẻ nguồn đã DONE: không còn ràng buộc thời gian với thẻ sau
    h.setTask(B.id, { startDate: at("10-04T09:00:00"), dueDate: at("10-06T17:00:00") });
    h.setTask(C.id, { startDate: at("10-07T09:00:00"), dueDate: at("10-10T17:00:00") });
    h.setTask(A.id, { columnKind: "DONE", dueDate: at("10-03T17:00:00") });
    cur = await fresh(A);
    expect((await patch({ dueDate: at("10-25T17:00:00") }, cur.id, cur.version)).dueDate).toBe(at("10-25T17:00:00").toISOString());
  });

  it("lệch expectedVersion thì báo RES_003 (không nhầm thành TASK_006)", async () => {
    const e = await err(patch({ dueDate: at(NEW_DUE) }, A.id, A.version - 1));
    expect(e.errorCode).toBe("RES_003");
  });

  it("TaskDetailDto.dependencies: thẻ trước/sau đúng; thẻ không phụ thuộc → hai danh sách rỗng", async () => {
    const dto = await h.detailService.get(member, B.id, {});
    expect(dto.dependencies.predecessors.map((t) => t.id)).toEqual([A.id]);
    expect(dto.dependencies.successors.map((t) => t.id)).toEqual([C.id]);
    expect(dto.dependencies.successors[0]).toMatchObject({ title: "C", columnKind: "TODO", startDate: at("10-07T09:00:00").toISOString() });
    const lone = await h.addTask(member, board, "Lẻ");
    expect((await h.detailService.get(member, lone.id, {})).dependencies).toEqual({ predecessors: [], successors: [] });
    // PATCH cũng trả chi tiết kèm dependencies
    expect((await patch({ title: "A mới" })).dependencies.successors.map((t) => t.id)).toEqual([B.id]);
  });
});

describe("reschedule.service.batchStatus (GET /reschedule-batches/:id)", () => {
  it("người yêu cầu hoặc OWNER/ADMIN xem được; MEMBER khác/GUEST/không tồn tại → 404; kèm conflicts (≤ 50) có tiêu đề", async () => {
    const batch = await h.batchRepo.create(
      {
        workspaceId: h.workspaceId,
        boardId: board.id,
        sourceTaskId: A.id,
        requestedBy: member.id,
        sourceDueDate: at(NEW_DUE),
        items: [B, C].map((t) => ({ taskId: t.id, expectedVersion: t.version, oldStartDate: null, oldDueDate: null, newStartDate: null, newDueDate: null, assigneeIds: [], result: null })),
      }
    );
    await h.batchRepo.markRunning(batch.id, new Date());
    await h.batchRepo.recordProgress(batch.id, 0, { applied: [B.id], conflicts: [C.id], nextCursor: 2 });

    const dto = await h.rescheduleService.batchStatus(member, batch.id);
    expect(dto).toMatchObject({ id: batch.id, status: "RUNNING", affectedCount: 2, appliedCount: 1, conflictCount: 1, conflicts: [{ taskId: C.id, title: "C" }], finishedAt: null });
    expect(typeof dto.createdAt).toBe("string");
    for (const who of [owner, admin]) expect((await h.rescheduleService.batchStatus(who, batch.id)).id).toBe(batch.id);
    for (const who of [lan, guest]) expect((await err(h.rescheduleService.batchStatus(who, batch.id))).statusCode).toBe(404);
    expect((await err(h.rescheduleService.batchStatus(member, newObjectId()))).statusCode).toBe(404);
  });
});
