import { prisma, withTransaction } from "../../infrastructure/database";
import { AppError } from "../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../core/utils/error.codes";
import { PHASE3_NOTIFICATION_TYPES, PHASE3_NOTIFICATION_KINDS } from "../../core/constants/notification-types";
import { isGrantRoleRef, workspaceRolesCoveredByAny, type GrantRoleRef } from "../../core/constants/role-coverage";
import { notify, registerNotificationType } from "../notifications/public";
import { getMessageScope } from "../messages/public";
import { getBlockPort } from "../blocks/public";

const CHUNK_SIZE = 500;

/** Loại thông báo `@role` (p3-04): hộp thư "Nhắc tên" + push; kiểm lại quyền đọc kênh lúc giao (kênh không còn đọc được → bỏ). */
export function registerRoleMentionNotificationType(): void {
  registerNotificationType({
    type: PHASE3_NOTIFICATION_TYPES.MENTION_ROLE,
    inbox: true,
    inboxFilter: "mentions",
    pushType: PHASE3_NOTIFICATION_TYPES.MENTION_ROLE,
    androidChannel: "mentions",
    priority: 90,
    respectMute: "ALWAYS",
    bypassDnd: false,
    batchable: true,
    readAction: "channel.read",
    // p1-07: đưa id vào `data` push để app mở ĐÚNG tin (trước đây rơi về bảng FALLBACK: data rỗng, collapse theo kênh
    // nên hai lần nhắc khác nhau trong cùng kênh nuốt nhau); nội dung push vẫn trung tính (bảng lõi `mention.role`).
    push: {
      dataKeys: ["messageId", "channelId"],
      collapseKey: (refs) => `mention.role:${String(refs["messageId"] ?? "-")}`,
    },
  });
}

export interface RoleFanoutDeps {
  /** Người ĐỌC ĐƯỢC kênh (`MessageScope.readerIds` của CHANNEL — grant DIRECT ∪ vai trò với kênh riêng tư). */
  readers(channelId: string): Promise<string[]>;
  /** Bỏ người đã chặn tác giả (`BlockPort.filterNotificationRecipients`). */
  filterBlockers(authorId: string, userIds: string[]): Promise<string[]>;
}

export interface RoleFanoutStats {
  skipped?: "not-found" | "deleted" | "not-channel" | "no-role" | "no-recipients";
  candidates: number;
  notified: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function defaultDeps(): RoleFanoutDeps {
  return {
    async readers(channelId) {
      const scope = getMessageScope("CHANNEL");
      if (!scope) throw new AppError(ErrorMessages[ErrorCode.SYS_500], 500, ErrorCode.SYS_500);
      return scope.readerIds(channelId);
    },
    filterBlockers: (authorId, userIds) => getBlockPort().filterNotificationRecipients(authorId, userIds),
  };
}

/**
 * Fan-out `@role` (p3-04 be.md §5.7) — job `fanout.message-role`, MỘT job/tin. Người nhận =
 * thành viên ACTIVE có vai trò được phủ bởi các vai trò được nhắc (`ADMIN` = OWNER+ADMIN; `MEMBER` = OWNER+ADMIN+MEMBER;
 * không bao giờ GUEST) ∩ người ĐỌC ĐƯỢC kênh ∩ `joinedAt ≤ tin.createdAt` (không gửi cho người vào nhóm sau khi tin được
 * gửi), trừ tác giả, người đã chặn tác giả và người đã được nhắc tên riêng (đã có mục `msg:<id>`).
 *
 * Ghi thông báo bằng `notify()` — `kind MENTION_ROLE` (ưu tiên 90, DƯỚI `MENTION` cá nhân 100) trên CÙNG khoá `msg:<messageId>`
 * mà fan-out tin nhắn p1-07 dùng → mỗi người tối đa MỘT mục hộp thư cho tin này (NT-01), kind cao thắng bất kể job nào chạy trước.
 * Chế độ MUTED/MENTIONS/DND/đang xem do engine giao (`DeliveryPolicy`) quyết định — người DND vẫn có mục hộp thư, không push.
 * Idempotent: người đã có mục cho tin này bị bỏ qua nên chạy lại (retry/sửa tin) không đụng dedupe của outbox `deliver.recipient`.
 */
export class RoleMentionFanoutService {
  constructor(private readonly deps: RoleFanoutDeps = defaultDeps()) {}

  async fanout(messageId: string): Promise<RoleFanoutStats> {
    const stats: RoleFanoutStats = { candidates: 0, notified: 0 };
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return { ...stats, skipped: "not-found" };
    if (message.deletedAt || message.kind !== "USER") return { ...stats, skipped: "deleted" };
    if (message.scopeType !== "CHANNEL") return { ...stats, skipped: "not-channel" };

    const roleRefs = Array.from(
      new Set(message.mentions.flatMap((m) => (m.type === "ROLE" && isGrantRoleRef(m.roleRef) ? [m.roleRef] : [])))
    ) as GrantRoleRef[];
    if (roleRefs.length === 0) return { ...stats, skipped: "no-role" };

    const channel = await prisma.channel.findUnique({ where: { id: message.scopeId }, select: { workspaceId: true } });
    if (!channel) return { ...stats, skipped: "not-found" };
    const workspaceId = message.workspaceId ?? channel.workspaceId;

    const members = await prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        status: "ACTIVE",
        role: { in: workspaceRolesCoveredByAny(roleRefs) },
        joinedAt: { lte: message.createdAt },
      },
      select: { userId: true },
    });
    const readers = new Set(await this.deps.readers(message.scopeId));
    const mentionedIndividually = new Set(message.mentions.flatMap((m) => (m.type === "USER" && m.targetId ? [m.targetId] : [])));
    const candidates = members
      .map((m) => m.userId)
      .filter((id) => id !== message.authorId && readers.has(id) && !mentionedIndividually.has(id));
    stats.candidates = candidates.length;
    if (candidates.length === 0) return { ...stats, skipped: "no-recipients" };

    const dedupeKey = `msg:${message.id}`;
    for (const ids of chunk(candidates, CHUNK_SIZE)) {
      const allowed = message.authorId ? await this.deps.filterBlockers(message.authorId, ids) : ids;
      if (allowed.length === 0) continue;
      const already = await prisma.notificationRecipient.findMany({
        where: { dedupeKey, recipientId: { in: allowed } },
        select: { recipientId: true },
      });
      const done = new Set(already.map((r) => r.recipientId));
      const fresh = allowed.filter((id) => !done.has(id));
      if (fresh.length === 0) continue;

      await withTransaction((tx) =>
        notify(tx, {
          type: PHASE3_NOTIFICATION_TYPES.MENTION_ROLE,
          actorId: message.authorId ?? undefined,
          scope: { type: "CHANNEL", id: message.scopeId },
          workspaceId,
          // `source.id` = khoá dedupe của MỘT mục/người/tin — trùng với fan-out tin nhắn (`msg:<messageId>`) để hợp nhất.
          source: { type: "Message", id: dedupeKey },
          refs: { workspaceId, channelId: message.scopeId, messageId: message.id, seq: message.seq, roleRefs },
          recipients: fresh.map((userId) => ({ userId, kind: PHASE3_NOTIFICATION_KINDS.MENTION_ROLE })),
          dedupeKey: `mention.role:${message.id}`,
          // NT-12: đọc tới tin này (kênh/luồng) thì mục `@role` tự thành đã đọc — cùng luồng với fan-out tin nhắn p1-07.
          stream: { key: message.threadId ?? "root", seq: message.seq },
        })
      );
      stats.notified += fresh.length;
    }
    return stats;
  }
}
