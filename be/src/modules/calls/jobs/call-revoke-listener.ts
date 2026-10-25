import { randomUUID } from "crypto";
import { registerRevokeListener } from "../../../core/permission";
import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";

const ENQUEUE_TIMEOUT_MS = 1000;
const SCOPES = new Set(["CONVERSATION", "CHANNEL", "WORKSPACE", "MEETING"]);

/**
 * Gắn `calls` vào MỌI đường thu hồi quyền/đóng phạm vi (`revokeScope`) — xếp job `call.revocation` (bền, retry) thay vì
 * xử lý trong request thu hồi. Gọi ở CẢ tiến trình API (`registerCallsModule`) lẫn worker (import file job) — idempotent.
 */
export function registerCallRevokeListener(): void {
  registerRevokeListener("calls.revocation", async (input) => {
    if (!SCOPES.has(input.scope.type)) return;
    try {
      await Promise.race([
        enqueue(
          "calls",
          "call.revocation",
          { scopeType: input.scope.type, scopeId: input.scope.id, userIds: input.userIds, reason: input.reason },
          { jobId: toSafeJobId(`call.revoke:${input.scope.type}:${input.scope.id}:${randomUUID()}`) }
        ),
        new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("enqueue call.revocation quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[calls] Không xếp được call.revocation", { scope: input.scope, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
