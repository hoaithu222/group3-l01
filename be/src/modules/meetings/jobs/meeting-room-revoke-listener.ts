import { randomUUID } from "crypto";
import { registerRevokeListener } from "../../../core/permission";
import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";

const ENQUEUE_TIMEOUT_MS = 1000;

/**
 * Workspace bị LƯU TRỮ → xếp job `meeting.room-lifecycle` (queue `calls`, bền, retry) để kết thúc mọi cuộc họp đang LIVE của workspace (`WORKSPACE_ARCHIVED`).
 * Tách khỏi `meeting-revoke-listener.ts` (p2-04 — huỷ cuộc SCHEDULED, đổi chủ trì): hai job độc lập, cái nào lỗi cũng không kéo theo cái kia. Người bị loại khỏi
 * workspace đã có đường riêng: `call.revocation` (calls) đá khỏi phòng + `meeting.lifecycle` bỏ họ khỏi danh sách → `attendees-changed(wasLive)`.
 */
export function registerMeetingRoomRevokeListener(): void {
  registerRevokeListener("meetings.room-lifecycle", async (input) => {
    if (input.scope.type !== "WORKSPACE" || input.reason !== "ARCHIVED") return;
    try {
      await Promise.race([
        enqueue("calls", "meeting.room-lifecycle", { workspaceId: input.scope.id }, { jobId: toSafeJobId(`meeting.room-lifecycle:${input.scope.id}:${randomUUID()}`) }),
        new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("enqueue meeting.room-lifecycle quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[meetings] Không xếp được meeting.room-lifecycle", { scope: input.scope, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
