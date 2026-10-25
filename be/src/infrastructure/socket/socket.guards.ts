/**
 * @file socket.guards.ts
 * @description Đăng ký `registerRoomGuard` cho 5 loại scope (be.md p0-02 §6)
 * dùng chung `PermissionService` — cùng nguồn sự thật với HTTP `require*`,
 * không tự kiểm quyền riêng cho socket.
 *
 * Gọi TƯỜNG MINH (`registerPermissionGuards()`), KHÔNG side-effect-import như
 * `*.jobs.ts` (`register-jobs.ts`): guard cần đăng ký trước khi client đầu
 * tiên gửi `room:join`, tức là trước/trong lúc `initSocketServer()` chạy —
 * đây là thời điểm gắn với vòng đời Socket.IO, không phải vòng đời Worker
 * (nơi thứ tự "đăng ký rồi mới start" mới cần side-effect qua barrel riêng).
 * Gọi tại `socket.server.ts` ngay sau guard "user" có sẵn.
 */
import type { SocketData } from "./socket.server";
import { registerRoomGuard, type GuardResult } from "./socket.rooms";
import { permissionService, type ScopeType, type Action } from "../../core/permission";
import { roleHasPermission, type PermissionKey } from "../../core/constants/permissions";

const GUARD_ACTION_BY_KIND: Record<string, { type: ScopeType; action: Action }> = {
  ws: { type: "WORKSPACE", action: "workspace.read" },
  ch: { type: "CHANNEL", action: "channel.read" },
  conv: { type: "CONVERSATION", action: "conversation.read" },
  call: { type: "CALL", action: "call.join" },
  meet: { type: "MEETING", action: "meeting.read" },
};

/**
 * Room `admin:{topic}` — chủ đề → quyền admin tối thiểu để join (theo `ROLE_PERMISSIONS`, cùng nguồn với
 * `requirePermission` ở HTTP). Chủ đề CHƯA khai ở đây = từ chối (mặc định đóng). p1-08: `admin:moderation`
 * ← `moderation:view` (nhận `moderation:report-created/updated`, payload không chứa nội dung).
 */
const ADMIN_TOPIC_PERMISSION: Readonly<Record<string, PermissionKey>> = {
  moderation: "moderation:view",
  // p2-07: `admin:media` ← `meeting:view` (nhận `admin:media-updated { kind, id, status }` — chỉ để invalidate bảng, không nội dung).
  media: "meeting:view",
  // p0-03: `admin:ops` ← `dashboard:view` (nhận `ops:stats { socketConnections, onlineUsers }` — chỉ số đếm vận hành).
  ops: "dashboard:view",
};

function toAuthUser(user: SocketData["user"]) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, permissions: [] };
}

/**
 * `PermissionService.resolve()` ném lỗi khi chưa có resolver đăng ký cho
 * scope đó (be.md §5.1 bước 1 — lỗi lập trình, Phase 0 CHƯA module nào đăng
 * ký resolver thật). Với guard socket, "chưa biết" phải fail-closed giống
 * "không thấy" — bắt lỗi ở đây thay vì để nó văng ra ngoài làm crash handler
 * `room:join` (be.md §6: "Phase 0 chưa có resolver thật → join luôn bị từ
 * chối PERM_404, đúng mặc định đóng").
 */
export function registerPermissionGuards(): void {
  registerRoomGuard("admin", (user, topic): Promise<GuardResult> => {
    const required = ADMIN_TOPIC_PERMISSION[topic];
    if (!required) return Promise.resolve({ joinable: false, code: "PERM_404" });
    return Promise.resolve(roleHasPermission(user.role, required) ? { joinable: true } : { joinable: false, code: "PERM_001" });
  });

  for (const [kind, { type, action }] of Object.entries(GUARD_ACTION_BY_KIND)) {
    registerRoomGuard(kind, async (user, id): Promise<GuardResult> => {
      try {
        const access = await permissionService.resolve(toAuthUser(user), { type, id });
        if (!access.visible) return { joinable: false, code: "PERM_404" };
        // p3-04 §5.6 — KHÁCH không vào `ws:{id}` (không nhận sự kiện workspace chung); họ nhận `channel:*` qua `user:{id}` + `ch:`.
        if (kind === "ws" && access.role === "GUEST") return { joinable: false, code: "PERM_404" };
        if (!access.actions.has(action)) return { joinable: false, code: "PERM_001" };
        return { joinable: true };
      } catch {
        return { joinable: false, code: "PERM_404" };
      }
    });
  }
}
