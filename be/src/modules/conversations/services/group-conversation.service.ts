import { prisma, withTransaction } from "../../../infrastructure/database";
import { outbox } from "../../../infrastructure/queue";
import { permissionService } from "../../../core/permission";
import { newObjectId } from "../../../core/utils/object-id";
import { normalizeSearch, graphemeLength } from "../../../core/utils/normalize";
import { AppError, NotFoundError, ValidationError, VersionConflictError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import { LIMITS } from "../../../core/constants/limits";
import type { AssetLinkService } from "../../assets/public";
import type { ISystemMessagePort } from "../../messages/public";
import { toDetail, buildLastMessagePreview, buildDirectPeerContext } from "./conversation-presenter";
import { assertNotBlockedByAny } from "./block-guard";
import { invalidateConversationMetaCache } from "../permission/conversation.scope-resolver";
import type { CreateGroupDto, DissolveDto, PatchConversationDto } from "../dtos";
import type { Conversation, ConversationDetail, ConversationMember, ConversationSettings } from "../entities/conversation.interface";
import type { IConversationRepository } from "../repositories/conversation.repository.interface";

function normalizeConfirmTitle(s: string): string {
  return s.normalize("NFC").trim().toLowerCase();
}

/** Ảnh nhóm chat chỉ nhận asset tải lên với scope `AVATAR` (app: `useUpload('AVATAR')`) — allowlist ảnh + trần 2 MiB; sai scope → 415 `ASSET_001`. */
const CONVERSATION_AVATAR_SCOPES = ["AVATAR"] as const;

/** be.md §5.3/§5.5 — tạo/sửa/giải tán GROUP. */
export class GroupConversationService {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly assetLinkService: AssetLinkService,
    private readonly systemMessage: ISystemMessagePort
  ) {}

  async create(actor: AuthUser, dto: CreateGroupDto): Promise<ConversationDetail> {
    const uniqueMemberIds = Array.from(new Set(dto.memberIds)).filter((id) => id !== actor.id);

    const activeRows = await prisma.workspaceMembership.findMany({
      where: { workspaceId: dto.workspaceId, userId: { in: uniqueMemberIds }, status: "ACTIVE", role: { not: "GUEST" } },
      select: { userId: true },
    });
    const activeSet = new Set(activeRows.map((r) => r.userId));
    const invalidUserIds = uniqueMemberIds.filter((id) => !activeSet.has(id));
    if (invalidUserIds.length > 0) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_003], 400, ErrorCode.CONV_003, { invalidUserIds });
    }
    // p1-08 BLOCK-02 — người tạo bị bất kỳ thành viên được mời chặn → 403 `BLOCK_003` (trung tính).
    await assertNotBlockedByAny(actor.id, uniqueMemberIds);

    const totalMembers = uniqueMemberIds.length + 1;
    if (totalMembers > LIMITS.conversation.membersMax) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_004], 409, ErrorCode.CONV_004);
    }

    const title = dto.title.trim();
    const titleLen = graphemeLength(title);
    if (titleLen < LIMITS.conversation.titleMin || titleLen > LIMITS.conversation.titleMax) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_010], 400, ErrorCode.CONV_010);
    }
    const normalizedTitle = normalizeSearch(title);

    const newId = newObjectId();
    const settings: ConversationSettings = { membersCanAdd: false, memberCanPin: false, mentionAllRole: "ADMIN" };

    await withTransaction(async (tx) => {
      await tx.conversation.create({
        data: {
          id: newId,
          kind: "GROUP",
          workspaceId: dto.workspaceId,
          meetingId: null,
          meetingKey: `none:${newId}`,
          directKey: `g:${newId}`,
          title,
          normalizedTitle,
          avatarAssetId: null,
          ownerId: actor.id,
          createdBy: actor.id,
          status: "ACTIVE",
          settings,
          lastSeq: 0,
          lastMessageAt: null,
          lastMessageId: null,
          memberCount: totalMembers,
          archivedAt: null,
          dissolvedAt: null,
          dissolvedBy: null,
          dissolveReason: null,
        },
      });

      await tx.conversationMember.create({
        data: {
          conversationId: newId,
          userId: actor.id,
          kind: "GROUP",
          workspaceId: dto.workspaceId,
          role: "OWNER",
          status: "ACTIVE",
          peerUserId: null,
          leftAt: null,
          addedBy: null,
          lastReadAt: null,
          notifyMode: "INHERIT",
          mutedUntil: null,
          pinnedAt: null,
          archivedAt: null,
          hiddenBeforeSeq: 0,
          searchText: normalizedTitle,
        },
      });
      if (uniqueMemberIds.length > 0) {
        await tx.conversationMember.createMany({
          data: uniqueMemberIds.map((userId) => ({
            conversationId: newId,
            userId,
            kind: "GROUP" as const,
            workspaceId: dto.workspaceId,
            role: "MEMBER" as const,
            status: "ACTIVE" as const,
            peerUserId: null,
            leftAt: null,
            addedBy: actor.id,
            lastReadAt: null,
            notifyMode: "INHERIT" as const,
            mutedUntil: null,
            pinnedAt: null,
            archivedAt: null,
            hiddenBeforeSeq: 0,
            searchText: normalizedTitle,
          })),
        });
      }

      if (dto.avatarAssetId) {
        await this.assetLinkService.attach(tx, {
          assetIds: [dto.avatarAssetId],
          targetType: "CONVERSATION_AVATAR",
          targetId: newId,
          scopeType: "CONVERSATION",
          scopeId: newId,
          actorId: actor.id,
          allowedScopes: CONVERSATION_AVATAR_SCOPES,
        });
        await tx.conversation.update({ where: { id: newId }, data: { avatarAssetId: dto.avatarAssetId } });
      }

      await this.systemMessage.post(
        { scopeType: "CONVERSATION", scopeId: newId, workspaceId: dto.workspaceId, systemType: "CONVERSATION_CREATED", payload: { actorId: actor.id }, dedupeKey: `conv-created:${newId}` },
        tx
      );
      if (uniqueMemberIds.length > 0) {
        await this.systemMessage.post(
          {
            scopeType: "CONVERSATION",
            scopeId: newId,
            workspaceId: dto.workspaceId,
            systemType: "MEMBER_ADDED",
            payload: { actorId: actor.id, userIds: uniqueMemberIds },
            dedupeKey: `conv-member-added:${newId}:create`,
          },
          tx
        );
      }

      await outbox.add(tx, {
        type: "conversation.created",
        aggregateType: "Conversation",
        aggregateId: newId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.created:conversation:${newId}:v1`,
        payload: { event: "created", conversationId: newId, memberIds: [actor.id, ...uniqueMemberIds] },
      });
    });

    return this.getDetail(actor.id, newId);
  }

  async patch(actor: AuthUser, conversationId: string, dto: PatchConversationDto): Promise<ConversationDetail> {
    const conversation = await this.requireGroup(conversationId);
    if (conversation.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.CONV_007], 409, ErrorCode.CONV_007);

    let title = conversation.title;
    let normalizedTitle = conversation.normalizedTitle;
    if (dto.title !== undefined) {
      const trimmed = dto.title.trim();
      const len = graphemeLength(trimmed);
      if (len < LIMITS.conversation.titleMin || len > LIMITS.conversation.titleMax) {
        throw new AppError(ErrorMessages[ErrorCode.CONV_010], 400, ErrorCode.CONV_010);
      }
      title = trimmed;
      normalizedTitle = normalizeSearch(trimmed);
    }

    const settings: ConversationSettings = {
      membersCanAdd: dto.settings?.membersCanAdd ?? conversation.settings.membersCanAdd,
      memberCanPin: dto.settings?.memberCanPin ?? conversation.settings.memberCanPin,
      mentionAllRole: dto.settings?.mentionAllRole ?? conversation.settings.mentionAllRole,
    };

    await withTransaction(async (tx) => {
      const result = await tx.conversation.updateMany({
        where: { id: conversationId, version: dto.expectedVersion, status: "ACTIVE" },
        data: {
          title,
          normalizedTitle,
          settings,
          ...(dto.allowGuests !== undefined && { allowGuests: dto.allowGuests }),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        const current = await tx.conversation.findUnique({ where: { id: conversationId } });
        if (!current) throw new NotFoundError();
        if (current.status !== "ACTIVE") throw new AppError(ErrorMessages[ErrorCode.CONV_007], 409, ErrorCode.CONV_007);
        throw new VersionConflictError(current.version);
      }

      if (dto.avatarAssetId === null) {
        await this.assetLinkService.detachAll(tx, { targetType: "CONVERSATION_AVATAR", targetId: conversationId });
        await tx.conversation.update({ where: { id: conversationId }, data: { avatarAssetId: null } });
      } else if (dto.avatarAssetId) {
        await this.assetLinkService.replace(tx, {
          targetType: "CONVERSATION_AVATAR",
          targetId: conversationId,
          assetId: dto.avatarAssetId,
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          actorId: actor.id,
          allowedScopes: CONVERSATION_AVATAR_SCOPES,
        });
        await tx.conversation.update({ where: { id: conversationId }, data: { avatarAssetId: dto.avatarAssetId } });
      }

      if (dto.title !== undefined) {
        await tx.conversationMember.updateMany({ where: { conversationId, kind: "GROUP" }, data: { searchText: normalizedTitle ?? "" } });
        await this.systemMessage.post(
          {
            scopeType: "CONVERSATION",
            scopeId: conversationId,
            workspaceId: conversation.workspaceId,
            systemType: "TITLE_CHANGED",
            payload: { actorId: actor.id, from: conversation.title, to: title as string },
            dedupeKey: `conv-title-changed:${conversationId}:v${dto.expectedVersion + 1}`,
          },
          tx
        );
      }
      if (dto.avatarAssetId !== undefined) {
        await this.systemMessage.post(
          {
            scopeType: "CONVERSATION",
            scopeId: conversationId,
            workspaceId: conversation.workspaceId,
            systemType: "AVATAR_CHANGED",
            payload: { actorId: actor.id },
            dedupeKey: `conv-avatar-changed:${conversationId}:v${dto.expectedVersion + 1}`,
          },
          tx
        );
      }

      await outbox.add(tx, {
        type: "conversation.updated",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.updated:conversation:${conversationId}:v${dto.expectedVersion + 1}`,
        payload: { event: "updated", conversationId, title, settings },
      });
    });

    await invalidateConversationMetaCache(conversationId);
    // item 3 "critical facts" — bumpVersion SAU KHI transaction commit (settings ảnh hưởng action `conversation.member.add`).
    await permissionService.bumpVersion({ type: "CONVERSATION", id: conversationId });

    return this.getDetail(actor.id, conversationId);
  }

  /** `POST /conversations/:id/dissolve` (OWNER) — be.md §5.5. */
  async dissolve(actor: AuthUser, conversationId: string, dto: DissolveDto): Promise<{ id: string; status: "DISSOLVED"; dissolvedAt: Date }> {
    const conversation = await this.requireGroup(conversationId);
    if (conversation.status === "DISSOLVED") {
      return { id: conversation.id, status: "DISSOLVED", dissolvedAt: conversation.dissolvedAt ?? new Date() };
    }
    // Nhóm cuộc họp (p2-04 CHƯA build — không có `Meeting` model để kiểm trạng
    // thái ENDED/CANCELLED) — chặn hẳn dissolve thường cho tới khi p2-04 build
    // xong hook riêng cho trường hợp này (an toàn hơn cho phép nhầm).
    if (conversation.meetingId) {
      throw new AppError(ErrorMessages[ErrorCode.CONV_012], 409, ErrorCode.CONV_012);
    }

    const expected = normalizeConfirmTitle(conversation.title ?? "");
    const provided = normalizeConfirmTitle(dto.confirmTitle);
    if (expected !== provided) {
      throw new ValidationError("Tên xác nhận không khớp với tên nhóm");
    }

    const dissolvedAt = new Date();
    await withTransaction(async (tx) => {
      const result = await tx.conversation.updateMany({
        where: { id: conversationId, status: "ACTIVE" },
        data: { status: "DISSOLVED", dissolvedAt, dissolvedBy: actor.id, dissolveReason: null, version: { increment: 1 } },
      });
      if (result.count === 0) throw new AppError(ErrorMessages[ErrorCode.CONV_007], 409, ErrorCode.CONV_007);

      // be.md §5.5 — KHÔNG đổi `ConversationMember.status` (giữ quyền đọc lịch sử chỉ đọc).
      await this.systemMessage.post(
        {
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId: conversation.workspaceId,
          systemType: "CONVERSATION_DISSOLVED",
          payload: { actorId: actor.id, byPlatform: false },
          dedupeKey: `conv-dissolved:${conversationId}`,
        },
        tx
      );
      await outbox.add(tx, {
        type: "conversation.updated",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.dissolved:conversation:${conversationId}:v1`,
        payload: { event: "dissolved", conversationId, status: "DISSOLVED" },
      });
      // NOTE — be.md §5.5 muốn thêm outbox `conversation.dissolved` RIÊNG để
      // p2-01 kết thúc cuộc gọi đang diễn ra — p2-01 CHƯA tồn tại, KHÔNG có
      // processor nào tiêu thụ (mục 9 "critical facts": đăng ký job không
      // consumer → job kẹt/fail vô ích). Bỏ qua tới khi p2-04/p2-01 build,
      // giống cách `message.outbox-handlers.ts` bỏ qua `fanout.message` cho
      // p1-07 (xem báo cáo cuối tác vụ).
    });

    await invalidateConversationMetaCache(conversationId);
    await permissionService.bumpVersion({ type: "CONVERSATION", id: conversationId });

    return { id: conversationId, status: "DISSOLVED", dissolvedAt };
  }

  /** `POST /admin/conversations/:id/dissolve` (D-06, moderation). */
  async platformDissolve(adminId: string, conversationId: string): Promise<{ id: string; status: "DISSOLVED" }> {
    const conversation = await this.requireGroup(conversationId);
    if (conversation.status === "DISSOLVED") return { id: conversationId, status: "DISSOLVED" };

    await withTransaction(async (tx) => {
      const result = await tx.conversation.updateMany({
        where: { id: conversationId, status: { not: "DISSOLVED" } },
        data: { status: "DISSOLVED", dissolvedAt: new Date(), dissolvedBy: adminId, dissolveReason: "PLATFORM", version: { increment: 1 } },
      });
      if (result.count === 0) return;
      await this.systemMessage.post(
        {
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId: conversation.workspaceId,
          systemType: "CONVERSATION_DISSOLVED",
          payload: { actorId: null, byPlatform: true },
          dedupeKey: `conv-dissolved:${conversationId}`,
        },
        tx
      );
      await outbox.add(tx, {
        type: "conversation.updated",
        aggregateType: "Conversation",
        aggregateId: conversationId,
        queue: "notifications",
        jobName: "conversation.events",
        dedupeKey: `conversation.dissolved:conversation:${conversationId}:platform`,
        payload: { event: "dissolved", conversationId, status: "DISSOLVED" },
      });
    });

    await invalidateConversationMetaCache(conversationId);
    await permissionService.bumpVersion({ type: "CONVERSATION", id: conversationId });
    return { id: conversationId, status: "DISSOLVED" };
  }

  /**
   * `GET /conversations/:id` — dùng chung cho CẢ DIRECT lẫn GROUP (be.md §4
   * chỉ khai 1 route "GET /conversations/:id" cho mọi `kind`). Tính
   * `peer`/`eligibility`/`peerLastReadSeq` qua `buildDirectPeerContext()`
   * (no-op cho GROUP) — xem docstring hàm đó cho lỗi đã sửa.
   */
  async getDetail(viewerId: string, conversationId: string): Promise<ConversationDetail> {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) throw new NotFoundError();
    const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: viewerId } } });
    if (!member) throw new NotFoundError();
    const [lastMessage, { peer, eligibility, peerLastReadSeq, peerReadAt }] = await Promise.all([
      buildLastMessagePreview(conversationId, viewerId, member.hiddenBeforeSeq),
      buildDirectPeerContext(conversation, viewerId),
    ]);
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

  private async requireGroup(conversationId: string): Promise<Conversation> {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation || conversation.kind !== "GROUP") throw new NotFoundError();
    return conversation;
  }
}
