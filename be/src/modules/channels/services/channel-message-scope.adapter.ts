import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import { permissionService } from "../../../core/permission";
import { emitToRoom, emitToUsers } from "../../../infrastructure/socket/socket.emit";
import { ROOM } from "../../../infrastructure/socket";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { LIMITS } from "../../../core/constants/limits";
import type { AuthUser } from "../../../core/types/express";
import type {
  MessageActivityInfo,
  MessageCommittedInfo,
  MessageScope,
  MessageScopeReadAccess,
  MessageScopeViewerContext,
  MessageScopeWriteAccess,
  MentionValidationInput,
  MentionValidationResult,
} from "../../messages/public";
import { PrismaChannelGrantRepository } from "../repositories/channel-grant.repository.prisma";
import type { IChannelGrantRepository } from "../repositories/channel-grant.repository.interface";
import { PrismaChannelRoleAudience, type IChannelRoleAudience } from "./channel-role-audience";

const unique = (ids: string[]): string[] => Array.from(new Set(ids));

/**
 * `MessageScope` CHANNEL (be.md p1-04 §5, be.md p1-03 §5.6) — ĐÂY là phần
 * duy nhất của tác vụ p1-04 chạm ra ngoài `modules/messages/`. Uỷ quyền kiểm
 * đọc/ghi/react/pin/moderate cho resolver CHANNEL đã đăng ký sẵn
 * (`registerChannelPermissionResolver`, `channel-permission.resolver.ts`)
 * qua `permissionService.resolve()` — KHÔNG tự đọc `ChannelGrant`/tính role
 * lại (mục 7 "critical facts" của tác vụ).
 */
export class ChannelMessageScopeAdapter implements MessageScope {
  readonly scopeType = "CHANNEL" as const;

  constructor(
    private readonly grantRepo: IChannelGrantRepository,
    /** p3-04 — người đọc được nhờ grant theo vai trò; không truyền → chỉ grant DIRECT (unit test Phase 1). */
    private readonly roleAudience?: IChannelRoleAudience
  ) {}

  /** Người đọc được kênh RIÊNG TƯ = grant DIRECT ∪ người được phủ bởi grant theo vai trò. */
  private async privateReaderIds(channelId: string): Promise<string[]> {
    const [direct, viaRole] = await Promise.all([
      this.grantRepo.listByChannel(channelId),
      this.roleAudience ? this.roleAudience.listCoveredUserIds(channelId) : Promise.resolve<string[]>([]),
    ]);
    return unique([...direct.flatMap((g) => (g.grant.userId ? [g.grant.userId] : [])), ...viaRole]);
  }

  /**
   * p3-04 §5.6 — KHÁCH được chỉ định vào kênh PUBLIC (grant DIRECT) còn hiệu lực: người ĐỌC ĐƯỢC kênh ngoài "mọi thành viên
   * không phải khách". Khách không grant KHÔNG nằm trong tập này nên không nhận thông báo/hoạt động của kênh.
   */
  private async designatedGuestIds(channelId: string, workspaceId: string): Promise<string[]> {
    const grants = await prisma.channelGrant.findMany({
      where: { channelId, source: "DIRECT" },
      select: { userId: true },
    });
    const userIds = grants.flatMap((g) => (g.userId ? [g.userId] : []));
    if (userIds.length === 0) return [];
    const guests = await prisma.workspaceMembership.findMany({
      where: { workspaceId, userId: { in: userIds }, role: "GUEST", status: "ACTIVE" },
      select: { userId: true, expiresAt: true },
    });
    const now = Date.now();
    return guests.filter((g) => !g.expiresAt || g.expiresAt.getTime() > now).map((g) => g.userId);
  }

  async canRead(user: AuthUser, scopeId: string): Promise<MessageScopeReadAccess> {
    const access = await permissionService.resolve(user, { type: "CHANNEL", id: scopeId });
    if (!access.visible) return { visible: false, workspaceId: null };
    const workspaceId = await this.workspaceIdOf(scopeId);
    return { visible: true, workspaceId };
  }

  async canWrite(user: AuthUser, scopeId: string): Promise<MessageScopeWriteAccess> {
    const access = await permissionService.resolve(user, { type: "CHANNEL", id: scopeId });
    if (!access.visible) return { visible: false, allowed: false, workspaceId: null };
    const workspaceId = await this.workspaceIdOf(scopeId);
    return { visible: true, allowed: access.actions.has("channel.message.send"), workspaceId };
  }

