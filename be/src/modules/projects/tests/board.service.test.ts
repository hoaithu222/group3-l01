// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { AppError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { BOARD_COLUMN_ID_REGEX } from "../../../core/constants/project";
import { ServiceHarness } from "./support/service-harness";

let h: ServiceHarness;
let owner: AuthUser;
let admin: AuthUser;
let member: AuthUser;

beforeEach(() => {
  h = new ServiceHarness();
  owner = h.addUser("OWNER");
  admin = h.addUser("ADMIN");
  member = h.addUser("MEMBER");
});

const catchError = async (p: Promise<unknown>): Promise<AppError> => {
  try {
    await p;
  } catch (err) {
    return err as AppError;
  }
  throw new Error("Đáng lẽ phải ném lỗi");
};

const putBody = (columns: { title: string; kind: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE"; id?: string }[], expectedVersion = 1) => ({
  columns,
  expectedVersion,
});

describe("board.service.create/list/get", () => {
  it("OWNER/ADMIN tạo bảng với 4 cột mặc định từ config (id ổn định, đúng 1 DONE), version 1", async () => {
    const dto = await h.boardService.create(admin, h.workspaceId, { name: "Đồ án" });
    expect(dto).toMatchObject({ name: "Đồ án", version: 1, archivedAt: null, createdBy: admin.id });
    expect(dto.columns.map((c) => [c.title, c.kind, c.order])).toEqual([
      ["To do", "TODO", 0],
      ["In progress", "IN_PROGRESS", 1],
      ["Review", "REVIEW", 2],
      ["Done", "DONE", 3],
    ]);
    for (const c of dto.columns) expect(c.id).toMatch(BOARD_COLUMN_ID_REGEX);
    expect(dto.columns.filter((c) => c.kind === "DONE")).toHaveLength(1);
  });

  it("cột do người dùng gửi thay mẫu mặc định; sai (không có DONE) → TASK_008", async () => {
    const dto = await h.boardService.create(owner, h.workspaceId, {
      name: "Scrum",
      columns: [{ title: "Backlog", kind: "TODO" }, { title: "Xong", kind: "DONE", wipLimit: 5 }],
    });
    expect(dto.columns.map((c) => c.title)).toEqual(["Backlog", "Xong"]);
    expect(dto.columns[1].wipLimit).toBe(5);
    const err = await catchError(
      h.boardService.create(owner, h.workspaceId, { name: "X", columns: [{ title: "a", kind: "TODO" }, { title: "b", kind: "TODO" }] })
    );
    expect(err).toMatchObject({ statusCode: 400, errorCode: "TASK_008" });
  });

  it("MEMBER tạo bảng → 403; GUEST → 404; nhóm ARCHIVED → 403", async () => {
    expect(await catchError(h.boardService.create(member, h.workspaceId, { name: "X" }))).toMatchObject({ statusCode: 403 });
    const guest = h.addUser("GUEST");
    expect(await catchError(h.boardService.create(guest, h.workspaceId, { name: "X" }))).toMatchObject({ statusCode: 404, errorCode: "PERM_404" });
    h.workspaceStatus = "ARCHIVED";
    expect(await catchError(h.boardService.create(owner, h.workspaceId, { name: "X" }))).toMatchObject({ statusCode: 403 });
  });

  it("đủ số bảng đang hoạt động → TASK_009 (409); bảng đã lưu trữ không tính", async () => {
    h.config = { ...h.config, perWorkspaceMax: 2 };
    const first = await h.boardService.create(owner, h.workspaceId, { name: "1" });
    await h.boardService.create(owner, h.workspaceId, { name: "2" });
    expect(await catchError(h.boardService.create(owner, h.workspaceId, { name: "3" }))).toMatchObject({ statusCode: 409, errorCode: "TASK_009" });

    await h.boardService.archive(owner, first.id);
    await h.boardService.create(owner, h.workspaceId, { name: "3" });
    // Khôi phục khi nhóm lại đủ bảng → TASK_009.
    expect(await catchError(h.boardService.restore(owner, first.id))).toMatchObject({ errorCode: "TASK_009" });
  });

  it("list: BoardSummaryDto có số thẻ theo cột + doneCount; archived=true chỉ bảng lưu trữ", async () => {
    const board = await h.createBoard(owner);
    const a = await h.addTask(member, board, "a");
    await h.addTask(member, board, "b");
    await h.moveService.move(member, a.id, { columnId: h.columnId(board, "DONE"), afterTaskId: null, beforeTaskId: null, expectedVersion: 1, clientMutationId: "mutation-00000001" });

    const [summary] = await h.boardService.list(member, h.workspaceId, false);
    expect(summary).toMatchObject({ id: board.id, taskCount: 2, doneCount: 1 });
    expect(summary.columns.map((c) => c.taskCount)).toEqual([1, 0, 0, 1]);
    expect(await h.boardService.list(member, h.workspaceId, true)).toEqual([]);

    await h.boardService.archive(owner, board.id);
    expect(await h.boardService.list(member, h.workspaceId, false)).toEqual([]);
    expect((await h.boardService.list(member, h.workspaceId, true))[0].id).toBe(board.id);
  });

  it("get: kèm nhãn + myPermissions theo vai (MEMBER không có board.edit; lưu trữ chỉ còn đọc)", async () => {
    const board = await h.createBoard(owner);
    await h.labels.create({ boardId: board.id, workspaceId: h.workspaceId, name: "Gấp", normalizedName: "gap", color: "red" });

    const asMember = await h.boardService.get(member, board.id);
    expect(asMember.labels.map((l) => l.name)).toEqual(["Gấp"]);
    expect(asMember.myPermissions).toEqual(expect.arrayContaining(["workspace.board.read", "workspace.task.create", "workspace.task.status"]));
    expect(asMember.myPermissions).not.toContain("workspace.board.edit");
    expect((await h.boardService.get(owner, board.id)).myPermissions).toContain("workspace.board.edit");

    await h.boardService.archive(owner, board.id);
    expect((await h.boardService.get(owner, board.id)).myPermissions).toEqual(["workspace.board.read"]);
  });
});

