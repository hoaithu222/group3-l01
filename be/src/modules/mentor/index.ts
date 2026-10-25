/**
 * Barrel của module `mentor` (p6-03). `registerMentorModule()` đăng ký các REGISTRY mà cả API lẫn worker cần (idempotent):
 *  - loại thông báo `mentor.*` (`deliver.recipient` ở worker phải thấy);
 *  - đích báo cáo `MENTOR_POST` (`shared/ports/report.port` — `report.events` chạy ở worker gọi `onReportCreated`);
 *  - listener thu hồi quyền `mentor.engagements` (cố vấn bị loại/chặn/rời/hết hạn khách bằng đường KHÁC → đợt kết thúc, idempotent).
 * API gọi ở `router.ts` (sau `mentor.routes`), worker gọi trong `jobs/mentor.jobs.ts` (nạp bởi `register-jobs.ts`).
 */
import { registerRevokeListener, type RevokeInput } from "../../core/permission";
import { logger } from "../../infrastructure/logger";
import { registerReportTargetExtension } from "../../shared/ports/report.port";
import type { MentorEndReason } from "./entities/mentor.interface";
import { getMentorContainer } from "./mentor.container";
import { registerMentorNotificationTypes } from "./services/mentor-notifications";
import { MentorPostReportTarget } from "./services/mentor-report.service";
import { MENTOR_POST_REPORT_TARGET } from "./services/mentor-report.constants";

const END_REASON_BY_REVOKE: Partial<Record<RevokeInput["reason"], MentorEndReason>> = {
  REMOVED: "MEMBERSHIP_REVOKED",
  BANNED: "MEMBERSHIP_REVOKED",
  ANONYMIZED: "MEMBERSHIP_REVOKED",
  LEFT: "LEFT_BY_MENTOR",
  EXPIRED: "EXPIRED",
  ARCHIVED: "WORKSPACE_ARCHIVED",
};

export function registerMentorModule(): void {
  registerMentorNotificationTypes();
  const { deps, engagements } = getMentorContainer();
  registerReportTargetExtension(MENTOR_POST_REPORT_TARGET, new MentorPostReportTarget(deps.posts, deps.access));
  registerRevokeListener("mentor.engagements", async (input) => {
    if (input.scope.type !== "WORKSPACE" || input.userIds.length === 0) return;
    const reason = END_REASON_BY_REVOKE[input.reason];
    if (!reason) return;
    for (const userId of input.userIds) {
      try {
        const active = await deps.engagements.findActiveByWorkspaceAndMentor(input.scope.id, userId);
        if (active) await engagements.endInternal(active.id, reason, null);
      } catch (err) {
        logger.warn("[mentor] Không kết thúc được đợt cố vấn sau thu hồi quyền (cron mentor.expire quét bù khi hết hạn)", {
          workspaceId: input.scope.id,
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });
}
