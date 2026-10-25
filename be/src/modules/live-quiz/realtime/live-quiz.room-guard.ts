import { registerRoomGuard, type GuardResult } from "../../../infrastructure/socket/socket.rooms";
import type { SocketData } from "../../../infrastructure/socket/socket.server";
import type { LiveQuizService } from "../services/live-quiz.service";

/**
 * Guard `room:join { kind: "quiz", id }` (p5-01 be.md §6): chỉ host hoặc người đã `POST /live-quiz/join`.
 * Người ngoài/phiên hết hạn → `PERM_404` (không lộ phiên tồn tại); Redis lỗi → fail-closed `PERM_404`.
 */
export function registerLiveQuizRoomGuard(service: Pick<LiveQuizService, "isParticipant" | "hostReturned">): void {
  registerRoomGuard("quiz", async (user: SocketData["user"], id: string): Promise<GuardResult> => {
    try {
      if (!(await service.isParticipant(user.id, id))) return { joinable: false, code: "PERM_404" };
      // Host vào lại (thiết bị bất kỳ) → xoá dấu rời + huỷ `quiz.host-timeout` đang chờ; lỗi không chặn join (job tự kiểm lại mốc).
      await service.hostReturned(user.id, id).catch(() => undefined);
      return { joinable: true };
    } catch {
      return { joinable: false, code: "PERM_404" };
    }
  });
}
