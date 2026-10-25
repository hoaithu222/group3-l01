import { randomUUID } from "crypto";
import { registerRevokeListener } from "../../../core/permission";
import { logger } from "../../../infrastructure/logger";
import { enqueue, toSafeJobId } from "../../../infrastructure/queue";
import { REVIEW_MEMBERSHIP_JOB, REVIEW_MEMBERSHIP_QUEUE, type ReviewMembershipJob } from "../services/review/review-events";

const ENQUEUE_TIMEOUT_MS = 1000;

/**
 * Nối chấm chéo vào MỌI đường thu hồi quyền của workspace (`revokeScope`: rời/bị loại/bị chặn/khách hết hạn/đổi vai trò) — xếp job bền
 * `reports/review.membership` để giao lại các lượt chấm PENDING của người không còn đủ điều kiện, thay vì xử lý trong request. Mất job (Redis
 * chập chờn) không mất dữ liệu: cron `review.reconcile` quét bù. Đăng ký ở CẢ API lẫn worker (`revokeScope` chạy ở cả hai) — idempotent theo tên.
 */
export function registerReviewRevokeListener(): void {
  registerRevokeListener("projects.review-membership", async (input) => {
    if (input.scope.type !== "WORKSPACE" || input.userIds.length === 0) return;
    const data: ReviewMembershipJob = { workspaceId: input.scope.id, userIds: input.userIds };
    try {
      await Promise.race([
        enqueue(REVIEW_MEMBERSHIP_QUEUE, REVIEW_MEMBERSHIP_JOB, data, { jobId: toSafeJobId(`review.membership:${input.scope.id}:${randomUUID()}`) }),
        new Promise<never>((_r, reject) => setTimeout(() => reject(new Error("enqueue review.membership quá hạn")), ENQUEUE_TIMEOUT_MS).unref()),
      ]);
    } catch (err) {
      logger.warn("[review] Không xếp được review.membership (cron review.reconcile sẽ quét bù)", { scope: input.scope, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
