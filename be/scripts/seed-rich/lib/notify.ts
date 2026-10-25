import type { Prisma } from "@prisma/client";
import { Directory, prisma } from "./core";
import type { SeededChannel } from "./chat";
import type { SeededConversation } from "./conversations";
import type { SeededTask } from "./boards";
import type { SeededExpense } from "./wallet";
import type { PostedMessage } from "./messages";
import type { WorkspaceCtx } from "./workspace";

export interface NotifyInput {
  dir: Directory;
  now: Date;
  workspaces: readonly WorkspaceCtx[];
  channels: ReadonlyMap<string, SeededChannel[]>;
  tasks: ReadonlyMap<string, SeededTask[]>;
  expenses: ReadonlyMap<string, SeededExpense[]>;
  conversations: readonly SeededConversation[];
}

type Scope = "WORKSPACE" | "CHANNEL" | "CONVERSATION";

interface Draft {
  type: string;
  scopeType: Scope;
  scopeId: string;
  workspaceId: string | null;
  actorId: string;
  sourceType: string;
  sourceId: string;
  refs: Prisma.InputJsonObject;
  dedupeKey: string;
  recipientDedupeKey: string;
  kind: string;
  kindRank: number;
  filterBucket: "mentions" | "following" | "all";
  streamKey: string | null;
  streamSeq: number | null;
  createdAt: Date;
  unread: boolean;
}

