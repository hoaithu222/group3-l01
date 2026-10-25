import { permissionService } from "../../../core/permission";
import { registerRoomGuard, type GuardResult } from "../../../infrastructure/socket/socket.rooms";
import type { SocketData } from "../../../infrastructure/socket/socket.server";

/**
 * Guard `room:join { kind: "board", id }` (p3-02 be.md §6): cần `workspace.board.read` trên scope BOARD.
 * Cùng nguồn sự thật với HTTP (`permissionService`); người ngoài/GUEST → `PERM_404` (không lộ bảng tồn tại),
 * lỗi resolve (DB) → fail-closed `PERM_404`. Mặc định của registry là ĐÓNG, nên phải đăng ký tường minh.
 */
export function registerBoardRoomGuard(): void {
  registerRoomGuard("board", async (user: SocketData["user"], id: string): Promise<GuardResult> => {
    try {
      const access = await permissionService.resolve(user, { type: "BOARD", id });
      if (!access.visible) return { joinable: false, code: "PERM_404" };
      if (!access.actions.has("workspace.board.read")) {
        return { joinable: false, code: access.role === "GUEST" ? "PERM_404" : "PERM_001" };
      }
      return { joinable: true };
    } catch {
      return { joinable: false, code: "PERM_404" };
    }
  });
}
