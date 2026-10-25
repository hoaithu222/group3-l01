import type { Prisma, AttachmentKind } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type { MediaQueryDto } from "../dtos";

export interface MediaListItem {
  messageId: string;
  seq: number;
  authorId: string | null;
  createdAt: Date;
  attachmentKind?: string;
  link?: { url: string; host: string };
}

/**
 * be.md §5.10 — thư viện Ảnh-Video / Tệp / Liên kết. Đơn giản hoá so với
 * pseudocode `aggregateRaw $unwind` (be.md §5.10) — trang theo SỐ TIN (không
 * phải số MỤC media chính xác 30, "gom theo tin" chỉ đúng gần đúng ở biên
 * trang) để tránh viết pipeline Mongo thô phức tạp trong lượt này; đủ đúng
 * ngữ nghĩa filter/cursor/ẩn theo viewer — tối ưu chính xác 30 mục/trang khi
 * cần (không chặn chức năng chính). Signed URL KHÔNG trả kèm (be.md §5.10) —
 * app tự gọi `GET /assets/:id/url`.
 */
export class ConversationMediaService {
  async list(viewer: AuthUser, conversationId: string, query: MediaQueryDto): Promise<{ data: MediaListItem[]; nextCursor: string | null }> {
    const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: viewer.id } } });
    if (!member) throw new NotFoundError();

    const cursorSeq = query.cursor ? Number(query.cursor) : undefined;
    const attachmentKinds: AttachmentKind[] | null =
      query.kind === "MEDIA" ? ["IMAGE", "VIDEO"] : query.kind === "FILE" ? ["FILE", "AUDIO"] : null;

    const where: Prisma.MessageWhereInput = {
      scopeType: "CONVERSATION",
      scopeId: conversationId,
      deletedAt: null,
      seq: { gt: member.hiddenBeforeSeq, ...(Number.isFinite(cursorSeq) && cursorSeq !== undefined ? { lt: cursorSeq } : {}) },
    };
    if (query.kind === "LINK") {
      where.links = { isEmpty: false };
    } else if (attachmentKinds) {
      where.attachments = { some: { kind: { in: attachmentKinds } } };
    }

    const rows = await prisma.message.findMany({ where, orderBy: { seq: "desc" }, take: query.limit });
    if (rows.length === 0) return { data: [], nextCursor: null };

    const hiddenRows = await prisma.messageHide.findMany({
      where: { userId: viewer.id, scopeType: "CONVERSATION", scopeId: conversationId, messageId: { in: rows.map((r) => r.id) } },
      select: { messageId: true },
    });
    const hiddenIds = new Set(hiddenRows.map((h) => h.messageId));
    const visible = rows.filter((r) => !hiddenIds.has(r.id));

    const data: MediaListItem[] = [];
    for (const row of visible) {
      if (query.kind === "LINK") {
        for (const link of row.links) data.push({ messageId: row.id, seq: row.seq, authorId: row.authorId, createdAt: row.createdAt, link });
      } else if (attachmentKinds) {
        for (const attachment of row.attachments) {
          if (attachmentKinds.includes(attachment.kind)) {
            data.push({ messageId: row.id, seq: row.seq, authorId: row.authorId, createdAt: row.createdAt, attachmentKind: attachment.kind });
          }
        }
      }
    }

    const last = rows[rows.length - 1];
    const nextCursor = rows.length === query.limit ? String(last.seq) : null;
    return { data, nextCursor };
  }
}
