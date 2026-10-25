import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { prisma } from "../../../../infrastructure/database";
import { PrismaTaskWatcherRepository } from "../../repositories/task-watcher.repository.prisma";

jest.setTimeout(90_000);

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };
type Card = { id: string; title: string; columnId: string; columnKind: string; checklistTotal: number; checklistDone: number; version: number; labelIds: string[] };

/** p3-03 P1 — theo dõi thẻ, sao chép thẻ, chuyển việc nhỏ thành thẻ (integration, Mongo memory replset). */
describe("p3-03 P1 — task extras REST (integration)", () => {
  const groups: Group[] = [];
  const taskIds: string[] = [];
  let g: Group;
  let board: Board;

  beforeAll(async () => {
    await ensureProjectIndexes();
    // Mongo in-memory không chạy `db push`: tạo tay unique `TaskWatcher (taskId, userId)` để kiểm đường đua P2002.
    await prisma.$runCommandRaw({ createIndexes: "TaskWatcher", indexes: [{ key: { taskId: 1, userId: 1 }, name: "TaskWatcher_taskId_userId_key", unique: true }] });
  });
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "MEMBER", C: "MEMBER", G: "GUEST" });
    groups.push(g);
    board = (await api("post", `/workspaces/${g.workspaceId}/boards`, as("A"), { name: "Đồ án" })).body.data;
  });
  afterEach(async () => {
    await prisma.taskWatcher.deleteMany({ where: { taskId: { in: taskIds.splice(0) } } });
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const as = (who: string) => tokenFor(g.ids[who]);
  const col = (kind: string) => board.columns.find((c) => c.kind === kind)!.id;
  const newTask = async (title: string, extra: Record<string, unknown> = {}): Promise<Card> => {
    const res = await api("post", `/boards/${board.id}/tasks`, as("B"), { title, assigneeIds: [], ...extra });
    expect(res.status).toBe(201);
    taskIds.push(res.body.data.id);
    return res.body.data as Card;
  };
  const addItem = async (taskId: string, text: string): Promise<string> => {
    const res = await api("post", `/tasks/${taskId}/checklist`, as("B"), { text });
    expect(res.status).toBe(201);
    return res.body.data.item.id as string;
  };
  const row = (id: string) => prisma.task.findUniqueOrThrow({ where: { id } });

  describe("theo dõi thẻ", () => {
    it("PUT → EXPLICIT_ON, GET watchers liệt kê + me; DELETE → EXPLICIT_OFF (người làm cũng tắt được); GUEST 404; thẻ lạ 404", async () => {
      const t = await newTask("Thẻ theo dõi", { assigneeIds: [g.ids.B] });
      expect((await api("get", `/tasks/${t.id}/watchers`, as("C"))).body.data.me).toEqual({ watching: false, state: null });

      const on = await api("put", `/tasks/${t.id}/watch`, as("C"));
      expect(on.status).toBe(200);
      expect(on.body.data).toEqual({ watching: true, state: "EXPLICIT_ON" });
      const list = (await api("get", `/tasks/${t.id}/watchers`, as("A"))).body.data;
      expect(list.total).toBe(2); // B (người làm/người tạo, ngầm định) + C
      expect(list.watchers[0]).toMatchObject({ user: { id: g.ids.C }, state: "EXPLICIT_ON" });
      expect(list.watchers[1]).toMatchObject({ user: { id: g.ids.B }, state: "IMPLICIT" });

      const off = await api("delete", `/tasks/${t.id}/watch`, as("B"));
      expect(off.body.data).toEqual({ watching: false, state: "EXPLICIT_OFF" });
      expect((await api("get", `/tasks/${t.id}/watchers`, as("B"))).body.data.me).toEqual({ watching: false, state: "EXPLICIT_OFF" });

      expect((await api("put", `/tasks/${t.id}/watch`, as("G"))).status).toBe(404);
      expect((await api("get", `/tasks/${t.id}/watchers`, as("G"))).status).toBe(404);
      expect((await api("put", `/tasks/${"a".repeat(24)}/watch`, as("C"))).status).toBe(404);
      expect((await api("put", `/tasks/${t.id}/watch`, "")).status).toBe(401);
    });

    it("đua: 8 PUT watch đồng thời của cùng một người → đều 200, đúng MỘT hàng (unique + xử lý P2002); ensureAuto đồng thời không nhân đôi và không ghi đè EXPLICIT_OFF", async () => {
      const t = await newTask("Đua theo dõi");
      const results = await Promise.all(Array.from({ length: 8 }, () => api("put", `/tasks/${t.id}/watch`, as("C"))));
      expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(await prisma.taskWatcher.count({ where: { taskId: t.id, userId: g.ids.C } })).toBe(1);

      const repo = new PrismaTaskWatcherRepository();
      await Promise.all(Array.from({ length: 5 }, () => repo.ensureAuto(t.id, [g.ids.A])));
      expect(await prisma.taskWatcher.count({ where: { taskId: t.id, userId: g.ids.A } })).toBe(1);
      expect((await prisma.taskWatcher.findFirstOrThrow({ where: { taskId: t.id, userId: g.ids.A } })).state).toBe("AUTO_ON");

      await api("delete", `/tasks/${t.id}/watch`, as("C"));
      expect(await repo.ensureAuto(t.id, [g.ids.C, g.ids.B])).toBe(1); // chỉ B
      expect((await prisma.taskWatcher.findFirstOrThrow({ where: { taskId: t.id, userId: g.ids.C } })).state).toBe("EXPLICIT_OFF");
    });
  });

  describe("sao chép thẻ", () => {
    it("201: sao chép nhãn/mô tả/điểm/ngày/checklist (bỏ tick) — mục checklist LƯU BỀN đúng (composite type); ngay sau thẻ gốc; replay clientTaskId → 200; bảng khác cột DONE ⇒ vào TODO", async () => {
      const label = (await api("post", `/boards/${board.id}/labels`, as("A"), { name: "Gấp", color: "red" })).body.data as { id: string };
      const src = await newTask("Báo cáo", { labelIds: [label.id], dueDate: "2026-10-10T10:00:00.000Z" });
      const i1 = await addItem(src.id, "Chương 1");
      await addItem(src.id, "Chương 2");
      await api("patch", `/tasks/${src.id}/checklist/${i1}`, as("B"), { done: true });
      const cur = await row(src.id);
      expect((await api("patch", `/tasks/${src.id}`, as("B"), { description: "Mô tả **đậm**", storyPoints: 5, startDate: "2026-10-01T02:00:00.000Z", expectedVersion: cur.version })).status).toBe(200);
      const after = await newTask("Thẻ liền sau");

      const res = await api("post", `/tasks/${src.id}/duplicate`, as("C"), { clientTaskId: "dup-integration-1" });
      expect(res.status).toBe(201);
      const copy = res.body.data as Card;
      taskIds.push(copy.id);
      expect(copy).toMatchObject({ title: "Báo cáo (bản sao)", columnId: src.columnId, checklistTotal: 2, checklistDone: 0, labelIds: [label.id] });

      const stored = await row(copy.id);
      expect(stored).toMatchObject({ description: "Mô tả **đậm**", storyPoints: 5, createdBy: g.ids.C, assigneeIds: [], attachmentCount: 0, commentCount: 0, completionCount: 0, checklistTotal: 2, checklistDone: 0 });
      expect(stored.startDate?.toISOString()).toBe("2026-10-01T02:00:00.000Z");
      expect(stored.dueDate?.toISOString()).toBe("2026-10-10T10:00:00.000Z");
      expect(stored.checklist.map((i) => [i.text, i.done])).toEqual([["Chương 1", false], ["Chương 2", false]]);
      const srcStored = await row(src.id);
      expect(stored.checklist.map((i) => i.id).some((id) => srcStored.checklist.some((s) => s.id === id))).toBe(false);
      const srcRow = await row(src.id);
      const afterRow = await row(after.id);
      expect(srcRow.position < stored.position && stored.position < afterRow.position).toBe(true);

      // Mục checklist của bản sao dùng được ngay (tick nguyên tử).
      const tick = await api("patch", `/tasks/${copy.id}/checklist/${stored.checklist[0].id}`, as("C"), { done: true });
      expect(tick.status).toBe(200);
      expect(tick.body.data).toMatchObject({ checklistDone: 1, checklistTotal: 2 });

      const replay = await api("post", `/tasks/${src.id}/duplicate`, as("C"), { clientTaskId: "dup-integration-1" });
      expect([replay.status, replay.body.data.id]).toEqual([200, copy.id]);
      expect(await prisma.task.count({ where: { boardId: board.id, deletedAt: null } })).toBe(3);

      expect((await api("post", `/tasks/${src.id}/duplicate`, as("G"), {})).status).toBe(404);
      expect((await api("post", `/tasks/${src.id}/duplicate`, as("C"), { title: "" })).status).toBe(400);
    });

    it("thẻ gốc ở DONE ⇒ bản sao vào TODO, không sinh task.completed", async () => {
      const src = await newTask("Đã xong", { columnId: col("DONE") });
      const before = await prisma.outboxEvent.count({ where: { type: "task.completed" } });
      const res = await api("post", `/tasks/${src.id}/duplicate`, as("B"), {});
      expect(res.status).toBe(201);
      taskIds.push(res.body.data.id);
      expect(res.body.data).toMatchObject({ columnKind: "TODO", completedAt: null });
      expect(await prisma.outboxEvent.count({ where: { type: "task.completed" } })).toBe(before);
    });
  });

  describe("chuyển việc nhỏ thành thẻ", () => {
    it("201: mục bị gỡ khỏi thẻ cha (bộ đếm), thẻ mới ở TODO; gọi lại → 200 created:false, không tạo thêm; người khác gọi mục đã mất → 404", async () => {
      const parent = await newTask("Thẻ cha", { columnId: col("IN_PROGRESS") });
      const item = await addItem(parent.id, "Làm phần phụ lục");
      await addItem(parent.id, "Việc còn lại");

      const res = await api("post", `/tasks/${parent.id}/checklist/${item}/convert`, as("B"), {});
      expect(res.status).toBe(201);
      taskIds.push(res.body.data.task.id);
      expect(res.body.data.created).toBe(true);
      expect(res.body.data.source).toMatchObject({ taskId: parent.id, checklistTotal: 1, checklistDone: 0 });
      expect(res.body.data.task).toMatchObject({ title: "Làm phần phụ lục", columnKind: "TODO" });

      const parentRow = await row(parent.id);
      expect(parentRow.checklist.map((i) => i.text)).toEqual(["Việc còn lại"]);
      const acts = await prisma.taskActivity.findMany({ where: { taskId: parent.id, type: "CHECKLIST_REMOVED" } });
      expect(acts).toHaveLength(1);
      expect(acts[0].after).toMatchObject({ convertedTaskId: res.body.data.task.id });

      const again = await api("post", `/tasks/${parent.id}/checklist/${item}/convert`, as("B"), {});
      expect([again.status, again.body.data.created, again.body.data.task.id]).toEqual([200, false, res.body.data.task.id]);
      expect((await api("post", `/tasks/${parent.id}/checklist/${item}/convert`, as("C"), {})).status).toBe(404);
      expect(await prisma.task.count({ where: { boardId: board.id, title: "Làm phần phụ lục", deletedAt: null } })).toBe(1);
    });

    it("đua: hai người cùng chuyển MỘT mục (lệnh gỡ nguyên tử trên Mongo thật) → đúng một 201, đúng một thẻ mới", async () => {
      const parent = await newTask("Thẻ cha đua");
      const item = await addItem(parent.id, "Mục tranh giành");
      const [r1, r2] = await Promise.all([
        api("post", `/tasks/${parent.id}/checklist/${item}/convert`, as("B"), {}),
        api("post", `/tasks/${parent.id}/checklist/${item}/convert`, as("C"), {}),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 404]);
      for (const r of [r1, r2]) if (r.status === 201) taskIds.push(r.body.data.task.id);
      expect(await prisma.task.count({ where: { boardId: board.id, title: "Mục tranh giành", deletedAt: null } })).toBe(1);
      expect((await row(parent.id)).checklistTotal).toBe(0);
    });

    it("tạo thẻ bị chặn (chọn cột DONE khi bảng bật chấm chéo) → 409 TASK_002 và việc nhỏ được TRẢ VỀ checklist", async () => {
      const cfg = (await api("get", `/boards/${board.id}/review-config`, as("A"))).body.data as { version: number };
      expect((await api("put", `/boards/${board.id}/review-config`, as("A"), { enabled: true, requiredReviews: 1, rubric: [], autoCompleteOnApproval: false, expectedVersion: cfg.version })).status).toBe(200);
      const parent = await newTask("Thẻ cha bị chặn");
      const item = await addItem(parent.id, "Mục sẽ được trả về");

      const res = await api("post", `/tasks/${parent.id}/checklist/${item}/convert`, as("B"), { columnId: col("DONE") });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("TASK_002");
      const parentRow = await row(parent.id);
      expect(parentRow.checklist.map((i) => [i.text, i.done])).toEqual([["Mục sẽ được trả về", false]]);
      expect(parentRow.checklistTotal).toBe(1);
      expect(await prisma.task.count({ where: { boardId: board.id, title: "Mục sẽ được trả về" } })).toBe(0);
    });

    it("GUEST 404; thân sai (columnId lạ) 400", async () => {
      const parent = await newTask("Thẻ cha quyền");
      const item = await addItem(parent.id, "Mục quyền");
      expect((await api("post", `/tasks/${parent.id}/checklist/${item}/convert`, as("G"), {})).status).toBe(404);
      expect((await api("post", `/tasks/${parent.id}/checklist/${item}/convert`, as("B"), { columnId: "khong-hop-le" })).status).toBe(400);
      expect((await row(parent.id)).checklistTotal).toBe(1);
    });
  });
});
