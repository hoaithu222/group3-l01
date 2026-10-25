import { logger } from "../../../infrastructure/logger";
import { permissionService } from "../../../core/permission";
import type { CallScopeTypeValue } from "../entities/call.interface";
import type { CallDeps } from "./call.deps";
import type { CallEndService } from "./call-end.service";

export interface CallRevocationInput {
  /** Phạm vi bị thu hồi (từ `revokeScope`): hội thoại, kênh, workspace hoặc họp. */
  scopeType: "CONVERSATION" | "CHANNEL" | "WORKSPACE" | "MEETING";
  scopeId: string;
  userIds: string[];
  /** `ARCHIVED`/`DISSOLVED` = phạm vi đóng lại (kết thúc mọi cuộc gọi); còn lại = người dùng mất quyền. */
  reason: string;
}

const CLOSING_REASONS = new Set(["ARCHIVED", "DISSOLVED"]);
/** Đổi vai trò (`ROLE_CHANGED`) KHÔNG làm mất quyền ở lại cuộc gọi — chỉ các lý do mất quyền dưới đây mới đá participant. */
const REMOVAL_REASONS = new Set(["REMOVED", "BANNED", "LEFT", "GRANT_REVOKED", "ANONYMIZED", "EXPIRED"]);

/**
 * Thu hồi quyền/vòng đời phạm vi (be.md §5.11): thành viên mất quyền → participant `REMOVED` + đá khỏi phòng LiveKit
 * (1-1 → `endCall(REVOKED)`, nhóm → `evaluateEnd`); hội thoại/workspace đóng → `endCall(ARCHIVED)`. Nguồn sự kiện là
 * `revokeScope()` (core/permission) qua listener — mọi đường thu hồi quyền đều đi qua đó.
 */
export class CallRevocationService {
  constructor(
    private readonly d: CallDeps,
    private readonly ends: CallEndService
  ) {}

  async handle(input: CallRevocationInput): Promise<{ ended: number; removed: number }> {
    const calls =
      input.scopeType === "WORKSPACE"
        ? await this.d.repo.findOpenByWorkspace(input.scopeId)
        : await this.d.repo.findOpenByScope(input.scopeType as CallScopeTypeValue, [input.scopeId]);
    let ended = 0;
    let removed = 0;
    for (const call of calls) {
      try {
        if (CLOSING_REASONS.has(input.reason)) {
          if (await this.ends.endCall(call.id, "ARCHIVED", null)) ended += 1;
          continue;
        }
        if (!REMOVAL_REASONS.has(input.reason)) continue;
        for (const userId of input.userIds) {
          if (!(await this.ends.removeParticipant(call.id, userId, null))) continue;
          removed += 1;
          // Bump quyền `CALL:<id>` + đá khỏi room `call:{id}` — token/room mới bị từ chối ngay (CL-11).
          await permissionService.revokeScope({ scope: { type: "CALL", id: call.id }, userIds: [userId], reason: "REMOVED", cascade: false });
        }
      } catch (err) {
        logger.error("[calls.revocation] Lỗi xử lý thu hồi", { callId: call.id, error: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    }
    return { ended, removed };
  }
}