describe("board.service.patch", () => {
  it("cập nhật tên/mô tả, version +1, phát board:updated; lệch version → 409 RES_003", async () => {
    const board = await h.createBoard(owner);
    const updated = await h.boardService.patch(admin, board.id, { name: "Tên mới", description: "Mô tả", expectedVersion: 1 });
    expect(updated).toMatchObject({ name: "Tên mới", description: "Mô tả", version: 2 });
    expect(h.emitter.of("board:updated")[0].payload).toEqual({ boardId: board.id, version: 2 });

    const err = await catchError(h.boardService.patch(admin, board.id, { name: "Lại", expectedVersion: 1 }));
    expect(err).toMatchObject({ statusCode: 409, errorCode: "RES_003", details: { currentVersion: 2 } });
  });

  it("MEMBER sửa bảng → 403; mô tả rỗng → xoá (null)", async () => {
    const board = await h.createBoard(owner);
    expect(await catchError(h.boardService.patch(member, board.id, { name: "X", expectedVersion: 1 }))).toMatchObject({ statusCode: 403 });
    await h.boardService.patch(owner, board.id, { description: "abc", expectedVersion: 1 });
    expect((await h.boardService.patch(owner, board.id, { description: "", expectedVersion: 2 })).description).toBeNull();
  });
});

