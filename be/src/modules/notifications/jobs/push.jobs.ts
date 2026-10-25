import { registerJob, defineCron } from "../../../infrastructure/queue";
import { redis } from "../../../infrastructure/redis";
import { logger } from "../../../infrastructure/logger";
import { getPushSender, getVoipSender } from "../../../infrastructure/push";
import { permissionService, type ScopeType } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import { createDeviceService } from "../../devices/public";
import { PrismaNotificationRepository } from "../repositories";
import type { RecipientWithNotification } from "../repositories/notification.repository.interface";
import type { NotificationScopeType } from "../entities/notification.interface";
import type { MessagePushJobData } from "../entities/message-notification.types";
import { pendingKeys } from "../services/push-dispatch.service";
import { getNotificationType } from "../services/notification-types";
import { buildPushPayload, buildVoipPayload, callPreviewLevelOf } from "../services/push-payload.builder";

const repo = new PrismaNotificationRepository();
const devices = createDeviceService();

/**
 * Số trên icon app (iOS `aps.badge`) — CÙNG nguồn với push tin nhắn: hội thoại chưa đọc (không tắt tiếng) + mục Hoạt động chưa đọc
 * (`UnreadService.summary().badgeTotal`, p1-07 README §2). Trước đây loại `notify()` chỉ đếm hộp thư nên số nhảy qua lại giữa các push.
 * Import lười (giữ nhẹ khi job này được nạp chỉ để xử lý `push.cancel-scope`); lỗi → rơi về đếm hộp thư như cũ.
 */
async function appBadge(userId: string): Promise<number> {
  try {
    const { createUnreadService } = await import("../../read-state/public");
    return (await createUnreadService().summary(userId, { fresh: true })).badgeTotal;
  } catch {
    return (await repo.unreadCount(userId)).total;
  }
}

/** Lọc lại quyền LẦN 2 (be.md §5.5 bước 2 — cửa sổ 10s gộp burst có thể đã bị thu hồi quyền). */
async function stillAllowed(row: RecipientWithNotification): Promise<boolean> {
  const def = getNotificationType(row.notification.type);
  if (!def?.readAction || row.notification.scopeType === "NONE" || !row.notification.scopeId) return true;
  const stubUser: AuthUser = { id: row.recipient.recipientId, email: "" };
  return permissionService.can(stubUser, def.readAction, {
    type: row.notification.scopeType as ScopeType,
    id: row.notification.scopeId,
  });
}

/**
 * `push.send` (queue `push`) — be.md §5.5. `job.data.batchKey` (gộp burst,
 * `LRANGE+DEL` nguyên tử) HOẶC `job.data.recipientRowIds` (đơn/VoIP nhánh
 * Android). Non-fatal: lỗi gửi không throw, chỉ đánh dấu `FAILED`.
 */
registerJob("push", "push.send", async (job) => {
  // p1-07 — push TIN NHẮN (`kind:"message"`, do `FanoutService` → `PushDispatchService` xếp) đi nhánh riêng:
  // kiểm lại quyền/chưa đọc/mute/DND/chặn/đang xem → payload theo `lockScreenPreview` + badge. Import lười để job
  // p0-06 (và test của nó) không phải nạp cả pipeline tin nhắn.
  if ((job.data as { kind?: string }).kind === "message") {
    const { getMessagePushService } = await import("../services/notification-wiring");
    await getMessagePushService().sendMessage(job.data as MessagePushJobData);
    return;
  }

  const data = job.data as { batchKey?: string; recipientRowIds?: string[] };
  const ids = data.batchKey ? await redis.popAll(data.batchKey) : (data.recipientRowIds ?? []);
  if (ids.length === 0) return;

  const rows = await repo.findRecipientsByIds(ids);
  const unread = rows.filter((r) => !r.recipient.readAt && r.recipient.pushStatus === "PENDING");
  if (unread.length === 0) return;

  const eligible: RecipientWithNotification[] = [];
  for (const row of unread) {
    if (await stillAllowed(row)) {
      eligible.push(row);
    } else {
      await repo.updateRecipientDelivery(row.recipient.id, { pushStatus: "SKIPPED", skipReason: "REVOKED" });
    }
  }
  if (eligible.length === 0) return;

  const first = eligible[0];
  const userId = first.recipient.recipientId;
  const accountPref = await repo.getPreference(userId, "ACCOUNT", "account");
  const [badge, tokens] = await Promise.all([appBadge(userId), devices.getActiveFcmTokens(userId)]);

  if (tokens.length === 0) {
    for (const row of eligible) {
      await repo.updateRecipientDelivery(row.recipient.id, { pushStatus: "SKIPPED", skipReason: "NO_DEVICE" });
    }
    return;
  }

  const payload = buildPushPayload({
    type: first.notification.type,
    targetUserId: userId,
    notificationId: first.notification.id,
    scopeType: first.notification.scopeType === "NONE" ? undefined : first.notification.scopeType,
    scopeId: first.notification.scopeId ?? undefined,
    workspaceId: first.notification.workspaceId ?? undefined,
    refs: first.notification.refs ?? {},
    lockScreenPreview: accountPref?.lockScreenPreview ?? false,
    // p2-02 §5.3: chỉ tác động loại `call.*` (HIDDEN không lộ tên người gọi); chưa chọn mức nào ⇒ FULL (mặc định của cuộc gọi).
    callPreview: callPreviewLevelOf(accountPref?.lockScreenLevel),
    batchCount: eligible.length > 1 ? eligible.length : undefined,
    badge,
  });

  const result = await getPushSender().sendMulticast(tokens, payload);
  if (result.invalidTokens.length > 0) {
    await devices.revokeTokens(result.invalidTokens, "FCM_UNREGISTERED");
  }

  const status = result.successCount > 0 ? "SENT" : "FAILED";
  const deliveredPushAt = new Date();
  for (const row of eligible) {
    await repo.updateRecipientDelivery(row.recipient.id, { pushStatus: status, deliveredPushAt });
  }
});

