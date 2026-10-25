import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, ensureProjectIndexes, makeApi, mutationId, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const app = buildProjectsApp();
const api = makeApi(app);

type Board = { id: string; columns: { id: string; kind: string }[] };
type Card = { id: string; title: string; columnId: string; position: string; version: number; assignees: { id: string; name: string }[]; isOverdue: boolean; labelIds: string[] };

describe("projects — thẻ, nhãn, số liệu admin (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  let g: Group;
  let board: Board;

  beforeAll(() => ensureProjectIndexes());
  beforeEach(async () => {
    installMocks();
    g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", D: "MEMBER", G: "GUEST" });
    groups.push(g);
    const res = await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Đồ án" });
    board = res.body.data;
  });
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const col = (kind: string) => board.columns.find((c) => c.kind === kind)!.id;
  const create = (who: string, body: Record<string, unknown>, headers?: Record<string, string>) =>
    api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids[who]), body, headers);
  const list = async (query = "", who = "C") => {
    const res = await api("get", `/boards/${board.id}/tasks${query}`, tokenFor(g.ids[who]));
    expect(res.status).toBe(200);
    return res.body.data.columns as { columnId: string; tasks: Card[]; hasMore: boolean }[];
  };
  const titles = async (query: string) => (await list(query)).flatMap((c) => c.tasks.map((t) => t.title));

  describe("POST /boards/:id/tasks", () => {
    it("201: mặc định cuối cột TODO đầu tiên, version 1; vị trí tăng dần; ghi null tường minh + activity CREATED + outbox", async () => {
      const a = (await create("C", { title: "  Việc A " })).body.data as Card;
      const b = (await create("C", { title: "Việc B" })).body.data as Card;
      expect(a).toMatchObject({ title: "Việc A", columnId: col("TODO"), version: 1, isOverdue: false });
      expect(a.position < b.position).toBe(true);

      const stored = await prisma.task.findUnique({ where: { id: a.id } });
      expect(stored).toMatchObject({ deletedAt: null, completedAt: null, dueDate: null, columnKind: "TODO", normalizedTitle: "viec a" });
      expect(await prisma.task.count({ where: { boardId: board.id, deletedAt: null, completedAt: null } })).toBe(2);
      expect((await prisma.taskActivity.findMany({ where: { taskId: a.id } })).map((x) => x.type)).toEqual(["CREATED"]);
      expect((await prisma.outboxEvent.findMany({ where: { aggregateId: a.id } })).map((e) => e.type)).toEqual(["task.created"]);
    });

    it("tạo với người làm/nhãn/hạn: outbox task.assigned + task.due-changed; assignees có tên; đủ trường", async () => {
      const label = (await api("post", `/boards/${board.id}/labels`, tokenFor(g.ids.C), { name: "ReactJS", color: "blue" })).body.data;
      const due = new Date(Date.now() + 2 * 86_400_000).toISOString();
      const res = await create("C", { title: "Slide", assigneeIds: [g.ids.C, g.ids.D], labelIds: [label.id], dueDate: due, columnId: col("IN_PROGRESS") });
      const card = res.body.data as Card;

      expect(res.status).toBe(201);
      expect(card.assignees.map((a) => a.name).sort()).toEqual(["Người C", "Người D"]);
      expect(card.labelIds).toEqual([label.id]);
      const types = (await prisma.outboxEvent.findMany({ where: { aggregateId: card.id } })).map((e) => e.type).sort();
      expect(types).toEqual(["task.assigned", "task.created", "task.due-changed"]);
      expect((await prisma.task.findUnique({ where: { id: card.id } }))?.dueVersion).toBe(1);
    });

    it("lỗi: tiêu đề rỗng 400; cột lạ TASK_001; người làm là GUEST/người ngoài + nhãn bảng khác → 400 kèm id sai; GUEST 404", async () => {
      expect((await create("C", { title: "" })).status).toBe(400);
      const badCol = await create("C", { title: "x", columnId: "c_zzzzzzzz" });
      expect([badCol.status, badCol.body.error.code]).toEqual([400, "TASK_001"]);

      const stranger = newObjectId();
      const foreignLabel = newObjectId();
      const bad = await create("C", { title: "x", assigneeIds: [g.ids.G, stranger], labelIds: [foreignLabel] });
      expect([bad.status, bad.body.error.code]).toEqual([400, "VAL_001"]);
      expect(bad.body.error.details).toEqual({ invalidAssigneeIds: [g.ids.G, stranger], invalidLabelIds: [foreignLabel] });
      expect(await prisma.task.count({ where: { boardId: board.id } })).toBe(0);

      expect((await create("G", { title: "x" })).status).toBe(404);
      expect((await api("post", `/boards/${board.id}/tasks`, tokenFor(newObjectId()), { title: "x" })).status).toBe(404);
    });

    it("clientTaskId idempotent: lần 2 → 200 cùng thẻ, không tạo trùng; Idempotency-Key replay trả lại response cũ", async () => {
      const first = await create("C", { title: "Một", clientTaskId: "client-task-0001" });
      const second = await create("C", { title: "Khác", clientTaskId: "client-task-0001" });
      expect([first.status, second.status]).toEqual([201, 200]);
      expect(second.body.data.id).toBe(first.body.data.id);
      expect(await prisma.task.count({ where: { boardId: board.id } })).toBe(1);

      const h = { "Idempotency-Key": "idem-key-0001" };
      const one = await create("D", { title: "Hai" }, h);
      const two = await create("D", { title: "Hai" }, h);
      expect(two.headers["idempotent-replayed"]).toBe("true");
      expect(two.body.data.id).toBe(one.body.data.id);
      expect(await prisma.task.count({ where: { boardId: board.id, createdBy: g.ids.D } })).toBe(1);
    });

    it("TASK_010: bảng đủ 5.000 thẻ → 409", async () => {
      await prisma.task.createMany({
        data: Array.from({ length: 5000 }, (_, i) => ({
          boardId: board.id, workspaceId: g.workspaceId, columnId: col("TODO"), columnKind: "TODO" as const,
          position: `a${i}`, title: `t${i}`, normalizedTitle: `t${i}`, createdBy: g.ids.A, deletedAt: null,
        })),
      });
      const res = await create("C", { title: "Thứ 5.001" });
      expect([res.status, res.body.error.code]).toEqual([409, "TASK_010"]);
    }, 30_000);
  });

  describe("GET /boards/:id/tasks — lọc, tìm, phân cột", () => {
    beforeEach(async () => {
      const label = (await api("post", `/boards/${board.id}/labels`, tokenFor(g.ids.C), { name: "Gấp", color: "red" })).body.data;
      await create("C", { title: "Viết báo cáo", assigneeIds: [g.ids.C], labelIds: [label.id] });
      await create("C", { title: "Nộp bài (tuần 3)", assigneeIds: [g.ids.D], dueDate: new Date(Date.now() - 86_400_000).toISOString() });
      await create("C", { title: "Ôn thi cuối kỳ", dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(), columnId: col("IN_PROGRESS") });
      await create("C", { title: "Đã xong trễ", dueDate: new Date(Date.now() - 86_400_000).toISOString(), columnId: col("DONE") });
    });

    it("nhóm theo cột theo thứ tự cột; overdue bỏ qua thẻ ở DONE; overdue=false KHÔNG bị coi là true", async () => {
      const cols = await list();
      expect(cols.map((c) => c.columnId)).toEqual(board.columns.map((c) => c.id));
      expect(cols.map((c) => c.tasks.length)).toEqual([2, 1, 0, 1]);
      expect(await titles("?overdue=true")).toEqual(["Nộp bài (tuần 3)"]);
      expect((await titles("?overdue=false")).length).toBe(4);
      expect((await api("get", `/boards/${board.id}/tasks?overdue=abc`, tokenFor(g.ids.C))).status).toBe(400);
    });

    it("assigneeId=me, assigneeId, labelId, dueBefore, columnId", async () => {
      expect(await titles("?assigneeId=me")).toEqual(["Viết báo cáo"]);
      expect((await api("get", `/boards/${board.id}/tasks?assigneeId=me`, tokenFor(g.ids.D))).body.data.columns[0].tasks.map((t: Card) => t.title)).toEqual(["Nộp bài (tuần 3)"]);
      expect(await titles(`?assigneeId=${g.ids.D}`)).toEqual(["Nộp bài (tuần 3)"]);
      const labelId = (await api("get", `/boards/${board.id}/labels`, tokenFor(g.ids.C))).body.data[0].id;
      expect(await titles(`?labelId=${labelId}`)).toEqual(["Viết báo cáo"]);
      expect((await titles(`?dueBefore=${new Date().toISOString()}`)).sort()).toEqual(["Nộp bài (tuần 3)", "Đã xong trễ"].sort());
      expect(await titles(`?columnId=${col("DONE")}`)).toEqual(["Đã xong trễ"]);
      expect((await api("get", `/boards/${board.id}/tasks?columnId=c_zzzzzzzz`, tokenFor(g.ids.C))).body.error.code).toBe("TASK_001");
    });

    it("q tìm tiêu đề không dấu/không phân biệt hoa thường; ký tự regex chỉ khớp LITERAL (không lỗi, không ReDoS)", async () => {
      expect(await titles("?q=bao%20cao")).toEqual(["Viết báo cáo"]);
      expect(await titles("?q=ON%20THI")).toEqual(["Ôn thi cuối kỳ"]);
      expect(await titles(`?q=${encodeURIComponent("(tuan 3)")}`)).toEqual(["Nộp bài (tuần 3)"]);
      expect(await titles(`?q=${encodeURIComponent(".*")}`)).toEqual([]);
      expect(await titles(`?q=${encodeURIComponent("(a+)+$")}`)).toEqual([]);
      expect((await api("get", `/boards/${board.id}/tasks?q=a`, tokenFor(g.ids.C))).status).toBe(400);
    });

    it("limitPerColumn + hasMore; giới hạn 1..200", async () => {
      const cols = await list("?limitPerColumn=1");
      expect(cols[0].tasks).toHaveLength(1);
      expect(cols[0].hasMore).toBe(true);
      expect(cols[1].hasMore).toBe(false);
      expect((await api("get", `/boards/${board.id}/tasks?limitPerColumn=201`, tokenFor(g.ids.C))).status).toBe(400);
    });

    it("thẻ THIẾU hẳn trường dueDate (seed cũ): không bị overdue/dueBefore/số quá hạn admin bắt nhầm, vẫn hiện khi không lọc", async () => {
      // Prisma+Mongo bỏ hẳn trường optional không truyền (khác null tường minh của `TaskService.create`) — y như thẻ `seed-demo-workspace.ts` cũ.
      // Khoá hành vi của Prisma 5.22 (tự chặn trường vắng bằng `$$REMOVE`, xem `filterWhere`): nâng Prisma mà đỏ thì thêm `isSet: true`.
      const seeded = await prisma.task.create({
        data: {
          boardId: board.id, workspaceId: g.workspaceId, columnId: col("TODO"), columnKind: "TODO", position: "a9",
          title: "Thẻ seed không có hạn", normalizedTitle: "the seed khong co han", createdBy: g.ids.A, deletedAt: null,
        },
      });
      const absent = await prisma.$runCommandRaw({ count: "Task", query: { _id: { $oid: seeded.id }, dueDate: { $exists: false } } });
      expect(absent.n).toBe(1);

      const all = (await list()).flatMap((c) => c.tasks);
      expect(all.find((t) => t.id === seeded.id)).toMatchObject({ title: "Thẻ seed không có hạn", isOverdue: false });
      expect(await titles("?overdue=true")).toEqual(["Nộp bài (tuần 3)"]);
      expect((await titles(`?dueBefore=${new Date().toISOString()}`)).sort()).toEqual(["Nộp bài (tuần 3)", "Đã xong trễ"].sort());
      const stats = await api("get", `/admin/workspaces/${g.workspaceId}/project-stats`, tokenFor(newObjectId(), "admin"));
      expect(stats.body.data.totals.overdue).toBe(1);
    });
  });

  describe("nhãn", () => {
    const createLabel = (who: string, body: Record<string, unknown>) => api("post", `/boards/${board.id}/labels`, tokenFor(g.ids[who]), body);

    it("MEMBER tạo/sửa; trùng tên (không phân biệt hoa/dấu) → 409 RES_002; màu ngoài bảng token → 400; GUEST 404", async () => {
      const ok = await createLabel("C", { name: "Frontend", color: "teal" });
      expect([ok.status, ok.body.data]).toEqual([201, expect.objectContaining({ name: "Frontend", color: "teal", boardId: board.id })]);
      const dup = await createLabel("D", { name: "frontend", color: "red" });
      expect([dup.status, dup.body.error.code]).toEqual([409, "RES_002"]);
      expect((await createLabel("C", { name: "X", color: "#ff0000" })).status).toBe(400);
      expect((await createLabel("G", { name: "X", color: "red" })).status).toBe(404);

      const other = (await createLabel("C", { name: "Backend", color: "blue" })).body.data;
      const renamed = await api("patch", `/labels/${ok.body.data.id}`, tokenFor(g.ids.D), { name: "UI", color: "pink" });
      expect([renamed.status, renamed.body.data]).toEqual([200, expect.objectContaining({ name: "UI", color: "pink" })]);
      const clash = await api("patch", `/labels/${other.id}`, tokenFor(g.ids.C), { name: "ui" });
      expect([clash.status, clash.body.error.code]).toEqual([409, "RES_002"]);
      expect((await api("patch", `/labels/${other.id}`, tokenFor(g.ids.C), {})).status).toBe(400);
      expect((await api("get", `/boards/${board.id}/labels`, tokenFor(g.ids.C))).body.data.map((l: { name: string }) => l.name)).toEqual(["UI", "Backend"]);
    });

    it("tạo 8 nhãn cùng tên ĐỒNG THỜI → đúng 1 thành công, còn lại 409 (unique index chặn đua)", async () => {
      const results = await Promise.all(Array.from({ length: 8 }, (_, i) => createLabel(i % 2 ? "C" : "D", { name: "Song song", color: "blue" })));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(7);
      expect(await prisma.label.count({ where: { boardId: board.id } })).toBe(1);
    });

    it("TASK_011: bảng đủ 50 nhãn → 409", async () => {
      await prisma.label.createMany({
        data: Array.from({ length: 50 }, (_, i) => ({ boardId: board.id, workspaceId: g.workspaceId, name: `L${i}`, normalizedName: `l${i}`, color: "gray" })),
      });
      const res = await createLabel("C", { name: "Thứ 51", color: "red" });
      expect([res.status, res.body.error.code]).toEqual([409, "TASK_011"]);
    });

    it("xoá nhãn CHƯA dùng: MEMBER được; nhãn ĐANG dùng: MEMBER 403, ADMIN xoá và gỡ khỏi thẻ (kể cả thẻ đã xoá mềm)", async () => {
      const unused = (await createLabel("C", { name: "Nháp", color: "gray" })).body.data;
      expect((await api("delete", `/labels/${unused.id}`, tokenFor(g.ids.C))).status).toBe(200);
      expect(await prisma.label.count({ where: { id: unused.id } })).toBe(0);

      const used = (await createLabel("C", { name: "Đang dùng", color: "green" })).body.data;
      const keep = (await create("C", { title: "giữ", labelIds: [used.id] })).body.data as Card;
      const soft = (await create("C", { title: "xoá mềm", labelIds: [used.id] })).body.data as Card;
      await prisma.task.update({ where: { id: soft.id }, data: { deletedAt: new Date() } });

      const denied = await api("delete", `/labels/${used.id}`, tokenFor(g.ids.C));
      expect([denied.status, denied.body.error.code]).toEqual([403, "PERM_001"]);
      expect(await prisma.label.count({ where: { id: used.id } })).toBe(1);

      expect((await api("delete", `/labels/${used.id}`, tokenFor(g.ids.B))).status).toBe(200);
      expect(await prisma.label.count({ where: { id: used.id } })).toBe(0);
      expect((await prisma.task.findUnique({ where: { id: keep.id } }))?.labelIds).toEqual([]);
      expect((await prisma.task.findUnique({ where: { id: soft.id } }))?.labelIds).toEqual([]);
      expect((await api("delete", `/labels/${used.id}`, tokenFor(g.ids.B))).status).toBe(404);
    });

    it("xoá nhãn CHỈ còn trên thẻ đã xoá mềm: MEMBER được (không thẻ sống nào dùng) và id nhãn vẫn bị gỡ khỏi thẻ trong thùng rác", async () => {
      const label = (await createLabel("C", { name: "Chỉ thùng rác", color: "orange" })).body.data;
      const trashed = (await create("C", { title: "đã vào thùng rác", labelIds: [label.id] })).body.data as Card;
      await prisma.task.update({ where: { id: trashed.id }, data: { deletedAt: new Date() } });

      expect((await api("delete", `/labels/${label.id}`, tokenFor(g.ids.C))).status).toBe(200);
      expect(await prisma.label.count({ where: { id: label.id } })).toBe(0);
      // Còn sót id thì khôi phục thẻ mang về nhãn "mồ côi" (vẫn tính vào giới hạn nhãn/thẻ).
      expect((await prisma.task.findUnique({ where: { id: trashed.id } }))?.labelIds).toEqual([]);
    });
  });

  describe("GET /admin/workspaces/:id/project-stats", () => {
    it("chỉ số liệu (không có tiêu đề thẻ); quyền workspace:view; cờ bảng lưu trữ; tuần 8 bucket", async () => {
      const done = (await create("C", { title: "BÍ MẬT-tiêu-đề", dueDate: new Date(Date.now() + 86_400_000).toISOString() })).body.data as Card;
      await create("C", { title: "quá hạn", dueDate: new Date(Date.now() - 86_400_000).toISOString() });
      await api("post", `/tasks/${done.id}/move`, tokenFor(g.ids.C), {
        columnId: col("DONE"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId(),
      });
      const second = (await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Bảng cũ" })).body.data as Board;
      await api("post", `/boards/${second.id}/archive`, tokenFor(g.ids.A));

      const admin = await api("get", `/admin/workspaces/${g.workspaceId}/project-stats`, tokenFor(newObjectId(), "admin"));
      expect(admin.status).toBe(200);
      const data = admin.body.data;
      expect(data.totals).toEqual({ boards: 1, archivedBoards: 1, tasks: 2, done30d: 1, overdue: 1 });
      expect(data.boards).toHaveLength(2);
      expect(data.boards[0]).toMatchObject({ id: board.id, name: "Đồ án", archived: false, columnCount: 4, byKind: { TODO: 1, IN_PROGRESS: 0, REVIEW: 0, DONE: 1 } });
      expect(data.boards[1]).toMatchObject({ archived: true });
      expect(data.doneByWeek).toHaveLength(8);
      expect(data.doneByWeek.reduce((s: number, w: { count: number }) => s + w.count, 0)).toBe(1);
      expect(JSON.stringify(admin.body)).not.toContain("BÍ MẬT");

      expect((await api("get", `/admin/workspaces/${g.workspaceId}/project-stats`, tokenFor(g.ids.A, "user"))).status).toBe(403);
      expect((await api("get", `/admin/workspaces/${newObjectId()}/project-stats`, tokenFor(newObjectId(), "admin"))).status).toBe(404);
    });
  });
});
