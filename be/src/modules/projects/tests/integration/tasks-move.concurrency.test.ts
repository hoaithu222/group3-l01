import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, makeApi, mutationId, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { AppError } from "../../../../core/exceptions";
import { prisma } from "../../../../infrastructure/database";
import { createProjectsContainer } from "../../projects.container";
import { KeyedMutex } from "../../services/keyed-mutex";
import { TaskMoveRegistry } from "../../services/task-move-policy";
import { needsRebalance } from "../../services/task-position";
import { FakeEmitter, FakeRebalanceScheduler, userOf } from "../support/service-harness";
import vectors from "../fixtures/fractional-indexing-vectors.json";

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };
type Card = { id: string; version: number; position: string; columnId: string };

describe("projects — kéo thẻ đồng thời trên Mongo thật (PM2-01, PM2-12, PM2-19, PM2-20)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;

  beforeAll(async () => {
    // Mongo in-memory không chạy `db push`: tạo unique index của OutboxEvent.dedupeKey như schema khai.
    await prisma.$runCommandRaw({
      createIndexes: "OutboxEvent",
      indexes: [{ key: { dedupeKey: 1 }, name: "OutboxEvent_dedupeKey_key", unique: true }],
    });
  });
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", C: "MEMBER", D: "MEMBER", E: "MEMBER" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" })).body.data;
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const col = (kind: string) => board.columns.find((c) => c.kind === kind)!.id;
  const addTask = async (title: string, extra: Record<string, unknown> = {}, who = "C"): Promise<Card> => {
    const res = await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids[who]), { title, ...extra });
    expect(res.status).toBe(201);
    return res.body.data as Card;
  };
  const move = (who: string, task: { id: string }, body: Record<string, unknown>) =>
    api("post", `/tasks/${task.id}/move`, tokenFor(g.ids[who]), {
      afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId(), ...body,
    });
  const columnOrder = async (columnId: string) =>
    (await prisma.task.findMany({ where: { boardId: board.id, columnId, deletedAt: null }, orderBy: [{ position: "asc" }, { id: "asc" }] })).map((t) => ({ id: t.id, position: t.position }));
  const fetchOrder = async (who: string, columnId: string) =>
    ((await api("get", `/boards/${board.id}/tasks?columnId=${columnId}&limitPerColumn=200`, tokenFor(g.ids[who]))).body.data.columns[0].tasks as Card[]).map((t) => t.id);

  describe("PM2-01 — hai người kéo cùng một thẻ", () => {
    it("cùng tiến trình (2 request đồng thời, cùng expectedVersion): một 200, một 409 kèm current = vị trí server", async () => {
      const t = await addTask("Thẻ tranh chấp");
      const [rC, rD] = await Promise.all([
        move("C", t, { columnId: col("IN_PROGRESS") }),
        move("D", t, { columnId: col("DONE") }),
      ]);
      const statuses = [rC.status, rD.status].sort();
      expect(statuses).toEqual([200, 409]);

      const winner = rC.status === 200 ? rC : rD;
      const loser = rC.status === 200 ? rD : rC;
      expect(loser.body.error.code).toBe("RES_003");
      const stored = await prisma.task.findUnique({ where: { id: t.id } });
      expect(stored?.version).toBe(2);
      expect(loser.body.error.details.current).toEqual({
        id: t.id, columnId: stored?.columnId, columnKind: stored?.columnKind, position: stored?.position, version: 2,
        completedAt: stored?.completedAt ? stored.completedAt.toISOString() : null,
      });
      expect(winner.body.data).toMatchObject({ id: t.id, columnId: stored?.columnId, version: 2 });
      // Hoàn thành chỉ ghi khi thắng vào DONE: đúng 0 hoặc 1 sự kiện, không bao giờ 2.
      expect(await prisma.outboxEvent.count({ where: { aggregateId: t.id, type: "task.completed" } })).toBe(stored?.columnKind === "DONE" ? 1 : 0);
    });

    it("KHÁC instance (không chung hàng đợi tiến trình): write-conflict Mongo + retry vẫn cho đúng một thắng, một 409", async () => {
      const t = await addTask("Thẻ tranh chấp 2 instance");
      const instance = () => createProjectsContainer({ boardMutex: new KeyedMutex(), emitter: new FakeEmitter(), rebalance: new FakeRebalanceScheduler() });
      const [a, b] = [instance(), instance()];
      const dto = (columnId: string) => ({ columnId, afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId() });

      const results = await Promise.allSettled([
        a.moveService.move(userOf(g.ids.C), t.id, dto(col("IN_PROGRESS"))),
        b.moveService.move(userOf(g.ids.D), t.id, dto(col("REVIEW"))),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ statusCode: 409, errorCode: "RES_003" });
      expect((await prisma.task.findUnique({ where: { id: t.id } }))?.version).toBe(2);
    });
  });

  describe("PM2-12 — 20 request move đồng thời vào cùng cột", () => {
    it("chèn NGAY SAU cùng một thẻ mốc: 20 × 200, position duy nhất, không mất thẻ, hai client refetch giống nhau", async () => {
      const anchor = await addTask("Mốc", { columnId: col("IN_PROGRESS") });
      const movers: Card[] = [];
      for (let i = 0; i < 20; i++) movers.push(await addTask(`m${i}`));

      const responses = await Promise.all(
        movers.map((m, i) => move(["C", "D", "E"][i % 3], m, { columnId: col("IN_PROGRESS"), afterTaskId: anchor.id }))
      );
      expect(responses.map((r) => r.status)).toEqual(Array(20).fill(200));

      const rows = await columnOrder(col("IN_PROGRESS"));
      expect(rows).toHaveLength(21);
      expect(new Set(rows.map((r) => r.position)).size).toBe(21);
      expect(rows[0].id).toBe(anchor.id);
      expect(new Set(rows.map((r) => r.id))).toEqual(new Set([anchor.id, ...movers.map((m) => m.id)]));
      expect(await prisma.task.count({ where: { boardId: board.id, columnId: col("TODO"), deletedAt: null } })).toBe(0);
      expect(responses.every((r) => r.body.data.version === 2)).toBe(true);

      const [clientC, clientD] = await Promise.all([fetchOrder("C", col("IN_PROGRESS")), fetchOrder("D", col("IN_PROGRESS"))]);
      expect(clientC).toEqual(clientD);
      expect(clientC).toEqual(rows.map((r) => r.id));
    }, 60_000);

    it("cả hai neighbor null (cuối cột) ×20: position duy nhất và tăng theo thứ tự thắng", async () => {
      const movers: Card[] = [];
      for (let i = 0; i < 20; i++) movers.push(await addTask(`m${i}`));
      const responses = await Promise.all(movers.map((m, i) => move(["C", "D"][i % 2], m, { columnId: col("REVIEW") })));
      expect(responses.map((r) => r.status)).toEqual(Array(20).fill(200));
      const rows = await columnOrder(col("REVIEW"));
      expect(rows).toHaveLength(20);
      expect(new Set(rows.map((r) => r.position)).size).toBe(20);
    }, 60_000);

    it("KHÁC instance: 12 move đồng thời từ 4 instance vào cùng cột → cùng kết quả đúng (retry write-conflict đủ dùng)", async () => {
      const anchor = await addTask("Mốc", { columnId: col("IN_PROGRESS") });
      const movers: Card[] = [];
      for (let i = 0; i < 12; i++) movers.push(await addTask(`m${i}`));
      const instances = Array.from({ length: 4 }, () => createProjectsContainer({ boardMutex: new KeyedMutex(), emitter: new FakeEmitter(), rebalance: new FakeRebalanceScheduler() }));

      const results = await Promise.allSettled(
        movers.map((m, i) =>
          instances[i % 4].moveService.move(userOf(g.ids.C), m.id, {
            columnId: col("IN_PROGRESS"), afterTaskId: anchor.id, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId(),
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      expect(failed.map((f) => String(f.reason))).toEqual([]);
      const rows = await columnOrder(col("IN_PROGRESS"));
      expect(rows).toHaveLength(13);
      expect(new Set(rows.map((r) => r.position)).size).toBe(13);
    }, 60_000);
  });

  describe("PM2-12 (cực đoan) — 20 instance, mỗi instance một move, không chung hàng đợi tiến trình", () => {
    it("mọi request kết thúc bằng 200 hoặc 503 SYS_503 có thể thử lại (KHÔNG 500 thô); dữ liệu nhất quán, position duy nhất", async () => {
      const movers: Card[] = [];
      for (let i = 0; i < 20; i++) movers.push(await addTask(`m${i}`));
      const instances = Array.from({ length: 20 }, () =>
        createProjectsContainer({ boardMutex: new KeyedMutex(), emitter: new FakeEmitter(), rebalance: new FakeRebalanceScheduler() })
      );
      const results = await Promise.allSettled(
        movers.map((m, i) =>
          instances[i].moveService.move(userOf(g.ids.C), m.id, {
            columnId: col("IN_PROGRESS"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId(),
          })
        )
      );
      const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      for (const f of failed) expect(f.reason).toMatchObject({ statusCode: 503, errorCode: "SYS_503", details: { retryable: true } });
      expect(results.length - failed.length).toBeGreaterThanOrEqual(15);

      const rows = await columnOrder(col("IN_PROGRESS"));
      expect(rows).toHaveLength(results.length - failed.length);
      expect(new Set(rows.map((r) => r.position)).size).toBe(rows.length);
      // Thẻ chưa chuyển được (503) vẫn còn nguyên ở cột cũ — không mất, không nhân đôi.
      expect(await prisma.task.count({ where: { boardId: board.id, deletedAt: null } })).toBe(20);
    }, 60_000);
  });

  describe("PM2-19 — vào DONE, ra, vào lại", () => {
    it("task.completed c1 rồi c2 với dedupeKey KHÁC nhau (unique), task.reopened c1; completedAt/completionCount đúng", async () => {
      const t = await addTask("Làm slide", { assigneeIds: [g.ids.C] });
      const step = async (kind: string, version: number) =>
        expect((await move("C", t, { columnId: col(kind), expectedVersion: version })).status).toBe(200);
      await step("DONE", 1);
      await step("IN_PROGRESS", 2);
      await step("DONE", 3);

      const rows = await prisma.outboxEvent.findMany({ where: { aggregateId: t.id, type: { in: ["task.completed", "task.reopened"] } }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => r.dedupeKey)).toEqual([
        `task.completed:task:${t.id}:c1`,
        `task.reopened:task:${t.id}:c1`,
        `task.completed:task:${t.id}:c2`,
      ]);
      const payload = rows[2].payload as Record<string, unknown>;
      expect(payload).toMatchObject({ taskId: t.id, completionCount: 2, assigneeIds: [g.ids.C], review: { enabled: false, approved: false }, labelNames: [], schemaVersion: 1 });
      expect(typeof payload.taskCreatedAt).toBe("string");

      const stored = await prisma.task.findUnique({ where: { id: t.id } });
      expect(stored).toMatchObject({ completionCount: 2, columnKind: "DONE", version: 4 });
      expect(stored?.completedAt).not.toBeNull();
      // Ghi trùng cùng dedupeKey (retry) bị unique index từ chối — outbox idempotent.
      await expect(prisma.outboxEvent.create({ data: { type: "x", aggregateType: "Task", aggregateId: t.id, queue: "notifications", jobName: "task.events", dedupeKey: rows[0].dedupeKey, payload: {}, availableAt: new Date() } })).rejects.toBeDefined();
    });
  });

  describe("atomic: effect lỗi → rollback toàn bộ move", () => {
    it("thẻ, activity, outbox giữ nguyên khi TaskMoveEffect ném lỗi SAU khi đã ghi thẻ", async () => {
      const registry = new TaskMoveRegistry();
      registry.registerEffect({
        name: "boom",
        onEnterKind: async () => {
          throw new AppError("effect lỗi", 500, "SYS_500");
        },
      });
      const c = createProjectsContainer({ moveRegistry: registry, emitter: new FakeEmitter(), rebalance: new FakeRebalanceScheduler() });
      const t = await addTask("Thẻ rollback");
      const before = await prisma.task.findUnique({ where: { id: t.id } });
      const activities = await prisma.taskActivity.count({ where: { taskId: t.id } });
      const events = await prisma.outboxEvent.count({ where: { aggregateId: t.id } });

      await expect(
        c.moveService.move(userOf(g.ids.C), t.id, { columnId: col("DONE"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId() })
      ).rejects.toThrow("effect lỗi");

      expect(await prisma.task.findUnique({ where: { id: t.id } })).toEqual(before);
      expect(await prisma.taskActivity.count({ where: { taskId: t.id } })).toBe(activities);
      expect(await prisma.outboxEvent.count({ where: { aggregateId: t.id } })).toBe(events);
    });
  });

  describe("PM2-20 — job rebalance cột", () => {
    it("350 lần chèn vào cùng một khe → khoá > 50 ký tự; job nén: mọi khoá ≤ 50, thứ tự không đổi, không đổi version; chạy lại là no-op", async () => {
      const chain = ["a0", ...(vectors.slot as { value: string }[]).map((s) => s.value), "a1"];
      // Thứ tự đúng theo khoá tăng dần (khe co dần): a0 < … < a1 — seed thẳng vào DB như 350 lần chèn liên tiếp.
      const positions = [...new Set(chain)].sort();
      expect(Math.max(...positions.map((p) => p.length))).toBeGreaterThan(50);
      await prisma.task.createMany({
        data: positions.map((position, i) => ({
          boardId: board.id, workspaceId: g.workspaceId, columnId: col("TODO"), columnKind: "TODO" as const,
          position, title: `t${i}`, normalizedTitle: `t${i}`, createdBy: g.ids.A, deletedAt: null,
        })),
      });
      const before = await columnOrder(col("TODO"));
      expect(before.map((r) => r.position)).toEqual(positions);
      const versionsBefore = new Map((await prisma.task.findMany({ where: { boardId: board.id }, select: { id: true, version: true } })).map((t) => [t.id, t.version]));

      const emitter = new FakeEmitter();
      const c = createProjectsContainer({ emitter, rebalance: new FakeRebalanceScheduler() });
      const result = await c.rebalanceService.rebalanceColumn(board.id, col("TODO"));

      expect(result.skipped).toBe(false);
      const after = await columnOrder(col("TODO"));
      expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
      expect(after.every((r) => !needsRebalance(r.position))).toBe(true);
      expect(new Set(after.map((r) => r.position)).size).toBe(after.length);
      const versionsAfter = new Map((await prisma.task.findMany({ where: { boardId: board.id }, select: { id: true, version: true } })).map((t) => [t.id, t.version]));
      expect(versionsAfter).toEqual(versionsBefore);
      expect(emitter.of("board:updated")[0].payload).toMatchObject({ boardId: board.id, rebalancedColumnId: col("TODO"), version: 1 });

      expect((await c.rebalanceService.rebalanceColumn(board.id, col("TODO"))).skipped).toBe(true);
      expect(emitter.of("board:updated")).toHaveLength(1);
      // Sau khi nén, kéo tiếp bình thường: chèn ngay sau thẻ đầu tiên.
      const first = after[0];
      const extra = await addTask("mới");
      const moved = await move("C", extra, { columnId: col("TODO"), afterTaskId: first.id });
      expect(moved.status).toBe(200);
      expect((await columnOrder(col("TODO")))[1].id).toBe(extra.id);
    }, 60_000);

    it("cột/bảng không tồn tại → job bỏ qua, không ném", async () => {
      const c = createProjectsContainer({ emitter: new FakeEmitter(), rebalance: new FakeRebalanceScheduler() });
      expect(await c.rebalanceService.rebalanceColumn("0".repeat(24), "c_aaaaaaaa")).toEqual({ skipped: true, changed: 0 });
      expect(await c.rebalanceService.rebalanceColumn(board.id, "c_zzzzzzzz")).toEqual({ skipped: true, changed: 0 });
    });
  });
});
