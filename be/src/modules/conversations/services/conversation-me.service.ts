import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import { notifyUnreadSummaryChanged } from "../../read-state/public";
import type { MeSettingsDto } from "../dtos";
import type { MyConversationState } from "../entities/conversation.interface";

type ConversationMemberRow = Awaited<ReturnType<typeof prisma.conversationMember.findUniqueOrThrow>>;

function toState(row: ConversationMemberRow): MyConversationState {
  return {
    conversationId: row.conversationId,
    pinnedAt: row.pinnedAt,
    archivedAt: row.archivedAt,
    markedUnread: row.markedUnread,
    notifyMode: row.notifyMode,
    mutedUntil: row.mutedUntil,
    hiddenBeforeSeq: row.hiddenBeforeSeq,
    lastReadSeq: row.lastReadSeq,
  };
}

/** be.md §5/§3.4 — cài đặt cá nhân (ghim/tắt tiếng/lưu trữ/đánh dấu chưa đọc), "xoá phía tôi". */
export class ConversationMeService {
  async updateMe(viewer: AuthUser, conversationId: string, dto: MeSettingsDto): Promise<MyConversationState> {
    const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: viewer.id } } });
    if (!member || member.status !== "ACTIVE") throw new NotFoundError();

    if (dto.pinned === true && !member.pinnedAt) {
      const pinnedCount = await prisma.conversationMember.count({ where: { userId: viewer.id, status: "ACTIVE", pinnedAt: { not: null } } });
      if (pinnedCount >= LIMITS.conversation.memberPinnedMax) {
        throw new AppError(ErrorMessages[ErrorCode.CONV_009], 409, ErrorCode.CONV_009);
      }
    }

    const data: Prisma.ConversationMemberUpdateInput = {};
    if (dto.pinned !== undefined) data.pinnedAt = dto.pinned ? new Date() : null;
    if (dto.notifyMode !== undefined) data.notifyMode = dto.notifyMode;
    if (dto.mutedUntil !== undefined) data.mutedUntil = dto.mutedUntil ? new Date(dto.mutedUntil) : null;
    if (dto.archived !== undefined) data.archivedAt = dto.archived ? new Date() : null;
    if (dto.markedUnread !== undefined) data.markedUnread = dto.markedUnread;

    const updated = await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: viewer.id } },
      data,
    });

    this.emitMemberUpdated(viewer.id, updated);
    // p1-07: tắt tiếng/lưu trữ/đánh dấu chưa đọc làm đổi số huy hiệu mà client KHÔNG tự suy được ở máy khác →
    // xoá cache tổng hợp + phát `unread:summary-changed` (debounce 2 s/user). Ghim không ảnh hưởng số đếm.
    if (dto.notifyMode !== undefined || dto.mutedUntil !== undefined || dto.archived !== undefined || dto.markedUnread !== undefined) {
      await notifyUnreadSummaryChanged(viewer.id, "MUTE");
    }
    return toState(updated);
  }

  /** `POST /conversations/:id/clear` — be.md §3.4: `hiddenBeforeSeq=lastSeq`, `lastReadSeq=lastSeq`, `archivedAt=now`, `markedUnread=false`. */
  async clear(viewer: AuthUser, conversationId: string): Promise<MyConversationState> {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundError();
    const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: viewer.id } } });
    if (!member || member.status !== "ACTIVE") throw new NotFoundError();

    const updated = await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: viewer.id } },
      data: {
        hiddenBeforeSeq: conversation.lastSeq,
        lastReadSeq: conversation.lastSeq,
        unreadCount: 0,
        mentionsSinceRead: 0,
        archivedAt: new Date(),
        markedUnread: false,
      },
    });

    this.emitMemberUpdated(viewer.id, updated);
    await notifyUnreadSummaryChanged(viewer.id, "READ_ALL"); // `clear` đưa mốc đọc tới cuối → số chưa đọc đổi (p1-07)
    return toState(updated);
  }

  private emitMemberUpdated(userId: string, row: ConversationMemberRow): void {
    emitToUsers([userId], SocketEvent.CONVERSATION_MEMBER_UPDATED, {
      conversationId: row.conversationId,
      pinnedAt: row.pinnedAt,
      archivedAt: row.archivedAt,
      markedUnread: row.markedUnread,
      notifyMode: row.notifyMode,
      mutedUntil: row.mutedUntil,
      hiddenBeforeSeq: row.hiddenBeforeSeq,
    });
  }
}
