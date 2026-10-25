import { prisma } from "../../../infrastructure/database";
import { emitToRoom } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import type { AuthUser } from "../../../core/types/express";
import { avatarUrlOf } from "../../../shared/media";

export interface ReadReceiptEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  readAt: Date | null;
}

export interface ReadReceiptsResult {
  readers: ReadReceiptEntry[];
  total: number;
  hiddenByPrivacy?: boolean;
}

/**
 * be.md §5.8 — phần ĐỌC (`GET .../read-receipts?seq=`). Phần GHI read marker
 * (`ConversationMember.lastReadSeq`) do p1-07 (`modules/read-state`,
 * `POST /read-markers`) đảm nhiệm; `emitReadReceipt` bên dưới được đăng ký làm
 * `IReadReceiptPublisher` (`registerConversationModule()`) để p1-07 gọi.
 */
export class ReadReceiptService {
  async getReceipts(viewer: AuthUser, conversationId: string, seq: number): Promise<ReadReceiptsResult> {
    const viewerUser = await prisma.user.findUnique({ where: { id: viewer.id }, select: { privacy: true } });
    if (viewerUser?.privacy?.readReceipts === false) {
      return { readers: [], total: 0, hiddenByPrivacy: true };
    }

    const members = await prisma.conversationMember.findMany({
      where: { conversationId, status: "ACTIVE", userId: { not: viewer.id }, lastReadSeq: { gte: seq } },
      orderBy: { lastReadAt: "desc" },
    });
    if (members.length === 0) return { readers: [], total: 0 };

    const users = await prisma.user.findMany({
      where: { id: { in: members.map((m) => m.userId) } },
      select: { id: true, name: true, privacy: true, avatarAssetId: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const readers = members
      .filter((m) => userById.get(m.userId)?.privacy?.readReceipts !== false)
      .map((m) => {
        const user = userById.get(m.userId);
        return { userId: m.userId, name: user?.name ?? "", avatarUrl: avatarUrlOf(user?.avatarAssetId), readAt: m.lastReadAt };
      });

    return { readers, total: readers.length };
  }
}

/**
 * Phát `read:receipt` tới `conv:{id}` khi 1 member đọc tới `seq` — gọi bởi `ReadMarkerService` (p1-07) qua
 * `IReadReceiptPublisher`. Tôn trọng `User.privacy.readReceipts` CỦA NGƯỜI ĐỌC (không phát nếu người đó tắt "đã xem" —
 * be.md §5.8 "không phát của mình").
 */
export async function emitReadReceipt(conversationId: string, userId: string, seq: number, readAt: Date): Promise<void> {
  const [member, user] = await Promise.all([
    prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { privacy: true } }),
  ]);
  if (!member) return;
  if (user?.privacy?.readReceipts === false) return;
  emitToRoom(ROOM.conversation(conversationId), SocketEvent.READ_RECEIPT, {
    conversationId,
    userId,
    lastReadSeq: seq,
    readAt: readAt.toISOString(),
  });
}