describe("board.service.putColumns (PM2-11, PM2-13 mức service)", () => {
  it("PM2-11: bỏ cột còn thẻ → 409 TASK_007 kèm taskCount; bỏ cột rỗng thì được", async () => {
    const board = await h.createBoard(owner);
    await h.addTask(member, board, "a");
    await h.addTask(member, board, "b");
    const [todo, doing, review, done] = board.columns;

    const err = await catchError(
      h.boardService.putColumns(owner, board.id, putBody([{ id: doing.id, title: "Doing", kind: "IN_PROGRESS" }, { id: done.id, title: "Done", kind: "DONE" }]))
    );
    expect(err).toMatchObject({ statusCode: 409, errorCode: "TASK_007", details: { columnId: todo.id, taskCount: 2 } });
    expect((await h.boardService.get(owner, board.id)).version).toBe(1);

    const ok = await h.boardService.putColumns(
      owner,
      board.id,
      putBody([
        { id: todo.id, title: "To do", kind: "TODO" },
        { id: doing.id, title: "Doing", kind: "IN_PROGRESS" },
        { id: done.id, title: "Done", kind: "DONE" },
      ])
    );
    expect(ok.columns.map((c) => c.id)).toEqual([todo.id, doing.id, done.id]);
    expect(ok.version).toBe(2);
    void review;
  });

  it("PM2-13: không có cột DONE hoặc 2 cột DONE → 400 TASK_008", async () => {
    const board = await h.createBoard(owner);
    const [todo, doing, review, done] = board.columns;
    const noDone = h.boardService.putColumns(owner, board.id, putBody([{ id: todo.id, title: "a", kind: "TODO" }, { id: doing.id, title: "b", kind: "IN_PROGRESS" }]));
    expect(await catchError(noDone)).toMatchObject({ statusCode: 400, errorCode: "TASK_008" });

    const twoDone = h.boardService.putColumns(
      owner,
      board.id,
      putBody([
        { id: todo.id, title: "a", kind: "TODO" },
        { id: review.id, title: "b", kind: "DONE" },
        { id: done.id, title: "c", kind: "DONE" },
      ])
    );
    expect(await catchError(twoDone)).toMatchObject({ statusCode: 400, errorCode: "TASK_008" });
    expect(doing).toBeDefined();
  });

  it("đổi loại DONE ↔ khác trên cột có thẻ → TASK_008; đổi loại khác cập nhật columnKind của thẻ; thêm cột mới sinh id", async () => {
    const board = await h.createBoard(owner);
    const [todo, doing, review, done] = board.columns;
    const inDone = await h.addTask(member, board, "d", { columnId: done.id });
    const inDoing = await h.addTask(member, board, "x", { columnId: doing.id });

    const swap = h.boardService.putColumns(
      owner,
      board.id,
      putBody([
        { id: todo.id, title: "a", kind: "TODO" },
        { id: doing.id, title: "b", kind: "IN_PROGRESS" },
        { id: review.id, title: "c", kind: "DONE" },
        { id: done.id, title: "d", kind: "REVIEW" },
      ])
    );
    expect(await catchError(swap)).toMatchObject({ errorCode: "TASK_008" });

    const res = await h.boardService.putColumns(
      owner,
      board.id,
      putBody([
        { id: todo.id, title: "a", kind: "TODO" },
        { id: doing.id, title: "b", kind: "REVIEW" }, // đổi loại, cột có thẻ
        { title: "Mới", kind: "IN_PROGRESS" },
        { id: review.id, title: "c", kind: "REVIEW" },
        { id: done.id, title: "d", kind: "DONE" },
      ])
    );
    expect(res.columns).toHaveLength(5);
    expect(res.columns[2].id).toMatch(BOARD_COLUMN_ID_REGEX);
    expect((await h.tasks.findById(inDoing.id))?.columnKind).toBe("REVIEW");
    expect((await h.tasks.findById(inDone.id))?.columnKind).toBe("DONE");
  });

  it("lệch expectedVersion → 409 RES_003; id không thuộc bảng → 400; MEMBER → 403", async () => {
    const board = await h.createBoard(owner);
    const cols = board.columns.map((c) => ({ id: c.id, title: c.title, kind: c.kind }));
    expect(await catchError(h.boardService.putColumns(owner, board.id, putBody(cols, 7)))).toMatchObject({ statusCode: 409, errorCode: "RES_003" });
    expect(await catchError(h.boardService.putColumns(owner, board.id, putBody([{ ...cols[0], id: "c_zzzzzzzz" }, ...cols.slice(1)])))).toMatchObject({ statusCode: 400 });
    expect(await catchError(h.boardService.putColumns(member, board.id, putBody(cols)))).toMatchObject({ statusCode: 403 });
  });
});

describe("board.service.archive/restore", () => {
  it("idempotent; ADMIN được; MEMBER → 403; bảng lưu trữ chỉ còn đọc", async () => {
    const board = await h.createBoard(owner);
    expect(await catchError(h.boardService.archive(member, board.id))).toMatchObject({ statusCode: 403 });

    const archived = await h.boardService.archive(admin, board.id);
    expect(archived.archivedAt).not.toBeNull();
    const again = await h.boardService.archive(admin, board.id);
    expect(again.version).toBe(archived.version); // không ghi lần 2

    // Sửa/kéo/tạo thẻ trên bảng lưu trữ bị chặn; đọc vẫn được.
    expect(await catchError(h.boardService.patch(owner, board.id, { name: "X", expectedVersion: archived.version }))).toMatchObject({ statusCode: 403 });
    expect((await h.boardService.get(member, board.id)).archivedAt).not.toBeNull();

    const restored = await h.boardService.restore(admin, board.id);
    expect(restored.archivedAt).toBeNull();
    expect(h.emitter.of("board:updated")).toHaveLength(2);
  });
});
