import { LIMITS } from "../../../core/constants/limits";
import type { IUnreadRepository } from "../repositories/unread.repository.interface";
import type { ConversationUnreadRow, UnreadSummary, WorkspaceUnread } from "../entities/read-state.interface";
import type { UnreadCache } from "./unread-cache";

const WORKSPACES_MAX = 50;

export function isConversationMuted(row: Pick<ConversationUnreadRow, "notifyMode" | "mutedUntil">, now: Date): boolean {
  return row.notifyMode === "MUTED" || (row.mutedUntil !== null && row.mutedUntil.getTime() > now.getTime());
}

/**
 * `UnreadService` (be.md §5.2) — hai tín hiệu tách bạch: chưa đọc theo luồng (chấm/số) và Hoạt động
 * (mục hộp thư). `summary()` nhẹ (đếm theo seq/cột phi chuẩn hoá); `perWorkspace()` tính lười theo
 * workspace đang mở, cache 10 s theo kênh.
 */
export class UnreadService {
  constructor(
    private readonly repo: IUnreadRepository,
    private readonly cache: UnreadCache,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** `fresh` bỏ qua cache — dùng khi tính `badge` lúc gửi push (phải phản ánh tin vừa commit). */
  async summary(userId: string, opts: { fresh?: boolean } = {}): Promise<UnreadSummary> {
    const cacheKey = this.cache.summaryKey(userId);
    if (!opts.fresh) {
      const cached = await this.cache.get<UnreadSummary>(cacheKey);
      if (cached) return cached;
    }

    const now = this.now();
    const [convRows, activeWorkspaces, inbox] = await Promise.all([
      this.repo.conversationRows(userId),
      this.repo.activeWorkspaceIds(userId, WORKSPACES_MAX),
      this.repo.inboxCounts(userId),
    ]);
    const workspaceIds = activeWorkspaces.map((ws) => ws.workspaceId);
    // Nhóm mute CẢ NHÓM (`WorkspaceMembership.notifyMode`) — kênh còn để INHERIT trong nhóm đó thừa hưởng mute
    // này, không phải chỉ kênh tự đặt `MUTED` mới bị loại khỏi `unreadChannels` (app.md p1-07 §1).
    const mutedWorkspaceIds = new Set(
      activeWorkspaces.filter((ws) => ws.notifyMode === "MUTED").map((ws) => ws.workspaceId),
    );

    let unreadConversations = 0;
    let unreadMessages = 0;
    let mentions = 0;
    for (const row of convRows) {
      const unread = row.unreadCount > 0 || row.markedUnread;
      if (unread && !isConversationMuted(row, now)) unreadConversations += 1;
      unreadMessages += row.unreadCount;
      if (row.mentionsSinceRead > 0) mentions += 1;
    }

    const channels = await this.repo.joinedChannels(userId, workspaceIds);
    const readSeqs = await this.repo.readSeqs(
      userId,
      "CHANNEL",
      channels.map((c) => c.channelId)
    );
    const unreadChannelsByWs = new Map<string, number>();
    for (const ch of channels) {
      if (ch.notifyMode === "MUTED") continue;
      if (ch.notifyMode === "INHERIT" && mutedWorkspaceIds.has(ch.workspaceId)) continue;
      if (ch.lastSeq > (readSeqs.get(ch.channelId) ?? 0)) {
        unreadChannelsByWs.set(ch.workspaceId, (unreadChannelsByWs.get(ch.workspaceId) ?? 0) + 1);
      }
    }

    const summary: UnreadSummary = {
      conversations: { unreadConversations, unreadMessages, mentions },
      workspaces: workspaceIds.map((workspaceId) => ({
        workspaceId,
        unreadChannels: unreadChannelsByWs.get(workspaceId) ?? 0,
        mentions: inbox.mentionsByWorkspace.get(workspaceId) ?? 0,
      })),
      activity: { unread: inbox.unread, mentions: inbox.mentions },
      badgeTotal: unreadConversations + inbox.unread,
      computedAt: now.toISOString(),
    };
    await this.cache.set(cacheKey, summary);
    return summary;
  }

  async perWorkspace(userId: string, workspaceId: string): Promise<WorkspaceUnread> {
    const cap = LIMITS.notification.unreadCountCap;
    const [channels, mentionByChannel, subscribed] = await Promise.all([
      this.repo.joinedChannels(userId, [workspaceId]),
      this.repo.channelMentionCounts(userId, workspaceId),
      this.repo.subscribedThreads(userId, workspaceId),
    ]);
    const [channelReadSeqs, threadReadSeqs] = await Promise.all([
      this.repo.readSeqs(userId, "CHANNEL", channels.map((c) => c.channelId)),
      this.repo.readSeqs(userId, "THREAD", subscribed.map((t) => t.threadId)),
    ]);

    const result: WorkspaceUnread = { channels: {}, threads: {} };

    await Promise.all(
      channels.map(async (ch) => {
        const readSeq = channelReadSeqs.get(ch.channelId) ?? 0;
        const mentions = mentionByChannel.get(ch.channelId) ?? 0;
        let unread = 0;
        let capped = false;
        if (ch.lastSeq > readSeq) {
          const key = this.cache.channelKey(userId, ch.channelId);
          const cached = await this.cache.get<{ unread: number; capped: boolean }>(key);
          if (cached) {
            ({ unread, capped } = cached);
          } else {
            unread = await this.repo.countChannelUnread(userId, ch.channelId, readSeq, cap);
            capped = unread >= cap;
            await this.cache.set(key, { unread, capped });
          }
        }
        result.channels[ch.channelId] = { unread, mentions, lastSeq: ch.lastSeq, capped, lastReadSeq: readSeq };
      })
    );

    for (const t of subscribed) {
      // Xấp xỉ theo seq (gồm cả reply của chính mình) — đủ cho chấm chưa đọc; số chính xác không cần ở đây.
      const readSeq = threadReadSeqs.get(t.threadId) ?? 0;
      const unread = Math.max(0, t.lastReplySeq - readSeq);
      if (unread > 0) result.threads[t.threadId] = { unread: Math.min(unread, cap), channelId: t.channelId, lastSeq: t.lastReplySeq, lastReadSeq: readSeq };
    }
    return result;
  }
}
