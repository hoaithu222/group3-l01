import { Prisma } from "@prisma/client";
import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch } from "../../../core/utils/normalize";
import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { sharesActiveWorkspace } from "../../../core/permission";
import { avatarUrlOf } from "../../../shared/media";
import { getStates } from "../../presence/presence.service";
import { checkDirectEligibility, type DirectEligibility } from "./eligibility.service";
import { buildDirectKey, buildLastMessagePreview, toDetail } from "./conversation-presenter";
import type { IConversationRepository } from "../repositories/conversation.repository.interface";
import type { Conversation, ConversationDetail, ConversationMember } from "../entities/conversation.interface";

/** be.md §5.2 — DIRECT: `eligibility` + `getOrCreateDirect` idempotent. */
export class DirectConversationService {
  constructor(private readonly conversationRepo: IConversationRepository) {}

  async eligibility(meId: string, otherUserId: string): Promise<DirectEligibility> {
    return checkDirectEligibility(meId, otherUserId);
  }

  /** `GET /conversations/direct/:userId` — 404 `CONV_013` + `details.eligibility` khi chưa có hội thoại (be.md §4). */
  async getDetailForPeer(me: AuthUser, otherUserId: string): Promise<ConversationDetail> {
    const directKey = buildDirectKey(me.id, otherUserId);
    const conversation = await this.conversationRepo.findByDirectKey(directKey);
    const eligibility = await checkDirectEligibility(me.id, otherUserId);
    if (!conversation) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_013], 404, ErrorCode.CONV_013, { eligibility });
    }
    return this.toDetail(conversation, me.id, eligibility);
  }

  /** `POST /conversations/direct` — trả `created=true` (201) hoặc `created=false` (200, đã có sẵn). */
  async getOrCreateDirect(me: AuthUser, otherUserId: string): Promise<{ created: boolean; detail: ConversationDetail }> {
    const directKey = buildDirectKey(me.id, otherUserId);
    const before = await this.conversationRepo.findByDirectKey(directKey);
    const conversationId = await this.getOrCreateDirectId(me.id, otherUserId);
    const created = !before;
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) throw new NotFoundError();
    const eligibility = await checkDirectEligibility(me.id, otherUserId);
    return { created, detail: await this.toDetail(conversation, me.id, eligibility) };
  }

  /**
   * be.md §5.2/§5.9 — dùng bởi endpoint HTTP TRÊN và bởi `ConversationHooks.getOrCreateDirect`
   * (`conversation-hooks.service.ts`, gọi bởi `message-forward.service.ts` p1-04
   * và p2-01 sau này). Idempotent — `P2002` trên `directKey` → đọc lại, KHÔNG
   * catch bên trong `withTransaction()` (item 6 "critical facts" — transaction
   * đã abort, catch phải ở tầng service).
   */
  async getOrCreateDirectId(meId: string, otherUserId: string): Promise<string> {
    const directKey = buildDirectKey(meId, otherUserId);
    const existing = await this.conversationRepo.findByDirectKey(directKey);
    if (existing) return existing.id;

    if (meId === otherUserId) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_011], 400, ErrorCode.CONV_011);
    }

    const [me, other] = await Promise.all([
      prisma.user.findUnique({ where: { id: meId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: otherUserId }, select: { id: true, status: true, name: true } }),
    ]);
    if (!other || other.status !== "ACTIVE") throw new NotFoundError();

    const eligibility = await checkDirectEligibility(meId, otherUserId);
    if (!eligibility.canMessage) {
      // Đã chung nhóm mà vẫn không nhắn được ⇒ do phạm vi KHÁCH (p3-04) → CONV_014 trung tính.
      const guestLimited = eligibility.reason === "NO_SHARED_WORKSPACE" && (await sharesActiveWorkspace(meId, otherUserId));
      const code = eligibility.reason === "BLOCKED" ? ErrorCode.CONV_002 : guestLimited ? ErrorCode.CONV_014 : ErrorCode.CONV_001;
      throw new AppError(ErrorMessages[code], 403, code);
    }

    const newId = newObjectId();
    try {
      await withTransaction(async (tx) => {
        await tx.conversation.create({
          data: {
            id: newId,
            kind: "DIRECT",
            workspaceId: null,
            meetingId: null,
            meetingKey: `none:${newId}`,
            directKey,
            title: null,
            normalizedTitle: null,
            avatarAssetId: null,
            ownerId: null,
            createdBy: meId,
            status: "ACTIVE",
            settings: { membersCanAdd: false, memberCanPin: true, mentionAllRole: "ADMIN" },
            lastSeq: 0,
            lastMessageAt: null,
            lastMessageId: null,
            memberCount: 2,
            archivedAt: null,
            dissolvedAt: null,
            dissolvedBy: null,
            dissolveReason: null,
          },
        });
        await tx.conversationMember.create({
          data: {
            conversationId: newId,
            userId: meId,
            kind: "DIRECT",
            workspaceId: null,
            role: "MEMBER",
            status: "ACTIVE",
            peerUserId: otherUserId,
            leftAt: null,
            addedBy: null,
            lastReadAt: null,
            notifyMode: "INHERIT",
            mutedUntil: null,
            pinnedAt: null,
            archivedAt: null,
            hiddenBeforeSeq: 0,
            searchText: normalizeSearch(other.name ?? ""),
          },
        });
        await tx.conversationMember.create({
          data: {
            conversationId: newId,
            userId: otherUserId,
            kind: "DIRECT",
            workspaceId: null,
            role: "MEMBER",
            status: "ACTIVE",
            peerUserId: meId,
            leftAt: null,
            addedBy: null,
            lastReadAt: null,
            notifyMode: "INHERIT",
            mutedUntil: null,
            pinnedAt: null,
            archivedAt: null,
            hiddenBeforeSeq: 0,
            searchText: normalizeSearch(me?.name ?? ""),
          },
        });
        // be.md §5.2 bước 5 — KHÔNG tin hệ thống `CONVERSATION_CREATED` cho DIRECT.
        await outbox.add(tx, {
          type: "conversation.created",
          aggregateType: "Conversation",
          aggregateId: newId,
          queue: "notifications",
          jobName: "conversation.events",
          dedupeKey: `conversation.created:conversation:${newId}:v1`,
          payload: { conversationId: newId, memberIds: [meId, otherUserId] },
        });
      });
      return newId;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const replay = await this.conversationRepo.findByDirectKey(directKey);
        if (replay) return replay.id; // CV-01 — 20 request song song → 1 hội thoại
      }
      throw err;
    }
  }

  private async toDetail(conversation: Conversation, viewerId: string, eligibility: DirectEligibility): Promise<ConversationDetail> {
    const [member, peerMemberRow] = await Promise.all([
      prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: conversation.id, userId: viewerId } } }),
      prisma.conversationMember.findFirst({ where: { conversationId: conversation.id, userId: { not: viewerId } } }),
    ]);
    if (!member) throw new NotFoundError();

    const peerId = peerMemberRow?.userId ?? (member as unknown as ConversationMember).peerUserId;
    let peer = null as ConversationDetail["peer"];
    let peerLastReadSeq: number | null = null;
    let peerReadAt: Date | null = null;

    if (peerId) {
      const [peerUser, presenceMap] = await Promise.all([
        prisma.user.findUnique({ where: { id: peerId }, select: { name: true, status: true, privacy: true, avatarAssetId: true } }),
        getStates(viewerId, [peerId]),
      ]);
      const showPresence = peerUser?.privacy?.showPresence !== false;
      peer = {
        userId: peerId,
        name: peerUser?.name ?? "",
        avatarUrl: avatarUrlOf(peerUser?.avatarAssetId),
        presence: showPresence ? (presenceMap[peerId]?.state ?? "OFFLINE") : "HIDDEN",
      };

      // be.md §5.8 — `peerLastReadSeq/peerReadAt` chỉ khi CẢ HAI bật `privacy.readReceipts`.
      const myUser = await prisma.user.findUnique({ where: { id: viewerId }, select: { privacy: true } });
      const bothEnabled = myUser?.privacy?.readReceipts !== false && peerUser?.privacy?.readReceipts !== false;
      if (bothEnabled && peerMemberRow) {
        peerLastReadSeq = peerMemberRow.lastReadSeq;
        peerReadAt = peerMemberRow.lastReadAt;
      }
    }

    const lastMessage = await buildLastMessagePreview(conversation.id, viewerId, member.hiddenBeforeSeq);

    return toDetail({
      conversation,
      member: member as unknown as ConversationMember,
      peer,
      lastMessage,
      eligibility,
      peerLastReadSeq,
      peerReadAt,
    });
  }
}
