import { installMocks, redisStore } from "./projects-test-mocks";
import { buildProjectsApp, cleanupGroups, makeApi, mutationId, seedGroup, tokenFor, type Group } from "./projects-test-kit";
import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";

const app = buildProjectsApp();
const api = makeApi(app);

describe("projects — bảng, cột, lưu trữ (integration, Mongo memory replset)", () => {
  const groups: Group[] = [];
  const setup = async (status: "ACTIVE" | "ARCHIVED" = "ACTIVE") => {
    const g = await seedGroup({ A: "OWNER", B: "ADMIN", C: "MEMBER", D: "MEMBER", G: "GUEST" }, status);
    groups.push(g);
    return g;
  };

  beforeEach(() => installMocks());
  afterEach(async () => {
    await cleanupGroups(groups.splice(0));
    redisStore.clear();
  });

  const createBoard = async (g: Group, who = "A", body: Record<string, unknown> = { name: "Đồ án" }) => {
    const res = await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids[who]), body);
    expect(res.status).toBe(201);
    return res.body.data as { id: string; version: number; columns: { id: string; kind: string; title: string }[] };
  };
  const colId = (b: { columns: { id: string; kind: string }[] }, kind: string) => b.columns.find((c) => c.kind === kind)!.id;
  const addTask = async (g: Group, boardId: string, title: string, extra: Record<string, unknown> = {}, who = "C") => {
    const res = await api("post", `/boards/${boardId}/tasks`, tokenFor(g.ids[who]), { title, ...extra });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; version: number; columnId: string; position: string };
  };

  describe("tạo / danh sách / chi tiết", () => {
    it("OWNER và ADMIN tạo bảng với 4 cột mặc định; MEMBER 403; GUEST và người ngoài 404; body sai 400", async () => {
      const g = await setup();
      const board = await createBoard(g, "A");
      expect(board.columns.map((c) => c.kind)).toEqual(["TODO", "IN_PROGRESS", "REVIEW", "DONE"]);
      await createBoard(g, "B", { name: "Scrum nhẹ" });

      const member = await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.C), { name: "X" });
      expect([member.status, member.body.error.code]).toEqual([403, "PERM_001"]);
      const guest = await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.G), { name: "X" });
      expect([guest.status, guest.body.error.code]).toEqual([404, "PERM_404"]);
      const outsider = await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(newObjectId()), { name: "X" });
      expect(outsider.status).toBe(404);
      const bad = await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "" });
      expect([bad.status, bad.body.error.code]).toEqual([400, "VAL_001"]);
    });

    it("trường lọc sau này được ghi null tường minh (archivedAt) — lọc {archivedAt: null} tìm thấy bảng mới", async () => {
      const g = await setup();
      const board = await createBoard(g);
      expect(await prisma.board.count({ where: { id: board.id, archivedAt: null } })).toBe(1);
    });

    it("nhóm ARCHIVED không tạo được bảng (403); đủ 20 bảng → TASK_009 (409)", async () => {
      const archivedGroup = await setup("ARCHIVED");
      const denied = await api("post", `/workspaces/${archivedGroup.workspaceId}/boards`, tokenFor(archivedGroup.ids.A), { name: "X" });
      expect(denied.status).toBe(403);

      const g = await setup();
      await prisma.board.createMany({
        data: Array.from({ length: 20 }, (_, i) => ({
          workspaceId: g.workspaceId,
          name: `B${i}`,
          normalizedName: `b${i}`,
          description: null,
          columns: [
            { id: "c_aaaaaaaa", title: "a", kind: "TODO" as const, order: 0, wipLimit: null },
            { id: "c_bbbbbbbb", title: "b", kind: "DONE" as const, order: 1, wipLimit: null },
          ],
          createdBy: g.ids.A,
          archivedAt: null,
        })),
      });
      const full = await api("post", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.A), { name: "Thứ 21" });
      expect([full.status, full.body.error.code]).toEqual([409, "TASK_009"]);
    });

    it("danh sách kèm số thẻ theo cột + doneCount; ?archived=true", async () => {
      const g = await setup();
      const board = await createBoard(g);
      const t = await addTask(g, board.id, "a");
      await addTask(g, board.id, "b");
      await api("post", `/tasks/${t.id}/move`, tokenFor(g.ids.C), {
        columnId: colId(board, "DONE"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId(),
      });

      const list = await api("get", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.C));
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id: board.id, taskCount: 2, doneCount: 1 });
      expect(list.body.data[0].columns.map((c: { taskCount: number }) => c.taskCount)).toEqual([1, 0, 0, 1]);

      const archivedList = await api("get", `/workspaces/${g.workspaceId}/boards?archived=true`, tokenFor(g.ids.C));
      expect(archivedList.body.data).toEqual([]);
      expect((await api("get", `/workspaces/${g.workspaceId}/boards?archived=maybe`, tokenFor(g.ids.C))).status).toBe(400);
    });

    it("PM2-14: GET /boards/:id — thành viên 200 kèm myPermissions; người ngoài và GUEST 404", async () => {
      const g = await setup();
      const board = await createBoard(g);

      const asMember = await api("get", `/boards/${board.id}`, tokenFor(g.ids.C));
      expect(asMember.status).toBe(200);
      expect(asMember.body.data.myPermissions).toContain("workspace.task.status");
      expect(asMember.body.data.myPermissions).not.toContain("workspace.board.edit");
      expect((await api("get", `/boards/${board.id}`, tokenFor(g.ids.A))).body.data.myPermissions).toContain("workspace.board.edit");

      const outsider = await api("get", `/boards/${board.id}`, tokenFor(newObjectId()));
      expect([outsider.status, outsider.body.error.code]).toEqual([404, "PERM_404"]);
      const guest = await api("get", `/boards/${board.id}`, tokenFor(g.ids.G));
      expect([guest.status, guest.body.error.code]).toEqual([404, "PERM_404"]);
      expect((await api("get", `/boards/${newObjectId()}`, tokenFor(g.ids.A))).status).toBe(404);
      expect((await api("get", `/boards/khong-hop-le`, tokenFor(g.ids.A))).status).toBe(400);
      // GUEST cũng không xem được thẻ/nhãn/danh sách bảng.
      expect((await api("get", `/boards/${board.id}/tasks`, tokenFor(g.ids.G))).status).toBe(404);
      expect((await api("get", `/boards/${board.id}/labels`, tokenFor(g.ids.G))).status).toBe(404);
      expect((await api("get", `/workspaces/${g.workspaceId}/boards`, tokenFor(g.ids.G))).status).toBe(404);
    });

    it("chưa đăng nhập → 401", async () => {
      const g = await setup();
      const board = await createBoard(g);
      expect((await api("get", `/boards/${board.id}`, "token-rac")).status).toBe(401);
    });
  });

  describe("PATCH /boards/:id", () => {
    it("OWNER/ADMIN sửa tên (version +1); lệch expectedVersion → 409 RES_003; MEMBER 403", async () => {
      const g = await setup();
      const board = await createBoard(g);
      const ok = await api("patch", `/boards/${board.id}`, tokenFor(g.ids.B), { name: "  Tên mới ", expectedVersion: 1 });
      expect(ok.status).toBe(200);
      expect(ok.body.data).toMatchObject({ name: "Tên mới", version: 2 });

      const stale = await api("patch", `/boards/${board.id}`, tokenFor(g.ids.A), { name: "Lại", expectedVersion: 1 });
      expect([stale.status, stale.body.error.code, stale.body.error.details.currentVersion]).toEqual([409, "RES_003", 2]);
      expect((await api("patch", `/boards/${board.id}`, tokenFor(g.ids.C), { name: "X", expectedVersion: 2 })).status).toBe(403);
      expect((await api("patch", `/boards/${board.id}`, tokenFor(g.ids.A), { expectedVersion: 2 })).status).toBe(400);
    });
  });

  describe("PUT /boards/:id/columns", () => {
    const putColumns = (g: Group, boardId: string, columns: unknown[], expectedVersion: number, who = "A") =>
      api("put", `/boards/${boardId}/columns`, tokenFor(g.ids[who]), { columns, expectedVersion });

    it("PM2-11: bỏ cột còn thẻ → 409 TASK_007 { taskCount } và bảng không đổi", async () => {
      const g = await setup();
      const board = await createBoard(g);
      await addTask(g, board.id, "a");
      await addTask(g, board.id, "b");
      const [todo, doing, review, done] = board.columns;

      const res = await putColumns(g, board.id, [{ id: doing.id, title: "Doing", kind: "IN_PROGRESS" }, { id: done.id, title: "Done", kind: "DONE" }], 1);
      expect([res.status, res.body.error.code, res.body.error.details]).toEqual([409, "TASK_007", { columnId: todo.id, taskCount: 2 }]);
      const after = await api("get", `/boards/${board.id}`, tokenFor(g.ids.A));
      expect([after.body.data.version, after.body.data.columns]).toEqual([1, board.columns.map((c, i) => expect.objectContaining({ id: c.id, order: i }))]);

      // Bỏ cột rỗng thì được (Review), thẻ giữ nguyên.
      const ok = await putColumns(g, board.id, [todo, doing, done].map((c) => ({ id: c.id, title: c.title, kind: c.kind })), 1);
      expect(ok.status).toBe(200);
      expect(ok.body.data.columns).toHaveLength(3);
      expect(ok.body.data.version).toBe(2);
      expect(await prisma.task.count({ where: { boardId: board.id, deletedAt: null } })).toBe(2);
      void review;
    });

    it("PM2-13: không có cột DONE hoặc có 2 cột DONE → 400 TASK_008", async () => {
      const g = await setup();
      const board = await createBoard(g);
      const [todo, doing, review, done] = board.columns;

      const none = await putColumns(g, board.id, [{ id: todo.id, title: "a", kind: "TODO" }, { id: doing.id, title: "b", kind: "IN_PROGRESS" }], 1);
      expect([none.status, none.body.error.code]).toEqual([400, "TASK_008"]);
      const two = await putColumns(g, board.id, [
        { id: todo.id, title: "a", kind: "TODO" },
        { id: review.id, title: "b", kind: "DONE" },
        { id: done.id, title: "c", kind: "DONE" },
      ], 1);
      expect([two.status, two.body.error.code]).toEqual([400, "TASK_008"]);
      expect((await api("get", `/boards/${board.id}`, tokenFor(g.ids.A))).body.data.version).toBe(1);
      void doing;
    });

    it("đổi loại DONE ↔ khác trên cột có thẻ → TASK_008; đổi loại khác cập nhật columnKind của thẻ; thêm cột mới", async () => {
      const g = await setup();
      const board = await createBoard(g);
      const [todo, doing, review, done] = board.columns;
      const inDone = await addTask(g, board.id, "x", { columnId: done.id });
      const inDoing = await addTask(g, board.id, "y", { columnId: doing.id });

      const swap = await putColumns(g, board.id, [
        { id: todo.id, title: "a", kind: "TODO" }, { id: doing.id, title: "b", kind: "IN_PROGRESS" },
        { id: review.id, title: "c", kind: "DONE" }, { id: done.id, title: "d", kind: "REVIEW" },
      ], 1);
      expect([swap.status, swap.body.error.code]).toEqual([400, "TASK_008"]);
      expect((await prisma.task.findUnique({ where: { id: inDone.id } }))?.columnKind).toBe("DONE");

      const ok = await putColumns(g, board.id, [
        { id: todo.id, title: "a", kind: "TODO" }, { id: doing.id, title: "b", kind: "REVIEW", wipLimit: 3 },
        { title: "Mới", kind: "IN_PROGRESS" }, { id: review.id, title: "c", kind: "REVIEW" }, { id: done.id, title: "d", kind: "DONE" },
      ], 1);
      expect(ok.status).toBe(200);
      expect(ok.body.data.columns).toHaveLength(5);
      expect(ok.body.data.columns[1]).toMatchObject({ kind: "REVIEW", wipLimit: 3 });
      expect(ok.body.data.columns[2].id).toMatch(/^c_[A-Za-z0-9]{8}$/);
      expect((await prisma.task.findUnique({ where: { id: inDoing.id } }))?.columnKind).toBe("REVIEW");
    });

    it("lệch expectedVersion → 409 RES_003; MEMBER 403; id lạ / số cột sai → 400", async () => {
      const g = await setup();
      const board = await createBoard(g);
      const cols = board.columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind }));
      expect((await putColumns(g, board.id, cols, 9)).body.error.code).toBe("RES_003");
      expect((await putColumns(g, board.id, cols, 1, "C")).status).toBe(403);
      expect((await putColumns(g, board.id, [{ ...cols[0], id: "c_zzzzzzzz" }, ...cols.slice(1)], 1)).status).toBe(400);
      expect((await putColumns(g, board.id, [cols[3]], 1)).status).toBe(400);
    });
  });

  describe("lưu trữ / khôi phục", () => {
    it("OWNER/ADMIN lưu trữ (idempotent); bảng lưu trữ vẫn đọc được nhưng mọi ghi bị chặn; khôi phục mở lại", async () => {
      const g = await setup();
      const board = await createBoard(g);
      const t = await addTask(g, board.id, "a");
      expect((await api("post", `/boards/${board.id}/archive`, tokenFor(g.ids.C))).status).toBe(403);

      const archived = await api("post", `/boards/${board.id}/archive`, tokenFor(g.ids.B));
      expect(archived.status).toBe(200);
      expect(archived.body.data.archivedAt).not.toBeNull();
      expect((await api("post", `/boards/${board.id}/archive`, tokenFor(g.ids.B))).body.data.version).toBe(archived.body.data.version);

      const read = await api("get", `/boards/${board.id}`, tokenFor(g.ids.C));
      expect([read.status, read.body.data.myPermissions]).toEqual([200, ["workspace.board.read"]]);
      expect((await api("get", `/boards/${board.id}/tasks`, tokenFor(g.ids.C))).status).toBe(200);
      const blockedCreate = await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "x" });
      const blockedMove = await api("post", `/tasks/${t.id}/move`, tokenFor(g.ids.C), {
        columnId: colId(board, "DONE"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: mutationId(),
      });
      const blockedPatch = await api("patch", `/boards/${board.id}`, tokenFor(g.ids.A), { name: "x", expectedVersion: archived.body.data.version });
      expect([blockedCreate.status, blockedMove.status, blockedPatch.status]).toEqual([403, 403, 403]);

      expect((await api("get", `/workspaces/${g.workspaceId}/boards?archived=true`, tokenFor(g.ids.C))).body.data).toHaveLength(1);
      const restored = await api("post", `/boards/${board.id}/restore`, tokenFor(g.ids.A));
      expect(restored.body.data.archivedAt).toBeNull();
      expect((await api("post", `/boards/${board.id}/tasks`, tokenFor(g.ids.C), { title: "lại được" })).status).toBe(201);
    });
  });
});
