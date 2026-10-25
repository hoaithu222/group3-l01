import { randomUUID } from "crypto";
import { registerRevokeListener } from "../../../core/permission";
import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";

const ENQUEUE_TIMEOUT_MS = 1000;

/**
 * Nối `meetings` vào mọi đường thu hồi quyền/đóng workspace (`revokeScope`) — xếp job `meeting.lifecycle` (bền, retry) thay vì xử lý
 * trong request. Chỉ scope WORKSPACE liên quan (workspace lưu trữ; thành viên bị loại/rời). Gọi ở CẢ API lẫn worker — idempotent.
 */
export function registerMeetingRevokeListener(): void {
  registerRevokeListener("meetings.lifecycle", async (input) => {
    if (input.scope.type !== "WORKSPACE") return;
    try {
      await Promise.race([
        enqueue(
          "notifications",
          "meeting.lifecycle",
          { scopeType: input.scope.type, scopeId: input.scope.id, userIds: input.userIds, reason: input.reason },
          { jobId: toSafeJobId(`meeting.lifecycle:${input.scope.id}:${randomUUID()}`) }
        ),
        new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("enqueue meeting.lifecycle quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[meetings] Không xếp được meeting.lifecycle", { scope: input.scope, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