  async viewerContext(user: AuthUser, scopeId: string): Promise<MessageScopeViewerContext> {
    const access = await permissionService.resolve(user, { type: "CHANNEL", id: scopeId });
    return {
      // Kênh không có "ẩn phía tôi" (D-23 chỉ áp dụng hội thoại) — luôn 0.
      hiddenBeforeSeq: 0,
      capabilities: {
        canWrite: access.actions.has("channel.message.send"),
        canReact: access.actions.has("channel.message.react"),
        canPin: access.actions.has("channel.message.pin"),
        canModerate: access.actions.has("channel.message.moderate"),
      },
    };
  }

  pinMax(): number {
    return LIMITS.channel.pinMax;
  }

  async readerIds(scopeId: string): Promise<string[]> {
    const channel = await prisma.channel.findUnique({ where: { id: scopeId }, select: { workspaceId: true, visibility: true } });
    if (!channel) return [];
    if (channel.visibility === "PUBLIC") {
      const [memberships, guestIds] = await Promise.all([
        prisma.workspaceMembership.findMany({
          where: { workspaceId: channel.workspaceId, status: "ACTIVE", role: { not: "GUEST" } },
          select: { userId: true },
        }),
        this.designatedGuestIds(scopeId, channel.workspaceId),
      ]);
      return unique([...memberships.map((m) => m.userId), ...guestIds]);
    }
    return this.privateReaderIds(scopeId);
  }

  async onMessageCommitted(tx: Prisma.TransactionClient, scopeId: string, info: MessageCommittedInfo): Promise<void> {
    await tx.channel.updateMany({
      where: { id: scopeId, lastSeq: { lt: info.seq } },
      data: { lastSeq: info.seq, lastMessageAt: info.createdAt, lastMessageId: info.messageId },
    });
  }

  /**
   * be.md p1-03 §6 / p1-04 §6 — `channel:activity` KHÔNG mang nội dung (không `content`/`preview`/tên tác giả) nhưng CÓ
   * `seq`/`threadId`/`authorId`: ba field app cần để quyết "tin này có làm kênh thành chưa đọc của TÔI không"
   * (`useReadStateSync` → `applyChannelMessage`). Public: broadcast room `ws:{workspaceId}` (be.md p1-03 §5.6
   * "public → không liệt kê" — không dò từng thành viên); Private: unicast từng grantee. Mention `USER` cụ thể
   * (≤ `mentionsMax=20`, `ALL` bị `validateMentions` từ chối ở CHANNEL — P2 "@everyone") nhận thêm bản `mentionMe:true`.
   *
   * ⛔ ĐỪNG bỏ `authorId`/`seq` khỏi payload: bản p1-04 chỉ gửi `lastSeq`/`lastMessageAt` nên app đọc `event.authorId`
   * ra `undefined` (⇒ MỌI tin, kể cả tin mình vừa gửi, +1 vào chấm chưa đọc của kênh) và `event.seq` ra `undefined`
   * (⇒ chốt chống cộng trùng `seq <= lastSeq` không bao giờ đúng, còn `channels[id].lastSeq` trong cache bị ghi thành
   * `undefined`). Cùng loại lỗi đã sửa ở `conversation:activity` — xem docstring `emitActivity` của
   * `conversation.message-scope.ts`.
   */
  async emitActivity(scopeId: string, info: MessageActivityInfo): Promise<void> {
    const channel = await prisma.channel.findUnique({ where: { id: scopeId }, select: { workspaceId: true, visibility: true } });
    if (!channel) return;

    const mentionedIds = Array.from(new Set(info.mentions.filter((m) => m.type === "USER" && m.targetId).map((m) => m.targetId as string)));
    const basePayload = {
      v: 1,
      channelId: scopeId,
      workspaceId: channel.workspaceId,
      seq: info.seq,
      // Engine CHỈ gọi `emitActivity` cho tin ở luồng CHÍNH (`threadKey === "root"` — xem `MessageActivityInfo`); gửi
      // `null` TƯỜNG MINH để client phân biệt "tin luồng chính" với "payload cũ thiếu field".
      threadId: null,
      authorId: info.authorId,
      // Tên cũ (p1-04) giữ lại cho client đã phát hành: `lastSeq` === `seq`, cùng một con số.
      lastSeq: info.seq,
      lastMessageAt: info.createdAt,
    };

    if (channel.visibility === "PUBLIC") {
      emitToRoom(ROOM.workspace(channel.workspaceId), SocketEvent.CHANNEL_ACTIVITY, { ...basePayload, mentionMe: false });
      if (mentionedIds.length > 0) {
        emitToUsers(mentionedIds, SocketEvent.CHANNEL_ACTIVITY, { ...basePayload, mentionMe: true });
      }
      // Khách không ở room `ws:{id}` → nhận hoạt động của kênh chỉ định qua `user:{id}` (khách được nhắc tên nhận bản `mentionMe`).
      const guestIds = await this.designatedGuestIds(scopeId, channel.workspaceId);
      const guestsMentioned = guestIds.filter((id) => mentionedIds.includes(id));
      const guestsRest = guestIds.filter((id) => !mentionedIds.includes(id));
      if (guestsRest.length > 0) emitToUsers(guestsRest, SocketEvent.CHANNEL_ACTIVITY, { ...basePayload, mentionMe: false });
      if (guestsMentioned.length > 0) emitToUsers(guestsMentioned, SocketEvent.CHANNEL_ACTIVITY, { ...basePayload, mentionMe: true });
      return;
    }

    const allIds = await this.privateReaderIds(scopeId);
    const mentionedSet = new Set(mentionedIds);
    const mentioned = allIds.filter((id) => mentionedSet.has(id));
    const rest = allIds.filter((id) => !mentionedSet.has(id));
    if (rest.length > 0) emitToUsers(rest, SocketEvent.CHANNEL_ACTIVITY, { ...basePayload, mentionMe: false });
    if (mentioned.length > 0) emitToUsers(mentioned, SocketEvent.CHANNEL_ACTIVITY, { ...basePayload, mentionMe: true });
  }

