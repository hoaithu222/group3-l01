import { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { MessageScopeType } from "../entities/message-notification.types";
import type {
  ExistingRecipientRow,
  FanoutMessage,
  FanoutScopeMeta,
  IFanoutRepository,
  RecipientUpsertResult,
  UpsertMessageNotificationInput,
  UpsertRecipientsInput,
} from "./fanout.repository.interface";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export class PrismaFanoutRepository implements IFanoutRepository {
  async findMessage(id: string): Promise<FanoutMessage | null> {
    const m = await prisma.message.findUnique({ where: { id } });
    if (!m) return null;
    return {
      id: m.id,
      scopeType: m.scopeType,
      scopeId: m.scopeId,
      workspaceId: m.workspaceId,
      threadId: m.threadId,
      seq: m.seq,
      authorId: m.authorId,
      kind: m.kind,
      systemType: m.systemType,
      content: m.content,
      mentions: m.mentions.map((x) => ({ type: x.type, targetId: x.targetId, label: x.label })),
      attachments: m.attachments.map((a) => ({ kind: a.kind, name: a.name })),
      deletedAt: m.deletedAt,
      createdAt: m.createdAt,
    };
  }

  async loadScopeMeta(scopeType: MessageScopeType, scopeId: string): Promise<FanoutScopeMeta | null> {
    if (scopeType === "CHANNEL") {
      const ch = await prisma.channel.findUnique({
        where: { id: scopeId },
        select: { workspaceId: true, name: true, visibility: true },
      });
      return ch ? { workspaceId: ch.workspaceId, name: ch.name, restricted: ch.visibility === "PRIVATE" } : null;
    }
    const conv = await prisma.conversation.findUnique({
      where: { id: scopeId },
      select: { workspaceId: true, kind: true, title: true, meetingId: true },
    });
    if (!conv) return null;
    return {
      workspaceId: conv.workspaceId,
      conversationKind: conv.kind,
      name: conv.kind === "GROUP" ? conv.title : null,
      restricted: conv.meetingId !== null,
    };
  }

  async loadUserNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    return new Map(rows.map((u) => [u.id, u.name]));
  }

  async upsertMessageNotification(input: UpsertMessageNotificationInput): Promise<string> {
    const data = {
      type: input.type,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      sourceType: "MESSAGE",
      sourceId: input.messageId,
      refs: {
        messageId: input.messageId,
        ...(input.threadId && { threadId: input.threadId }),
        seq: input.seq,
      } as Prisma.InputJsonValue,
      dedupeKey: input.dedupeKey,
    };
    try {
      const created = await prisma.notification.create({ data });
      return created.id;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
      if (!existing) throw err;
      return existing.id;
    }
  }

  async upsertRecipients(input: UpsertRecipientsInput): Promise<RecipientUpsertResult[]> {
    return Promise.all(
      input.rows.map(async (row): Promise<RecipientUpsertResult> => {
        try {
          const created = await prisma.notificationRecipient.create({
            data: {
              notificationId: input.notificationId,
              recipientId: row.userId,
              kind: row.kind,
              kindRank: row.kindRank,
              inInbox: true,
              dedupeKey: input.dedupeKey,
              scopeType: input.scopeType,
              scopeId: input.scopeId,
              workspaceId: input.workspaceId,
              streamKey: input.streamKey,
              streamSeq: input.streamSeq,
              filterBucket: row.filterBucket,
              // Ghi null tường minh: Prisma+Mongo không khớp filter `{field:null}` với field "absent".
              readAt: null,
              seenAt: null,
              skipReason: null,
              deliveredPushAt: null,
              cancelledAt: null,
              pushStatus: "NONE",
            },
          });
          return { userId: row.userId, recipientRowId: created.id, created: true, upgraded: false };
        } catch (err) {
          if (!isUniqueViolation(err)) throw err;
          return this.raiseExisting(input, row);
        }
      })
    );
  }

  /** Bản ghi đã có (job chạy lại / tin sửa thêm mention): nâng `kind` theo ưu tiên, khôi phục nếu từng bị huỷ. */
  private async raiseExisting(
    input: UpsertRecipientsInput,
    row: UpsertRecipientsInput["rows"][number]
  ): Promise<RecipientUpsertResult> {
    const existing = await prisma.notificationRecipient.findUnique({
      where: { recipientId_dedupeKey: { recipientId: row.userId, dedupeKey: input.dedupeKey } },
    });
    if (!existing) return { userId: row.userId, recipientRowId: "", created: false, upgraded: false };

    const revived = !existing.inInbox;
    const higher = (existing.kindRank ?? 0) < row.kindRank;
    if (revived || higher) {
      await prisma.notificationRecipient.updateMany({
        where: { id: existing.id },
        data: {
          ...(higher && { kind: row.kind, kindRank: row.kindRank, filterBucket: row.filterBucket }),
          ...(revived && { inInbox: true, cancelledAt: null, readAt: null }),
        },
      });
    }
    return { userId: row.userId, recipientRowId: existing.id, created: revived, upgraded: higher && !revived };
  }

  async findRecipientRows(dedupeKey: string, userIds: string[]): Promise<ExistingRecipientRow[]> {
    if (userIds.length === 0) return [];
    const rows = await prisma.notificationRecipient.findMany({ where: { dedupeKey, recipientId: { in: userIds } } });
    return rows.map((r) => ({
      id: r.id,
      userId: r.recipientId,
      kind: r.kind,
      kindRank: r.kindRank ?? 0,
      readAt: r.readAt,
      deliveredPushAt: r.deliveredPushAt,
      inInbox: r.inInbox,
    }));
  }

  async listRecipientRows(dedupeKey: string): Promise<ExistingRecipientRow[]> {
    const rows = await prisma.notificationRecipient.findMany({ where: { dedupeKey } });
    return rows.map((r) => ({
      id: r.id,
      userId: r.recipientId,
      kind: r.kind,
      kindRank: r.kindRank ?? 0,
      readAt: r.readAt,
      deliveredPushAt: r.deliveredPushAt,
      inInbox: r.inInbox,
    }));
  }

  async cancelRecipients(ids: string[], at: Date): Promise<void> {
    if (ids.length === 0) return;
    await prisma.notificationRecipient.updateMany({
      where: { id: { in: ids } },
      data: { inInbox: false, cancelledAt: at },
    });
  }

  async setPushOutcome(
    dedupeKey: string,
    userId: string,
    outcome: { status: "SENT" | "SKIPPED" | "FAILED"; skipReason?: string; deliveredPushAt?: Date }
  ): Promise<void> {
    await prisma.notificationRecipient.updateMany({
      where: { recipientId: userId, dedupeKey },
      data: {
        pushStatus: outcome.status,
        ...(outcome.skipReason !== undefined && { skipReason: outcome.skipReason }),
        ...(outcome.deliveredPushAt !== undefined && { deliveredPushAt: outcome.deliveredPushAt }),
      },
    });
  }

  async getLastReadSeq(
    userId: string,
    scopeType: MessageScopeType,
    scopeId: string,
    threadId: string | null
  ): Promise<number> {
    if (scopeType === "CONVERSATION") {
      const m = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: scopeId, userId } },
        select: { lastReadSeq: true },
      });
      return m?.lastReadSeq ?? 0;
    }
    // `threadId` ở đây là `Message.threadId` = id TIN GỐC; `ReadState { THREAD }` khoá theo `Thread.id` → đổi trước khi tra.
    let streamId = scopeId;
    if (threadId) {
      const thread = await prisma.thread.findUnique({ where: { parentMessageId: threadId }, select: { id: true } });
      if (!thread) return 0;
      streamId = thread.id;
    }
    const rs = await prisma.readState.findUnique({
      where: { userId_streamType_streamId: { userId, streamType: threadId ? "THREAD" : "CHANNEL", streamId } },
      select: { lastReadSeq: true },
    });
    return rs?.lastReadSeq ?? 0;
  }

  async countUnreadInStream(
    userId: string,
    scopeType: MessageScopeType,
    scopeId: string,
    threadId: string | null,
    cap: number
  ): Promise<number> {
    if (scopeType === "CONVERSATION") {
      const m = await prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: scopeId, userId } },
        select: { unreadCount: true },
      });
      return m?.unreadCount ?? 0;
    }
    const readSeq = await this.getLastReadSeq(userId, scopeType, scopeId, threadId);
    const rows = await prisma.message.findMany({
      where: {
        scopeType: "CHANNEL",
        scopeId,
        threadKey: threadId ?? "root",
        seq: { gt: readSeq },
        deletedAt: null,
        authorId: { not: userId },
      },
      select: { id: true },
      take: cap,
    });
    return rows.length;
  }
}
