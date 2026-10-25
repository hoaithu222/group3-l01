/**
 * Barrel CÔNG KHAI của module `read-state` (p1-07) — ngoại lệ có chủ đích của luật "modules KHÔNG
 * import chéo module" (`.claude/rules/architecture.md`), cùng cơ chế `@modules/messages/public`.
 *
 * - `createUnreadService()` — `notifications` (push `badge` = `summary(u).badgeTotal`) dùng qua đây,
 *   KHÔNG tự đếm `ConversationMember.unreadCount`/`NotificationRecipient` ở module khác.
 * - `notifyUnreadSummaryChanged()` — p1-03/p1-05 gọi sau khi đổi `notifyMode`/`mutedUntil` để client
 *   refetch `GET /me/unread/summary` (`reason: "MUTE"`), debounce 2 s/user.
 */
import { PrismaUnreadRepository } from "./repositories/unread.repository.prisma";
import { UnreadService } from "./services/unread.service";
import { UnreadCache } from "./services/unread-cache";

export { notifyUnreadSummaryChanged, invalidateUnreadSummary, type UnreadSummaryChangedReason } from "./services/unread-cache";
export type { UnreadSummary, WorkspaceUnread } from "./entities/read-state.interface";
export { UnreadService };

export function createUnreadService(): UnreadService {
  return new UnreadService(new PrismaUnreadRepository(), new UnreadCache());
}
