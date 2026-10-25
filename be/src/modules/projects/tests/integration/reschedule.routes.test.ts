import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, seedChain, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { getRescheduleNotificationHandler } from "../../jobs/task-detail-wiring";
import { SocketBoardEmitter } from "../../realtime/board-emitter";
import { PrismaTaskDependencyRepository } from "../../repositories/task-dependency.repository.prisma";
import { PrismaTaskRepository } from "../../repositories/task.repository.prisma";
import { RuntimeDependencyLimits, STATIC_DEPENDENCY_LIMITS } from "../../services/dependency-limits";
import type { TaskEventPayload } from "../../events/project-events";

// Mongo memory replset chậm (mỗi request/transaction tính bằng trăm ms trên Windows) — các ca có nhiều lời gọi tuần tự cần trần rộng hơn 5 s mặc định.
jest.setTimeout(90_000);

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };
type Preview = { mode: string; affectedCount: number; affected: { taskId: string; shiftDays: number }[]; skipped: unknown[]; timezone: string; previewToken: string; truncated: boolean };

/** Root hạn 10-03 17:00 (+07); lùi tới 10-05 17:00 (= +2 ngày) kéo mọi thẻ sau +2 ngày. */
const NEW_DUE = "2026-10-05T10:00:00.000Z";