  contentRoom(scopeId: string): string {
    return ROOM.channel(scopeId);
  }

  searchable(): boolean {
    return true;
  }

  /**
   * `USER` mention phải là thành viên kênh (grant riêng tư / thành viên
   * workspace nếu công khai) — `ROLE`/`ALL` bị từ chối (be.md p1-03 §5.6
   * "mentionAll → luôn FORBIDDEN", role mention chưa có mã `custom-roles`).
   */
  async validateMentions(scopeId: string, mentions: MentionValidationInput[]): Promise<MentionValidationResult> {
    const invalid: MentionValidationInput[] = mentions.filter((m) => m.type !== "USER");
    const userMentions = mentions.filter((m) => m.type === "USER");

    if (userMentions.length > 0) {
      const channel = await prisma.channel.findUnique({ where: { id: scopeId }, select: { workspaceId: true, visibility: true } });
      if (!channel) {
        invalid.push(...userMentions);
      } else if (channel.visibility === "PRIVATE") {
        const memberIds = new Set(await this.privateReaderIds(scopeId));
        for (const m of userMentions) {
          if (!m.targetId || !memberIds.has(m.targetId)) invalid.push(m);
        }
      } else {
        for (const m of userMentions) {
          if (!m.targetId) {
            invalid.push(m);
            continue;
          }
          const membership = await prisma.workspaceMembership.findUnique({
            where: { workspaceId_userId: { workspaceId: channel.workspaceId, userId: m.targetId } },
          });
          if (!membership || membership.status !== "ACTIVE") {
            invalid.push(m);
          } else if (membership.role === "GUEST" && !(await this.designatedGuestIds(scopeId, channel.workspaceId)).includes(m.targetId)) {
            // Khách không được chỉ định vào kênh này → không nhắc tên được (kênh public không phải của họ).
            invalid.push(m);
          }
        }
      }
    }

    return invalid.length > 0 ? { valid: false, invalidMentions: invalid } : { valid: true };
  }

  private async workspaceIdOf(channelId: string): Promise<string | null> {
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { workspaceId: true } });
    return channel?.workspaceId ?? null;
  }
}

export function createChannelMessageScopeAdapter(): ChannelMessageScopeAdapter {
  return new ChannelMessageScopeAdapter(new PrismaChannelGrantRepository(), new PrismaChannelRoleAudience());
}
