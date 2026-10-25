// Unit-test redis mock mặc định (`setup.ts`) thiếu `incr/expire` mà `permissionService.bumpVersion` (archive) cần.
jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn() },
}));

import { getResolver, permissionService, resetPermissionPorts, setPermissionPorts } from "../../../core/permission";
import type { PermissionPorts } from "../../../core/permission";
import { clearRoomGuards, resolveJoinable } from "../../../infrastructure/socket/socket.rooms";
import { newObjectId } from "../../../core/utils/object-id";
import { registerBoardRoomGuard } from "../realtime/board-room.guard";
import { registerBoardScopeResolver } from "../services/board-access.resolver";
import { ServiceHarness, userOf } from "./support/service-harness";

let h: ServiceHarness;

beforeEach(() => {
  h = new ServiceHarness();
});

describe("resolver scope BOARD — uỷ quyền WORKSPACE, trả lại role của cha", () => {
  it("MEMBER thấy bảng với action bảng/thẻ; vai trò = vai trò ở workspace; parent + versionDeps là WORKSPACE", async () => {
    const owner = h.addUser("OWNER");
    const member = h.addUser("MEMBER");
    const board = await h.createBoard(owner);

    const access = await permissionService.resolve(member, { type: "BOARD", id: board.id });
    expect(access).toMatchObject({ visible: true, role: "MEMBER", parent: { type: "WORKSPACE", id: h.workspaceId } });
    expect([...access.actions].sort()).toEqual(
      ["workspace.board.read", "workspace.task.comment", "workspace.task.create", "workspace.task.status", "workspace.task.update"].sort()
    );
    const ownerAccess = await permissionService.resolve(owner, { type: "BOARD", id: board.id });
    expect(ownerAccess.actions.has("workspace.board.edit")).toBe(true);
    expect(ownerAccess.actions.has("workspace.task.delete")).toBe(true);
  });

  it("người ngoài/bảng không tồn tại → không thấy; GUEST thấy scope nhưng thiếu board.read ⇒ assert 404 (PM2-14)", async () => {
    const owner = h.addUser("OWNER");
    const guest = h.addUser("GUEST");
    const board = await h.createBoard(owner);

    expect((await permissionService.resolve(userOf(newObjectId()), { type: "BOARD", id: board.id })).visible).toBe(false);
    expect((await permissionService.resolve(owner, { type: "BOARD", id: newObjectId() })).visible).toBe(false);

    const guestAccess = await permissionService.resolve(guest, { type: "BOARD", id: board.id });
    expect(guestAccess).toMatchObject({ visible: true, role: "GUEST" });
    await expect(permissionService.assert(guest, "workspace.board.read", { type: "BOARD", id: board.id })).rejects.toMatchObject({
      statusCode: 404,
      errorCode: "PERM_404",
    });
  });

  it("bảng đã lưu trữ hoặc nhóm ARCHIVED → chỉ còn workspace.board.read", async () => {
    const owner = h.addUser("OWNER");
    const board = await h.createBoard(owner);
    await h.boardService.archive(owner, board.id);
    const access = await permissionService.resolve(owner, { type: "BOARD", id: board.id });
    expect([...access.actions]).toEqual(["workspace.board.read"]);

    await h.boardService.restore(owner, board.id);
    h.workspaceStatus = "ARCHIVED";
    const archivedWs = await permissionService.resolve(owner, { type: "BOARD", id: board.id });
    expect([...archivedWs.actions]).toEqual(["workspace.board.read"]);
  });

  it("roomsFor(BOARD) = board:{id}", async () => {
    expect(getResolver("BOARD")?.roomsFor?.("abc")).toEqual(["board:abc"]);
  });
});

describe("revokeScope(WORKSPACE) cascade xuống room board:*", () => {
  const ports = (): PermissionPorts & { leave: jest.Mock } => {
    const leave = jest.fn().mockResolvedValue(undefined);
    return {
      leave,
      realtime: { leaveRooms: leave, emitToUsers: jest.fn().mockResolvedValue(undefined) },
      outbox: { enqueueNow: jest.fn().mockResolvedValue(undefined) },
    };
  };
  afterEach(() => resetPermissionPorts());

  it("children(workspaceId) trả mọi bảng (kể cả lưu trữ) và giữ nguyên children cũ của resolver WORKSPACE", async () => {
    const owner = h.addUser("OWNER");
    const a = await h.createBoard(owner);
    const b = await h.boardService.create(owner, h.workspaceId, { name: "B" });
    await h.boardService.archive(owner, b.id);

    const children = await getResolver("WORKSPACE")!.children!(h.workspaceId);
    expect(children.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    expect(children.every((c) => c.type === "BOARD")).toBe(true);
  });

  it("thu hồi quyền ở WORKSPACE đá user khỏi ws:{id} VÀ mọi board:{id} của nhóm", async () => {
    const owner = h.addUser("OWNER");
    const removed = h.addUser("MEMBER");
    const a = await h.createBoard(owner);
    const b = await h.boardService.create(owner, h.workspaceId, { name: "B" });
    const p = ports();
    setPermissionPorts(p);

    await permissionService.revokeScope({ scope: { type: "WORKSPACE", id: h.workspaceId }, userIds: [removed.id], reason: "REMOVED" });

    const rooms = p.leave.mock.calls[0][1] as string[];
    expect(rooms).toEqual(expect.arrayContaining([`board:${a.id}`, `board:${b.id}`]));
  });

  it("gọi registerBoardScopeResolver nhiều lần không bọc chồng (mỗi bảng chỉ xuất hiện một lần)", async () => {
    const owner = h.addUser("OWNER");
    const board = await h.createBoard(owner);
    registerBoardScopeResolver(h.boards);
    registerBoardScopeResolver(h.boards);
    const children = await getResolver("WORKSPACE")!.children!(h.workspaceId);
    expect(children.filter((c) => c.id === board.id)).toHaveLength(1);
  });
});

describe("guard room `board:` (PM2-14 mức guard)", () => {
  beforeEach(() => {
    clearRoomGuards();
    registerBoardRoomGuard();
  });
  afterAll(() => clearRoomGuards());

  it("thành viên join được (kể cả bảng đã lưu trữ — chỉ đọc); người ngoài/GUEST/id lạ/id sai định dạng bị từ chối PERM_404", async () => {
    const owner = h.addUser("OWNER");
    const member = h.addUser("MEMBER");
    const guest = h.addUser("GUEST");
    const board = await h.createBoard(owner);

    expect(await resolveJoinable(member, "board", board.id)).toEqual({ room: `board:${board.id}` });
    expect(await resolveJoinable(userOf(newObjectId()), "board", board.id)).toEqual({ room: null, code: "PERM_404" });
    expect(await resolveJoinable(guest, "board", board.id)).toEqual({ room: null, code: "PERM_404" });
    expect(await resolveJoinable(member, "board", newObjectId())).toEqual({ room: null, code: "PERM_404" });
    expect(await resolveJoinable(member, "board", "khong-phai-objectid")).toEqual({ room: null, code: "PERM_404" });

    await h.boardService.archive(owner, board.id);
    expect(await resolveJoinable(member, "board", board.id)).toEqual({ room: `board:${board.id}` });
  });

  it("lỗi resolve (DB hỏng) → fail-closed PERM_404, không ném", async () => {
    const owner = h.addUser("OWNER");
    const board = await h.createBoard(owner);
    jest.spyOn(h.boards, "findById").mockRejectedValue(new Error("db down"));
    expect(await resolveJoinable(owner, "board", board.id)).toEqual({ room: null, code: "PERM_404" });
  });
});
