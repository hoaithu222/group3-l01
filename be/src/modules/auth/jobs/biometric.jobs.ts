import { registerJob, defineCron } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { LIMITS } from "../../../core/constants/limits";
import { PrismaBiometricCredentialRepository } from "../repositories";

const repo = new PrismaBiometricCredentialRepository();

/** Một lô nhỏ mỗi lần chạy — job lặp hàng tuần, không cần dọn hết trong 1 tick. */
const EXPIRE_BATCH_SIZE = 500;

/**
 * `auth.biometric-cleanup` (queue `cron`, `0 4 * * 1` Asia/Ho_Chi_Minh — p0-13
 * be.md §7). Idempotent + non-fatal theo đúng quy ước processor của p0-04:
 *
 * 1. ACTIVE đã quá `expiresAt` (chưa từng đăng nhập lại để tự chuyển REVOKED
 *    ở `BiometricService.login`) ⇒ REVOKED `EXPIRED`, qua `updateIfStatus`
 *    (compare-and-set — bỏ qua êm nếu credential vừa bị thu hồi lý do khác
 *    ngay trước khi job chạy tới, không ghi đè `revokeReason` thật).
 * 2. REVOKED (bất kỳ lý do) đã quá hạn lưu trữ ⇒ xoá cứng.
 */
registerJob("cron", "auth.biometric-cleanup", async () => {
  const now = new Date();
  const due = await repo.findExpiredActive(now, EXPIRE_BATCH_SIZE);

  let expiredCount = 0;
  for (const credential of due) {
    const ok = await repo.updateIfStatus(credential.id, "ACTIVE", {
      status: "REVOKED",
      activeKey: `revoked:${credential.id}`,
      revokeReason: "EXPIRED",
      revokedAt: now,
    });
    if (ok) expiredCount += 1;
  }

  const retentionMs = LIMITS.auth.biometric.revokedRetentionDays * 24 * 60 * 60 * 1000;
  const deletedCount = await repo.deleteRevokedOlderThan(new Date(now.getTime() - retentionMs));

  logger.info("[auth.biometric-cleanup] Hoàn tất", {
    scanned: due.length,
    expiredCount,
    deletedCount,
  });
});

defineCron({
  schedulerId: "auth.biometric-cleanup",
  queue: "cron",
  jobName: "auth.biometric-cleanup",
  pattern: "0 4 * * 1",
  opts: { attempts: 1 },
});
