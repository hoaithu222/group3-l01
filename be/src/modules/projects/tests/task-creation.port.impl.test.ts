/**
 * Unit — `TaskCreationPortImpl` (p7-04, cổng `ITaskCreationPort`): kiểm quyền tạo thẻ qua `ProjectAccess.board` (`workspace.task.create`), trả `workspaceId` của bảng, bảng đã lưu trữ bị chặn,
 * và tạo thẻ bằng CHÍNH `TaskService.create` (title/cột/người làm/hạn/`clientTaskId` + hạt giống mô tả & `sourceMessageRef`), ánh xạ kết quả.
 */
import { ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { Board } from "../entities/board.interface";
import { TaskCreationPortImpl } from "../services/task-creation.port.impl";

const actor: AuthUser = { id: "a1".repeat(12), email: "a@e.com", name: "A", role: "user", permissions: [] };
const board = (over: Partial<Board> = {}): Board => ({ id: "b1".repeat(12), workspaceId: "c1".repeat(12), archivedAt: null, ...over }) as Board;

describe("assertCanCreate", () => {
  it("kiểm action `workspace.task.create` trên đúng bảng và trả workspaceId", async () => {
    const access = { board: jest.fn().mockResolvedValue({ board: board(), access: {} }) };
    const port = new TaskCreationPortImpl(access, { create: jest.fn() });
    await expect(port.assertCanCreate(actor, "b1".repeat(12))).resolves.toEqual({ workspaceId: "c1".repeat(12) });
    expect(access.board).toHaveBeenCalledWith(actor, "b1".repeat(12), "workspace.task.create");
  });

  it("không có quyền/không thấy bảng → lỗi của ProjectAccess được ném nguyên; bảng đã lưu trữ → 403 PERM_001", async () => {
    const denied = new TaskCreationPortImpl({ board: jest.fn().mockRejectedValue(new ScopeNotFoundError()) }, { create: jest.fn() });
    await expect(denied.assertCanCreate(actor, "x")).rejects.toBeInstanceOf(ScopeNotFoundError);
    const archived = new TaskCreationPortImpl({ board: jest.fn().mockResolvedValue({ board: board({ archivedAt: new Date() }), access: {} }) }, { create: jest.fn() });
    await expect(archived.assertCanCreate(actor, "x")).rejects.toMatchObject({ statusCode: 403, errorCode: "PERM_001" });
  });
});

describe("createFromMessage", () => {
  it("gọi TaskService.create(actor, boardId, dto, seed): dto có title/cột/người làm/hạn/clientTaskId, seed có mô tả + sourceMessageRef; trả { task, created }", async () => {
    const create = jest.fn().mockResolvedValue({ task: { id: "t1".repeat(12), boardId: "b1".repeat(12), title: "Nộp đồ án", columnId: "c_x" }, created: true });
    const port = new TaskCreationPortImpl({ board: jest.fn() }, { create });
    const dueDate = new Date("2026-10-05T00:00:00Z");
    const sourceMessageRef = { scopeType: "CHANNEL" as const, scopeId: "d1".repeat(12), messageId: "e1".repeat(12), workspaceId: "c1".repeat(12) };

    const result = await port.createFromMessage({
      actor,
      boardId: "b1".repeat(12),
      columnId: "c_todo",
      title: "Nộp đồ án",
      assigneeIds: ["f1".repeat(12)],
      dueDate,
      description: "> trích\n\nhttps://app/x",
      sourceMessageRef,
      clientTaskId: "msg-abc-123",
    });

    expect(create).toHaveBeenCalledWith(
      actor,
      "b1".repeat(12),
      { title: "Nộp đồ án", columnId: "c_todo", assigneeIds: ["f1".repeat(12)], labelIds: [], dueDate, clientTaskId: "msg-abc-123" },
      { description: "> trích\n\nhttps://app/x", sourceMessageRef }
    );
    expect(result).toEqual({ task: { id: "t1".repeat(12), boardId: "b1".repeat(12), title: "Nộp đồ án" }, created: true });
  });

  it("không truyền columnId/dueDate thì không đưa vào dto (cột mặc định của bảng); created=false khi clientTaskId đã tạo thẻ", async () => {
    const create = jest.fn().mockResolvedValue({ task: { id: "t2".repeat(12), boardId: "b1".repeat(12), title: "T" }, created: false });
    const port = new TaskCreationPortImpl({ board: jest.fn() }, { create });
    const r = await port.createFromMessage({
      actor,
      boardId: "b1".repeat(12),
      title: "T",
      assigneeIds: [],
      description: null,
      sourceMessageRef: { scopeType: "CONVERSATION", scopeId: "d1".repeat(12), messageId: "e1".repeat(12), workspaceId: null },
      clientTaskId: "msg-abc-124",
    });
    expect(create.mock.calls[0]?.[2]).toEqual({ title: "T", assigneeIds: [], labelIds: [], clientTaskId: "msg-abc-124" });
    expect(r.created).toBe(false);
  });
});
