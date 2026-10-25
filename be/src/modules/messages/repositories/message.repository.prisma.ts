import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type {
  AttachmentKindValue,
  DeleteModeValue,
  Message,
  MessageKindValue,
  MessageMention,
  MessageScopeTypeValue,
  MessageSourceRef,
  MentionTypeValue,
  ReactionSummary,
  SystemMessageTypeValue,
} from "../entities/message.interface";
import { MESSAGE_SOURCE_REFS_MAX } from "../entities/message.interface";
import type {
  IMessageRepository,
  ListBySeqParams,
  MessageCreateInput,
  MessageEditData,
  PrismaOrTx,
} from "./message.repository.interface";

type MessageRecord = NonNullable<Awaited<ReturnType<typeof prisma.message.findUnique>>>;

/**
 * Domain -> Prisma (`MessageMention`): mention `ROLE` (p3-04) có `targetId` = "ADMIN"|"MEMBER" — KHÔNG phải ObjectId nên lưu vào `roleRef`
 * (`targetId` để null); USER/ALL giữ nguyên. Ngược lại xử lý ở `mapMessage`.
 */
function toStoredMentions(mentions: MessageMention[]): Prisma.MessageMentionCreateInput[] {
  return mentions.map((m) =>
    m.type === "ROLE"
      ? { type: m.type, targetId: null, label: m.label, roleRef: m.targetId }
      : { type: m.type, targetId: m.targetId, label: m.label }
  );
}