describe("projects p4-04 — dời lịch theo phụ thuộc (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;
  let ids: string[]; // [root, T001, T002]

  beforeAll(() => ensureProjectIndexes());
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", L: "MEMBER", G: "GUEST" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data;
    ids = await seedChain(board.id, g.workspaceId, board.columns[0].id, g.ids.C, 2, { assigneeId: g.ids.L });
  });
  afterEach(async () => {
    const wsIds = groups.map((x) => x.workspaceId);
    await prisma.notificationRecipient.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await prisma.notification.deleteMany({ where: { workspaceId: { in: wsIds } } });
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const preview = (who = "C", body: Record<string, unknown> = { dueDate: NEW_DUE }, id = ids[0]) => api("post", `/tasks/${id}/reschedule-preview`, as(who), body);
  const apply = (who: string, body: Record<string, unknown>, id = ids[0]) => api("post", `/tasks/${id}/reschedule`, as(who), body);
  const task = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });
  const dbSnapshot = async () =>
    JSON.stringify([
      await prisma.task.findMany({ where: { boardId: board.id }, orderBy: { id: "asc" } }),
      await prisma.outboxEvent.count({ where: { aggregateType: { in: ["Task", "RescheduleBatch"] }, aggregateId: { in: ids } } }),
      await prisma.taskActivity.count({ where: { boardId: board.id } }),
      await prisma.rescheduleBatch.count({ where: { boardId: board.id } }),
    ]);

  describe("POST /tasks/:id/reschedule-preview", () => {
    it("PM2-25 (một phần): trả kế hoạch theo tô-pô kèm timezone + previewToken; KHÔNG ghi gì vào DB (so snapshot)", async () => {
      const before = await dbSnapshot();
      const res = await preview();
      expect(res.status).toBe(200);
      const p = res.body.data as Preview;
      expect(p).toMatchObject({ mode: "SYNC", affectedCount: 2, truncated: false, skipped: [], timezone: "Asia/Ho_Chi_Minh", source: { taskId: ids[0], version: 1 } });
      expect(p.affected.map((a) => [a.taskId, a.shiftDays])).toEqual([[ids[1], 2], [ids[2], 2]]);
      expect(p.previewToken).toMatch(/^[a-f0-9]{64}$/);
      expect(await dbSnapshot()).toBe(before);
    });

    it("validation (dueDate lạ, thiếu, startDate sau hạn) → 400; quyền: GUEST/người ngoài 404; MEMBER/bảng lưu trữ xem được", async () => {
      expect((await preview("C", { dueDate: "không-phải-ngày" })).status).toBe(400);
      expect((await preview("C", {})).status).toBe(400);
      expect((await preview("C", { dueDate: NEW_DUE, startDate: "2026-12-01T00:00:00.000Z" })).status).toBe(400);
      expect((await preview("G")).status).toBe(404);
      expect((await api("post", `/tasks/${ids[0]}/reschedule-preview`, tokenFor(newObjectId()), { dueDate: NEW_DUE })).status).toBe(404);
      expect((await preview("L")).status).toBe(200);
      expect((await api("post", `/boards/${board.id}/archive`, as("A"))).status).toBe(200);
      expect((await preview("C")).status).toBe(200);
    });
  });

  describe("POST /tasks/:id/reschedule", () => {
    it("PM2-04: áp một lệnh → 200; thẻ sau +2 ngày giữ thời lượng; activity RESCHEDULED ghi nguồn; outbox due-changed từng thẻ + MỘT task.rescheduled; người làm nhận MỘT thông báo", async () => {
      const p = (await preview()).body.data as Preview;
      const res = await apply("C", { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken });
      expect(res.status).toBe(200);
      const data = res.body.data as { rescheduleId: string; applied: { taskId: string; newStartDate: string | null; newDueDate: string | null; version: number }[]; skipped: unknown[] };
      expect(data.applied.map((x) => [x.taskId, x.version])).toEqual([[ids[0], 2], [ids[1], 2], [ids[2], 2]]);
      expect(data.applied[1]).toMatchObject({ newStartDate: "2026-10-06T02:00:00.000Z", newDueDate: "2026-10-06T10:00:00.000Z" });

      const [root, t1, t2] = await Promise.all(ids.map(task));
      expect(root.dueDate?.toISOString()).toBe(NEW_DUE);
      expect([t1.startDate?.toISOString(), t1.dueDate?.toISOString()]).toEqual(["2026-10-06T02:00:00.000Z", "2026-10-06T10:00:00.000Z"]);
      expect([t2.startDate?.toISOString(), t2.dueDate?.toISOString()]).toEqual(["2026-10-07T02:00:00.000Z", "2026-10-07T10:00:00.000Z"]);
      expect([root.version, t1.version, t2.version]).toEqual([2, 2, 2]);
      expect([root.dueVersion, t1.dueVersion, t2.dueVersion]).toEqual([2, 2, 2]);

      const acts = await prisma.taskActivity.findMany({ where: { boardId: board.id }, orderBy: { at: "asc" } });
      expect(acts.filter((a) => a.type === "DUE_CHANGED").map((a) => a.taskId)).toEqual([ids[0]]);
      const resched = acts.filter((a) => a.type === "RESCHEDULED");
      expect(resched.map((a) => a.taskId).sort()).toEqual([ids[1], ids[2]].sort());
      expect(resched[0]).toMatchObject({ actorId: g.ids.C });
      expect(resched.find((a) => a.taskId === ids[1])?.after).toMatchObject({ sourceTaskId: ids[0], rescheduleId: data.rescheduleId, dueDate: "2026-10-06T10:00:00.000Z" });

      const events = await prisma.outboxEvent.findMany({ where: { aggregateType: "Task", aggregateId: { in: ids } } });
      expect(events.filter((e) => e.type === "task.due-changed").map((e) => e.dedupeKey).sort()).toEqual(ids.map((id) => `task.due-changed:task:${id}:d2`).sort());
      const rescheduled = events.filter((e) => e.type === "task.rescheduled");
      expect(rescheduled).toHaveLength(1);
      expect(rescheduled[0]).toMatchObject({ queue: "notifications", jobName: "task.events", dedupeKey: `task.rescheduled:op:${data.rescheduleId}` });

      // Sink thông báo (chạy như worker): Lan (người làm T001) nhận MỘT thông báo, người thực hiện thì không; retry không gửi lại.
      const payload = rescheduled[0].payload as unknown as TaskEventPayload;
      await getRescheduleNotificationHandler().handle(payload);
      await getRescheduleNotificationHandler().handle(payload);
      const notes = await prisma.notification.findMany({ where: { workspaceId: g.workspaceId, type: "task.rescheduled" } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ scopeType: "WORKSPACE", scopeId: g.workspaceId, actorId: g.ids.C, dedupeKey: `reschedule:${data.rescheduleId}:${g.ids.L}` });
      expect(notes[0].refs).toMatchObject({ taskId: ids[0], boardId: board.id, rescheduleId: data.rescheduleId, taskIds: [ids[1]], count: 1 });
      const recipients = await prisma.notificationRecipient.findMany({ where: { notificationId: notes[0].id } });
      expect(recipients.map((r) => r.recipientId)).toEqual([g.ids.L]);
    });

    it("PM2-26: xem trước → người khác sửa hạn thẻ sau → áp với token cũ → 409 TASK_019 kèm preview MỚI, DB không đổi; token mới áp được", async () => {
      const p = (await preview()).body.data as Preview;
      // Người khác đưa T002 ra xa ⇒ kế hoạch đổi.
      expect((await api("patch", `/tasks/${ids[2]}`, as("L"), { startDate: "2026-11-20T02:00:00.000Z", dueDate: "2026-11-21T10:00:00.000Z", expectedVersion: 1 })).status).toBe(200);
      const before = await dbSnapshot();
      const stale = await apply("C", { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken });
      expect([stale.status, stale.body.error.code]).toEqual([409, "TASK_019"]);
      const fresher = stale.body.error.details.preview as Preview;
      expect(fresher.previewToken).not.toBe(p.previewToken);
      expect(fresher.affected.map((a) => a.taskId)).toEqual([ids[1]]);
      expect(await dbSnapshot()).toBe(before);
      expect(redisStore.has(`reschedule:board:${board.id}`)).toBe(false); // khoá đã nhả

      const ok = await apply("C", { dueDate: NEW_DUE, expectedVersion: 1, previewToken: fresher.previewToken });
      expect(ok.status).toBe(200);
      expect((await task(ids[1])).version).toBe(2);
      expect((await task(ids[2])).dueDate?.toISOString()).toBe("2026-11-21T10:00:00.000Z"); // không bị dời
    });

    it("PM2-26: PATCH lùi hạn thẻ nguồn → 409 TASK_006 kèm preview, KHÔNG ghi; PATCH rút ngắn → 200 và KHÔNG tự dời thẻ sau", async () => {
      const before = await dbSnapshot();
      const blocked = await api("patch", `/tasks/${ids[0]}`, as("C"), { dueDate: NEW_DUE, expectedVersion: 1 });
      expect([blocked.status, blocked.body.error.code]).toEqual([409, "TASK_006"]);
      const p = blocked.body.error.details.preview as Preview;
      expect(p).toMatchObject({ affectedCount: 2, mode: "SYNC" });
      expect(await dbSnapshot()).toBe(before);

      // Dùng chính previewToken của 409 để dời được.
      expect((await apply("C", { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken })).status).toBe(200);

      // Rút ngắn (từ hạn mới về sớm hơn) — PATCH chạy như cũ, thẻ sau đứng yên.
      const t1Before = await task(ids[1]);
      const shorter = await api("patch", `/tasks/${ids[0]}`, as("C"), { dueDate: "2026-10-04T10:00:00.000Z", expectedVersion: 2 });
      expect(shorter.status).toBe(200);
      expect(shorter.body.data.dueDate).toBe("2026-10-04T10:00:00.000Z");
      expect((await task(ids[1])).version).toBe(t1Before.version);
    });

    it("RES_003 (thẻ nguồn lệch version), validation (token sai định dạng, thiếu trường, startDate sau hạn) → 400; không ghi gì", async () => {
      const p = (await preview()).body.data as Preview;
      const before = await dbSnapshot();
      const stale = await apply("C", { dueDate: NEW_DUE, expectedVersion: 5, previewToken: p.previewToken });
      expect([stale.status, stale.body.error.code, stale.body.error.details]).toEqual([409, "RES_003", { currentVersion: 1 }]);
      for (const body of [
        { dueDate: NEW_DUE, expectedVersion: 1, previewToken: "xyz" },
        { dueDate: NEW_DUE, previewToken: p.previewToken },
        { expectedVersion: 1, previewToken: p.previewToken },
        { dueDate: NEW_DUE, expectedVersion: 0, previewToken: p.previewToken },
        { dueDate: NEW_DUE, startDate: "2026-12-01T00:00:00.000Z", expectedVersion: 1, previewToken: p.previewToken },
      ]) {
        expect([JSON.stringify(body).slice(0, 50), (await apply("C", body)).status]).toEqual([JSON.stringify(body).slice(0, 50), 400]);
      }
      expect(await dbSnapshot()).toBe(before);
    });

    it("quyền: GUEST/người ngoài 404; bảng đã lưu trữ → 403 (kể cả có token hợp lệ)", async () => {
      const p = (await preview()).body.data as Preview;
      const body = { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken };
      expect((await apply("G", body)).status).toBe(404);
      expect((await api("post", `/tasks/${ids[0]}/reschedule`, tokenFor(newObjectId()), body)).status).toBe(404);
      expect((await api("post", `/boards/${board.id}/archive`, as("A"))).status).toBe(200);
      expect((await apply("C", body)).status).toBe(403);
      expect((await task(ids[1])).version).toBe(1);
    });

    it("ROLLBACK thật: một thẻ sau xung đột CAS ở GIỮA transaction → cả lệnh bị huỷ (kể cả thẻ nguồn + thẻ đã cập nhật trước đó), 409 TASK_019, không activity/outbox, nhả khoá", async () => {
      const p = (await preview()).body.data as Preview;
      const before = await dbSnapshot();
      const original = PrismaTaskRepository.prototype.applyReschedule;
      let calls = 0;
      jest.spyOn(PrismaTaskRepository.prototype, "applyReschedule").mockImplementation(function (this: PrismaTaskRepository, ...args) {
        calls += 1;
        return calls === 2 ? Promise.resolve(false) : original.apply(this, args); // thẻ thứ 1 áp được, thẻ thứ 2 "bị người khác sửa"
      });
      const res = await apply("C", { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken });
      expect([res.status, res.body.error.code]).toEqual([409, "TASK_019"]);
      expect(res.body.error.details.preview.previewToken).toBeDefined();
      expect(calls).toBeGreaterThanOrEqual(2);
      expect(await dbSnapshot()).toBe(before);
      expect((await task(ids[0])).dueDate?.toISOString()).toBe("2026-10-03T10:00:00.000Z");
      expect(redisStore.has(`reschedule:board:${board.id}`)).toBe(false);
    });

    it("hai lệnh SONG SONG trên cùng bảng: đúng một thắng; lệnh kia 409 (TASK_020 hoặc RES_003 nếu đến sau khi lệnh đầu đã xong) — không thẻ nào bị dời hai lần", async () => {
      const p = (await preview()).body.data as Preview;
      const body = { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken };
      const [r1, r2] = await Promise.all([apply("C", body), apply("B", body)]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      const loser = r1.status === 409 ? r1 : r2;
      expect(["TASK_020", "RES_003"]).toContain(loser.body.error.code);
      expect([(await task(ids[1])).version, (await task(ids[2])).version]).toEqual([2, 2]);
      expect(await prisma.outboxEvent.count({ where: { type: "task.rescheduled", aggregateId: ids[0] } })).toBe(1);
    });

    it("Socket: ≤ rescheduleEmitEachMax thẻ → task:updated từng thẻ (changed dates), KHÔNG board:rescheduled", async () => {
      const updated: { id: string; changed: string[] }[] = [];
      const rescheduled: unknown[] = [];
      jest.spyOn(SocketBoardEmitter.prototype, "taskUpdated").mockImplementation((_b, payload) => void updated.push({ id: payload.task.id, changed: payload.changed ?? [] }));
      jest.spyOn(SocketBoardEmitter.prototype, "boardRescheduled").mockImplementation((_b, payload) => void rescheduled.push(payload));
      const p = (await preview()).body.data as Preview;
      expect((await apply("C", { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken })).status).toBe(200);
      expect(updated.map((u) => u.id).sort()).toEqual([...ids].sort());
      expect(updated.every((u) => u.changed[0] === "dates")).toBe(true);
      expect(rescheduled).toHaveLength(0);
    });

    it("Socket: > rescheduleEmitEachMax thẻ (admin hạ còn 1 qua SystemConfig limits.task) → MỘT board:rescheduled, KHÔNG task:updated từng thẻ sau (chỉ thẻ nguồn)", async () => {
      jest.spyOn(RuntimeDependencyLimits.prototype, "load").mockResolvedValue({ ...(await STATIC_DEPENDENCY_LIMITS.load()), rescheduleEmitEachMax: 1 });
      const updated: string[] = [];
      const rescheduled: unknown[] = [];
      jest.spyOn(SocketBoardEmitter.prototype, "taskUpdated").mockImplementation((_b, payload) => void updated.push(payload.task.id));
      jest.spyOn(SocketBoardEmitter.prototype, "boardRescheduled").mockImplementation((_b, payload) => void rescheduled.push(payload));

      const p = (await preview()).body.data as Preview;
      const res = await apply("C", { dueDate: NEW_DUE, expectedVersion: 1, previewToken: p.previewToken });
      expect(res.status).toBe(200);
      expect(updated).toEqual([ids[0]]);
      expect(rescheduled).toEqual([{ boardId: board.id, rescheduleId: res.body.data.rescheduleId, taskIds: [ids[1], ids[2]], count: 2, final: true }]);
    });

    it("chuỗi 60 thẻ sau: preview đọc đồ thị bằng MỘT truy vấn cạnh (không theo tầng) và trả đủ kế hoạch", async () => {
      const big = (await api("post", `/workspaces/${g.workspaceId}/boards`, as("A"), { name: "Bảng lớn" })).body.data as Board;
      const chain = await seedChain(big.id, g.workspaceId, big.columns[0].id, g.ids.C, 60);
      const spy = jest.spyOn(PrismaTaskDependencyRepository.prototype, "outgoing");
      const spyBoard = jest.spyOn(PrismaTaskDependencyRepository.prototype, "edgesOfBoard");
      const p = (await preview("C", { dueDate: NEW_DUE }, chain[0])).body.data as Preview;
      expect([p.mode, p.affectedCount]).toEqual(["SYNC", 60]);
      expect(spyBoard).toHaveBeenCalledTimes(1);
      expect(spy).not.toHaveBeenCalled();
    }, 60_000);
  });
});