/**
 * `push.voip` (queue `push`) — be.md §5.6, chỉ `call.incoming`. Không gộp,
 * bypass DND. 410/400 BadDeviceToken → revoke; 403 InvalidProviderToken tự
 * retry trong sender; 429/5xx → để BullMQ retry job (`shouldRevoke:false,
 * retriable:true` propagate ra ngoài bằng throw).
 */
registerJob("push", "push.voip", async (job) => {
  const { recipientRowId } = job.data as { recipientRowId: string };
  const rows = await repo.findRecipientsByIds([recipientRowId]);
  const row = rows[0];
  if (!row || row.recipient.readAt || row.recipient.pushStatus === "SENT" || row.recipient.pushStatus === "SKIPPED") return;

  const userId = row.recipient.recipientId;
  const callId = String(row.notification.refs?.["callId"] ?? "");
  // p2-02 §5.1: KHÔNG gửi VoIP khi đã quá hạn đổ chuông (job trễ/retry) — iOS bắt buộc báo CallKit cho MỌI VoIP push nên một lượt trễ = "chuông ma" cho cuộc gọi đã hết.
  const expiresMs = Date.parse(String(row.notification.refs?.["expiresAt"] ?? ""));
  if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
    logger.info("[push.voip] Cuộc gọi đã quá hạn đổ chuông — bỏ lượt gửi VoIP", { userId, callId });
    return;
  }
  const voipTokens = await devices.getActiveVoipTokens(userId);
  if (voipTokens.length === 0) {
    logger.info("[push.voip] Không có APNs VoIP token — chỉ còn nhánh FCM Android", { userId, callId });
    return;
  }

  const sender = getVoipSender();
  const accountPref = await repo.getPreference(userId, "ACCOUNT", "account");
  const payload = buildVoipPayload({
    callPreview: callPreviewLevelOf(accountPref?.lockScreenLevel),
    targetUserId: userId,
    callId,
    refs: row.notification.refs ?? {},
    scopeType: row.notification.scopeType === "NONE" ? undefined : row.notification.scopeType,
    scopeId: row.notification.scopeId ?? undefined,
    workspaceId: row.notification.workspaceId ?? undefined,
  });

  for (const t of voipTokens) {
    const bundleId = t.bundleId ?? "com.mancode.vungnui";
    const result = await sender.send(t.token, t.environment, bundleId, payload);
    if (result.shouldRevoke) {
      await devices.revokeTokens([t.token], "APNS_UNREGISTERED");
    } else if (result.retriable) {
      throw new Error(`[push.voip] APNs trả ${result.status} (${result.reason ?? "?"}) — retry job`);
    }
  }
});

/**
 * `push.cancel-scope` (queue `push`) — be.md §5.7, kích hoạt bởi thu hồi
 * quyền theo scope (p0-02 `revokeScope`, payload thật `{userIds, scopeType,
 * scopeId, version}` — KHÔNG phải `recipientRowIds` như bản nháp be.md §5.7
 * gợi ý; sửa lúc viết integration test p1-02 gọi thật `revokeScope()`, trước
 * đó chỉ test với port giả nên chưa lộ ra `job.data` sai hình dạng). Đánh dấu
 * mọi recipient PENDING thuộc scope + user liên quan là SKIPPED REVOKED;
 * `push.send` sau đó tự lọc qua `stillAllowed()` nên đây chỉ là dọn sớm,
 * không bắt buộc để đúng.
 */
registerJob("push", "push.cancel-scope", async (job) => {
  const { userIds, scopeType, scopeId } = job.data as {
    userIds: string[];
    scopeType: NotificationScopeType;
    scopeId: string;
  };
  if (userIds.length === 0) return;
  await repo.cancelPendingByScope(userIds, scopeType, scopeId);
  // p1-07 §5.7 — mục hộp thư CHƯA đọc của scope bị thu hồi biến mất (NT-05: không lộ ngữ cảnh) + xoá cửa sổ gộp/đếm
  // chờ của luồng gốc (khoá chính xác, không SCAN); job `push.send*` đã xếp hàng tự bỏ ở bước kiểm lại quyền.
  await repo.cancelUnreadByScope(userIds, scopeType, scopeId, new Date());
  const scopeKey = `${scopeType}:${scopeId}`;
  await Promise.all(
    userIds.flatMap((userId) => {
      const keys = pendingKeys(userId, scopeKey);
      return [redis.del(keys.window), redis.del(keys.count), redis.del(keys.last)];
    })
  );
});

/**
 * `push.token-cleanup` (cron 04:00 — be.md §5.7/§9). Xoá cứng token revoked
 * quá `revokedTokenPurgeDays`; revoke (không xoá) token còn hoạt động nhưng
 * `lastSeenAt` quá `tokenStaleDays`.
 */
registerJob("push", "push.token-cleanup", async () => {
  const now = Date.now();
  const purged = await devices.purgeRevokedBefore(new Date(now - LIMITS.notification.revokedTokenPurgeDays * 86_400_000));
  const staled = await devices.revokeStaleBefore(new Date(now - LIMITS.notification.tokenStaleDays * 86_400_000));
  logger.info("[push.token-cleanup] Hoàn tất", { purged, staled });
});

defineCron({
  schedulerId: "push.token-cleanup",
  queue: "push",
  jobName: "push.token-cleanup",
  pattern: "0 4 * * *",
});