/** Hộp thư của `thu`: nhắc tên, giao việc, bình luận thẻ, được thêm vào nhóm, chia tiền, trả lời luồng — suy ra từ chính dữ liệu vừa seed. */
export async function seedThuNotifications(input: NotifyInput): Promise<number> {
  const { dir, now } = input;
  const thuId = dir.id("thu");
  const drafts: Draft[] = [];
  const recent = (at: Date, hours: number) => now.getTime() - at.getTime() < hours * 3_600_000;
  const unreadIdsOf = (posted: readonly PostedMessage[], n: number) => new Set(posted.filter((p) => p.by !== "thu").sort((a, b) => b.seq - a.seq).slice(0, n).map((p) => p.id));

  for (const ws of input.workspaces) {
    if (!ws.roles.has("thu")) continue;
    const wsName = ws.spec.name;

    // Được thêm vào nhóm (chỉ với nhóm mới tạo ở lần seed này và thu không phải chủ).
    if (ws.isNew && ws.spec.owner !== "thu") {
      const m = await prisma.workspaceMembership.findUnique({ where: { workspaceId_userId: { workspaceId: ws.id, userId: thuId } } });
      if (m) {
        const ts = m.joinedAt.getTime();
        drafts.push({
          type: "workspace.member-added", scopeType: "WORKSPACE", scopeId: ws.id, workspaceId: ws.id, actorId: ws.ownerId,
          sourceType: "WorkspaceMembership", sourceId: `member-added:${ws.id}:${thuId}:${ts}`, refs: { workspaceId: ws.id, workspaceName: wsName },
          dedupeKey: `workspace.member-added:${ws.id}:${thuId}:${ts}`, recipientDedupeKey: `member-added:${ws.id}:${thuId}:${ts}`,
          kind: "DEFAULT", kindRank: 0, filterBucket: "all", streamKey: null, streamSeq: null, createdAt: m.joinedAt, unread: recent(m.joinedAt, 24 * 6),
        });
      }
    }

    // Nhắc tên trong kênh.
    for (const sc of input.channels.get(ws.spec.key) ?? []) {
      const unreadIds = unreadIdsOf(sc.posted, sc.channel.spec.unreadForThu ?? 0);
      for (const p of sc.posted) {
        if (p.by === "thu" || !p.mentionKeys.includes("thu") || !p.fresh) continue;
        drafts.push({
          type: "mention", scopeType: "CHANNEL", scopeId: sc.channel.id, workspaceId: ws.id, actorId: dir.id(p.by),
          sourceType: "MESSAGE", sourceId: p.id, refs: { messageId: p.id, seq: p.seq }, dedupeKey: `msg:${p.id}`, recipientDedupeKey: `msg:${p.id}`,
          kind: "MENTION", kindRank: 100, filterBucket: "mentions", streamKey: "root", streamSeq: p.seq, createdAt: p.createdAt, unread: unreadIds.has(p.id),
        });
      }
    }

    // Trả lời trong luồng của tin do thu viết.
    const threads = await prisma.thread.findMany({ where: { workspaceId: ws.id, parentAuthorId: thuId } });
    for (const th of threads) {
      const first = await prisma.message.findFirst({ where: { scopeType: "CHANNEL", threadKey: th.parentMessageId, seq: 1 } });
      if (!first || first.authorId === thuId || !first.authorId) continue;
      drafts.push({
        type: "thread.reply", scopeType: "CHANNEL", scopeId: th.channelId, workspaceId: ws.id, actorId: first.authorId,
        sourceType: "MESSAGE", sourceId: first.id, refs: { messageId: first.id, threadId: th.parentMessageId, seq: 1 }, dedupeKey: `msg:${first.id}`, recipientDedupeKey: `msg:${first.id}`,
        kind: "FIRST_REPLY", kindRank: 80, filterBucket: "following", streamKey: th.parentMessageId, streamSeq: 1, createdAt: first.createdAt, unread: recent(first.createdAt, 48),
      });
    }

    // Việc được giao + bình luận trên thẻ của thu.
    for (const t of input.tasks.get(ws.spec.key) ?? []) {
      const base = { scopeType: "WORKSPACE" as const, scopeId: ws.id, workspaceId: ws.id, refs: { taskId: t.id, boardId: t.boardId, workspaceId: ws.id, taskTitle: t.title } };
      if (t.assignees.includes("thu") && t.createdBy !== "thu") {
        const sid = `task.assigned_task_${t.id}_create`;
        drafts.push({ ...base, type: "task.assigned", actorId: dir.id(t.createdBy), sourceType: "TASK", sourceId: sid, dedupeKey: `notif.${sid}`, recipientDedupeKey: sid, kind: "DEFAULT", kindRank: 0, filterBucket: "all", streamKey: null, streamSeq: null, createdAt: t.createdAt, unread: recent(t.createdAt, 72) });
      }
      if (t.assignees.includes("thu") || t.createdBy === "thu") {
        for (const c of t.comments) {
          if (c.by === "thu") continue;
          drafts.push({
            ...base, type: "task.comment", actorId: dir.id(c.by), sourceType: "TASK_COMMENT", sourceId: `comment:${c.id}`, refs: { ...base.refs, commentId: c.id },
            dedupeKey: `notif.task.comment-created_comment_${c.id}.comment`, recipientDedupeKey: `comment:${c.id}`,
            kind: "TASK_COMMENT", kindRank: 10, filterBucket: "all", streamKey: null, streamSeq: null, createdAt: c.createdAt, unread: recent(c.createdAt, 72),
          });
        }
      }
    }

    // Khoản chi chia cho thu.
    for (const e of input.expenses.get(ws.spec.key) ?? []) {
      if (e.paidByKey === "thu" || !e.debtorIds.includes(thuId)) continue;
      drafts.push({
        type: "wallet.expense-added", scopeType: "WORKSPACE", scopeId: ws.id, workspaceId: ws.id, actorId: dir.id(e.paidByKey),
        sourceType: "wallet-expense", sourceId: e.id, refs: { workspaceId: ws.id, expenseId: e.id, workspaceName: wsName }, dedupeKey: `wallet.expense-added:${e.id}:v1`, recipientDedupeKey: e.id,
        kind: "DEFAULT", kindRank: 0, filterBucket: "all", streamKey: null, streamSeq: null, createdAt: e.occurredAt, unread: recent(e.occurredAt, 24 * 5),
      });
    }
  }

  // Nhắc tên trong nhóm chat.
  for (const conv of input.conversations) {
    const unreadIds = unreadIdsOf(conv.posted, conv.unreadForThu);
    const row = await prisma.conversation.findUnique({ where: { id: conv.id }, select: { workspaceId: true } });
    for (const p of conv.posted) {
      if (p.by === "thu" || !p.mentionKeys.includes("thu") || !p.fresh) continue;
      drafts.push({
        type: "mention", scopeType: "CONVERSATION", scopeId: conv.id, workspaceId: row?.workspaceId ?? null, actorId: dir.id(p.by),
        sourceType: "MESSAGE", sourceId: p.id, refs: { messageId: p.id, seq: p.seq }, dedupeKey: `msg:${p.id}`, recipientDedupeKey: `msg:${p.id}`,
        kind: "MENTION", kindRank: 100, filterBucket: "mentions", streamKey: "root", streamSeq: p.seq, createdAt: p.createdAt, unread: unreadIds.has(p.id),
      });
    }
  }

  let created = 0;
  for (const d of drafts) {
    if (await prisma.notification.findUnique({ where: { dedupeKey: d.dedupeKey }, select: { id: true } })) continue;
    const recipientAt = new Date(d.createdAt.getTime() + 500);
    await prisma.notification.create({
      data: {
        type: d.type,
        scopeType: d.scopeType,
        scopeId: d.scopeId,
        workspaceId: d.workspaceId,
        actorId: d.actorId,
        sourceType: d.sourceType,
        sourceId: d.sourceId,
        refs: d.refs,
        dedupeKey: d.dedupeKey,
        createdAt: d.createdAt,
        recipients: {
          create: {
            recipientId: thuId,
            kind: d.kind,
            inInbox: true,
            dedupeKey: d.recipientDedupeKey,
            scopeType: d.scopeType,
            scopeId: d.scopeId,
            workspaceId: d.workspaceId,
            readAt: d.unread ? null : new Date(Math.min(d.createdAt.getTime() + 25 * 60_000, now.getTime())),
            seenAt: null,
            // SKIPPED/NO_DEVICE: dữ liệu mẫu không được phát sinh push thật tới thiết bị nào.
            pushStatus: "SKIPPED",
            skipReason: "NO_DEVICE",
            deliveredPushAt: null,
            createdAt: recipientAt,
            kindRank: d.kindRank,
            streamKey: d.streamKey,
            streamSeq: d.streamSeq,
            filterBucket: d.filterBucket,
            cancelledAt: null,
          },
        },
      },
    });
    created += 1;
  }
  return created;
}