function mapMessage(r: MessageRecord): Message {
  return {
    id: r.id,
    scopeType: r.scopeType as MessageScopeTypeValue,
    scopeId: r.scopeId,
    workspaceId: r.workspaceId,
    threadId: r.threadId,
    threadKey: r.threadKey,
    seq: r.seq,
    authorId: r.authorId,
    kind: r.kind as MessageKindValue,
    systemType: r.systemType as SystemMessageTypeValue | null,
    systemPayload: (r.systemPayload as Record<string, unknown> | null) ?? null,
    clientMessageId: r.clientMessageId,
    dedupeKey: r.dedupeKey,
    content: r.content,
    normalizedContent: r.normalizedContent,
    mentions: r.mentions.map((m) => ({
      type: m.type as MentionTypeValue,
      // ROLE (p3-04): "ADMIN"|"MEMBER" nằm ở `roleRef` (`targetId` là ObjectId nên để null) — domain/API vẫn thấy `targetId`.
      targetId: m.type === "ROLE" ? (m.roleRef ?? m.targetId) : m.targetId,
      label: m.label,
    })),
    attachments: r.attachments.map((a) => ({
      assetId: a.assetId,
      kind: a.kind as AttachmentKindValue,
      name: a.name,
      mime: a.mime,
      size: a.size,
      width: a.width,
      height: a.height,
      durationMs: a.durationMs,
      waveform: a.waveform,
      thumbnailAssetId: a.thumbnailAssetId,
    })),
    links: r.links.map((l) => ({ url: l.url, host: l.host })),
    linkPreview: r.linkPreview
      ? {
          url: r.linkPreview.url,
          title: r.linkPreview.title,
          description: r.linkPreview.description,
          siteName: r.linkPreview.siteName,
          imageAssetId: r.linkPreview.imageAssetId,
          fetchedAt: r.linkPreview.fetchedAt,
        }
      : null,
    replyToId: r.replyToId,
    replyPreview: r.replyPreview
      ? {
          authorId: r.replyPreview.authorId,
          excerpt: r.replyPreview.excerpt,
          kind: r.replyPreview.kind,
          deleted: r.replyPreview.deleted,
        }
      : null,
    forwardedFrom: r.forwardedFrom
      ? {
          messageId: r.forwardedFrom.messageId,
          scopeType: r.forwardedFrom.scopeType as MessageScopeTypeValue,
          authorId: r.forwardedFrom.authorId,
          createdAt: r.forwardedFrom.createdAt,
        }
      : null,
    reactionsSummary: r.reactionsSummary.map((s) => ({ emoji: s.emoji, count: s.count })),
    // p7-04 — tài liệu cũ chưa có trường: Prisma trả mảng rỗng; `?? []` chỉ phòng khi client Prisma cũ chưa generate.
    sourceRefs: (r.sourceRefs ?? []).map((s) => ({ kind: s.kind as MessageSourceRef["kind"], refId: s.refId, createdBy: s.createdBy, createdAt: s.createdAt })),
    pinnedAt: r.pinnedAt,
    pinnedBy: r.pinnedBy,
    editedAt: r.editedAt,
    version: r.version,
    deletedAt: r.deletedAt,
    deletedBy: r.deletedBy,
    deleteReason: r.deleteReason,
    deleteMode: r.deleteMode as DeleteModeValue | null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function client(c?: PrismaOrTx) {
  return c ?? prisma;
}

export class PrismaMessageRepository implements IMessageRepository {
  async findById(id: string, c?: PrismaOrTx): Promise<Message | null> {
    const r = await client(c).message.findUnique({ where: { id } });
    return r ? mapMessage(r) : null;
  }

  async findByIds(ids: string[], c?: PrismaOrTx): Promise<Message[]> {
    if (ids.length === 0) return [];
    const rs = await client(c).message.findMany({ where: { id: { in: ids } } });
    return rs.map(mapMessage);
  }

  async findByDedupeKey(dedupeKey: string, c?: PrismaOrTx): Promise<Message | null> {
    const r = await client(c).message.findUnique({ where: { dedupeKey } });
    return r ? mapMessage(r) : null;
  }

  async listBySeq(params: ListBySeqParams, c?: PrismaOrTx): Promise<Message[]> {
    const where: Prisma.MessageWhereInput = {
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      threadKey: params.threadKey,
      ...(params.seqAbove !== undefined || params.seqBelow !== undefined
        ? {
            seq: {
              ...(params.seqAbove !== undefined && { gt: params.seqAbove }),
              ...(params.seqBelow !== undefined && { lt: params.seqBelow }),
            },
          }
        : {}),
    };
    const rs = await client(c).message.findMany({
      where,
      orderBy: { seq: params.order },
      take: params.limit,
    });
    return rs.map(mapMessage);
  }

  async listPinned(scopeType: MessageScopeTypeValue, scopeId: string, c?: PrismaOrTx): Promise<Message[]> {
    const rs = await client(c).message.findMany({
      where: { scopeType, scopeId, pinnedAt: { not: null } },
      orderBy: { pinnedAt: "desc" },
    });
    return rs.map(mapMessage);
  }

  async countPinned(scopeType: MessageScopeTypeValue, scopeId: string, c?: PrismaOrTx): Promise<number> {
    return client(c).message.count({ where: { scopeType, scopeId, pinnedAt: { not: null } } });
  }

  /**
   * `findAndModify` nguyên tử qua `$runCommandRaw` (giống `outbox.relay.ts#claimOne`)
   * — Prisma Client không có `findOneAndUpdate`; `upsert()` thường của Prisma
   * KHÔNG atomic cho race "2 request cùng lúc tạo Counter lần đầu". Chạy
   * TRONG `tx` để tham gia cùng session transaction Mongo của `withTransaction`.
   */
  async nextSeq(tx: Prisma.TransactionClient, scopeType: MessageScopeTypeValue, scopeId: string, threadKey: string): Promise<number> {
    const key = `msg:${scopeType}:${scopeId}:${threadKey}`;
    const result = (await tx.$runCommandRaw({
      findAndModify: "Counter",
      query: { key },
      update: { $inc: { seq: 1 }, $setOnInsert: { key } },
      upsert: true,
      new: true,
    })) as unknown as { value: { seq: number } | null };
    if (!result.value) throw new Error(`[messages] nextSeq: không lấy được Counter cho khoá ${key}`);
    return result.value.seq;
  }

  async create(tx: Prisma.TransactionClient, input: MessageCreateInput): Promise<Message> {
    const r = await tx.message.create({
      data: {
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        workspaceId: input.workspaceId,
        threadId: input.threadId,
        threadKey: input.threadKey,
        seq: input.seq,
        authorId: input.authorId,
        kind: input.kind,
        systemType: input.systemType as never,
        systemPayload: (input.systemPayload ?? undefined) as Prisma.InputJsonValue | undefined,
        clientMessageId: input.clientMessageId,
        dedupeKey: input.dedupeKey,
        content: input.content,
        normalizedContent: input.normalizedContent,
        mentions: toStoredMentions(input.mentions),
        attachments: input.attachments,
        links: input.links,
        replyToId: input.replyToId ?? undefined,
        replyPreview: input.replyPreview ?? undefined,
        forwardedFrom: input.forwardedFrom ?? undefined,
        // Ghi tường minh `null` (KHÔNG bỏ trống) cho field sẽ bị lọc bằng
        // `X: null` trong `updateMany` sau này (`updateForEdit`/`tombstone`
        // dùng `deletedAt: null`, `setPin` dùng `pinnedAt: null`). Phát hiện
        // qua integration test: Prisma MongoDB connector KHÔNG khớp field
        // THIẾU (absent) với filter `{field: null}` trong `updateMany` dù
        // MongoDB thật coi `{field: null}` khớp CẢ absent LẪN null tường
        // minh — field bỏ trống lúc `create()` (absent) làm mọi
        // `updateMany({where:{...: null}})` sau đó LUÔN trả `count: 0`,
        // tưởng nhầm là version conflict/đã pin dù dữ liệu hoàn toàn đúng.
        deletedAt: null,
        deletedBy: null,
        pinnedAt: null,
        pinnedBy: null,
        editedAt: null,
      },
    });
    return mapMessage(r);
  }

  async updateSystemPayload(tx: Prisma.TransactionClient, id: string, payload: Record<string, unknown>): Promise<{ version: number } | null> {
    const result = await tx.message.updateMany({
      where: { id, kind: "SYSTEM", deletedAt: null },
      data: { systemPayload: payload as Prisma.InputJsonValue, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    const row = await tx.message.findUnique({ where: { id }, select: { version: true } });
    return row ? { version: row.version } : null;
  }

  async addSourceRef(id: string, ref: MessageSourceRef): Promise<"ADDED" | "EXISTS" | "FULL" | "NOT_FOUND"> {
    const row = await prisma.message.findUnique({ where: { id }, select: { sourceRefs: true } });
    if (!row) return "NOT_FOUND";
    const current = row.sourceRefs ?? [];
    if (current.some((s) => s.kind === ref.kind && s.refId === ref.refId)) return "EXISTS";
    if (current.length >= MESSAGE_SOURCE_REFS_MAX) return "FULL";
    // `none` ở chính lệnh ghi: hai lần thêm cùng (kind, refId) đua nhau chỉ MỘT lần `push` thành công.
    const result = await prisma.message.updateMany({
      where: { id, sourceRefs: { none: { kind: ref.kind, refId: ref.refId } } },
      data: { sourceRefs: { push: { kind: ref.kind, refId: ref.refId, createdBy: ref.createdBy, createdAt: ref.createdAt } } },
    });
    return result.count > 0 ? "ADDED" : "EXISTS";
  }

  async updateForEdit(
    tx: Prisma.TransactionClient,
    id: string,
    expectedVersion: number,
    data: MessageEditData
  ): Promise<{ count: number; editedAt: Date; version: number }> {
    const editedAt = new Date();
    const result = await tx.message.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        content: data.content,
        normalizedContent: data.normalizedContent,
        mentions: toStoredMentions(data.mentions),
        links: data.links,
        editedAt,
        version: { increment: 1 },
      },
    });
    return { count: result.count, editedAt, version: expectedVersion + 1 };
  }

  async tombstone(
    tx: Prisma.TransactionClient,
    id: string,
    actorId: string,
    mode: DeleteModeValue,
    reason: string | null,
    authorOnly: boolean
  ): Promise<{ count: number; deletedAt: Date }> {
    const deletedAt = new Date();
    const result = await tx.message.updateMany({
      where: { id, deletedAt: null, ...(authorOnly && { authorId: actorId }) },
      data: {
        deletedAt,
        deletedBy: actorId,
        deleteMode: mode,
        deleteReason: reason ?? undefined,
        content: null,
        normalizedContent: null,
        attachments: [],
        mentions: [],
        links: [],
        linkPreview: { unset: true },
        reactionsSummary: [],
        pinnedAt: null,
        pinnedBy: null,
        version: { increment: 1 },
      },
    });
    return { count: result.count, deletedAt };
  }

  async markReplyPreviewsDeleted(tx: Prisma.TransactionClient, replyToId: string): Promise<void> {
    const replies = await tx.message.findMany({ where: { replyToId }, select: { id: true, replyPreview: true } });
    await Promise.all(
      replies.map((r) =>
        tx.message.update({
          where: { id: r.id },
          data: {
            replyPreview: r.replyPreview
              ? { ...r.replyPreview, deleted: true }
              : { authorId: null, excerpt: "", kind: "TEXT", deleted: true },
          },
        })
      )
    );
  }

  async setPin(tx: Prisma.TransactionClient, id: string, pinnedBy: string): Promise<{ count: number; pinnedAt: Date }> {
    const pinnedAt = new Date();
    const result = await tx.message.updateMany({
      where: { id, deletedAt: null, pinnedAt: null },
      data: { pinnedAt, pinnedBy },
    });
    return { count: result.count, pinnedAt };
  }

  async clearPin(tx: Prisma.TransactionClient, id: string): Promise<{ count: number }> {
    const result = await tx.message.updateMany({
      where: { id, pinnedAt: { not: null } },
      data: { pinnedAt: null, pinnedBy: null },
    });
    return { count: result.count };
  }

  async clearPinIfSet(tx: Prisma.TransactionClient, id: string): Promise<void> {
    await tx.message.updateMany({ where: { id, pinnedAt: { not: null } }, data: { pinnedAt: null, pinnedBy: null } });
  }

  async updateReactionsSummary(tx: Prisma.TransactionClient, id: string, summary: ReactionSummary[]): Promise<void> {
    await tx.message.update({ where: { id }, data: { reactionsSummary: summary } });
  }

  async updateLinkPreview(tx: Prisma.TransactionClient, id: string, linkPreview: Message["linkPreview"]): Promise<void> {
    await tx.message.update({
      where: { id },
      data: { linkPreview: linkPreview ?? { unset: true } },
    });
  }
}
