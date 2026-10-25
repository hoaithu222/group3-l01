import { getResolver, registerScopeResolver } from "../../../core/permission";
import type { Action, ResolvedAccess, ScopeRef, ScopeResolver } from "../../../core/permission";
import { ROOM } from "../../../infrastructure/socket/socket.rooms";
import { logger } from "../../../infrastructure/logger";
import type { IBoardRepository } from "../repositories/board.repository.interface";

/** Action thuộc phạm vi bảng/thẻ — `myPermissions` của BOARD chỉ lộ tập này (không kéo cả action workspace). */
export const BOARD_SCOPE_ACTIONS: readonly Action[] = [
  "workspace.board.read",
  "workspace.board.edit",
  "workspace.task.create",
  "workspace.task.update",
  "workspace.task.status",
  "workspace.task.delete",
  "workspace.task.comment",
];

const READ_ONLY_BOARD_ACTIONS: readonly Action[] = ["workspace.board.read"];

const INVISIBLE: ResolvedAccess = { visible: false, role: null, actions: new Set() };

/** Đánh dấu resolver WORKSPACE đã được bọc `children()` để gọi lại `registerBoardScopeResolver` không bọc chồng. */
const wrapped = new WeakSet<ScopeResolver>();

/**
 * Resolver scope `BOARD` (p3-02): uỷ quyền cho WORKSPACE cha bằng `ctx.resolve` và TRẢ LẠI `role` của cha — nhờ đó
 * `permissionService.assert` biến "GUEST + action ẩn" thành 404 (PM2-14). Bảng đã lưu trữ chỉ còn `board.read`.
 * Thẻ/nhãn/bình luận không có scope riêng — luôn kiểm qua bảng.
 */
export function registerBoardScopeResolver(boards: IBoardRepository): void {
  registerScopeResolver({
    type: "BOARD",
    async resolve(user, boardId, ctx): Promise<ResolvedAccess> {
      const board = await boards.findById(boardId);
      if (!board) return INVISIBLE;
      const parent: ScopeRef = { type: "WORKSPACE", id: board.workspaceId };
      const ws = await ctx.resolve(user, parent);
      if (!ws.visible) return INVISIBLE;

      const allowed = board.archivedAt ? READ_ONLY_BOARD_ACTIONS : BOARD_SCOPE_ACTIONS;
      const actions = new Set<Action>(allowed.filter((a) => ws.actions.has(a)));
      return { visible: true, role: ws.role, actions, parent, versionDeps: [parent] };
    },
    roomsFor: (boardId) => [ROOM.board(boardId)],
  });

  extendWorkspaceChildren(boards);
}

/**
 * `revokeScope({scope: WORKSPACE})` chỉ lan xuống scope con khi resolver WORKSPACE có `children()`. Resolver đó do
 * module `workspaces` sở hữu (không import chéo) ⇒ bọc lại qua registry của `core/permission`: giữ nguyên hành vi
 * cũ, thêm các BOARD của workspace vào danh sách con để version bump + đá socket khỏi `board:*` (không lộ thẻ realtime
 * cho người vừa bị xoá/đổi vai). Phải gọi SAU khi `workspaces` đã đăng ký resolver của nó (`router.ts` đảm bảo).
 */
function extendWorkspaceChildren(boards: IBoardRepository): void {
  const base = getResolver("WORKSPACE");
  if (!base) {
    logger.warn("[projects] Chưa có resolver WORKSPACE — revokeScope sẽ không lan xuống room board:*");
    return;
  }
  if (wrapped.has(base)) return;

  const extended: ScopeResolver = {
    ...base,
    async children(workspaceId: string): Promise<ScopeRef[]> {
      const own = base.children ? await base.children(workspaceId) : [];
      const ids = await boards.listIdsByWorkspace(workspaceId);
      return [...own, ...ids.map((id): ScopeRef => ({ type: "BOARD", id }))];
    },
  };
  wrapped.add(extended);
  registerScopeResolver(extended);
}
