import { AppError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { AuthUser } from "../../../core/types/express";
import type {
  MessageForModeration,
  MessageModerationPort,
  ModerationMessageRef,
  ModerationScopeType,
  RemoveByModeratorInput,
  RemoveByModeratorResult,
} from "../../../shared/ports/message-moderation.port";
import { getMessageScope } from "../scope/message-scope.registry";
import type { Message } from "../entities/message.interface";
import type { IMessageRepository } from "../repositories/message.repository.interface";
import { excerptOf } from "./message-projection";
import type { MessageService } from "./message.service";

/** Cổng ghi audit — thoả mãn bởi `AuditService` (module audit-log) qua structural typing. */
export interface ModerationAuditRecorder {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    workspaceId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

/** Excerpt tối đa cho preview hàng đợi (grapheme). */
const PREVIEW_MAX_GRAPHEMES = 120;

/**
 * `MessageModerationPort` (p1-08) cài đặt trên engine `messages` — gỡ tin dùng lại
 * NGUYÊN `MessageService.tombstone(mode "MODERATION", authorOnly=false)` (be.md p1-04 §5.4
 * dành sẵn cho p1-08) rồi ghi audit `message.moderator-remove`. Mọi truy vấn kiểm quyền
 * đi qua registry `MessageScope` (KHÔNG import `channels`/`conversations`).
 *
 * Lưu ý: tombstone XOÁ nội dung gốc (`content/attachments = null/[]`) khỏi DB nên
 * `contextAround` không thể "hiện nội dung gốc của tin đã gỡ" như README p1-08 §3.3 phác
 * thảo — tin đã gỡ luôn `content: null` (an toàn hơn cho riêng tư; ghi ở README p1-08 §10).
 */
export class MessageModerationService implements MessageModerationPort {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly messageService: Pick<MessageService, "tombstone">,
    private readonly audit: ModerationAuditRecorder
  ) {}

  async findReadable(viewer: AuthUser, messageId: string): Promise<ModerationMessageRef | null> {
    const message = await this.messageRepo.findById(messageId);
    if (!message) return null;
    if (!(await this.canReadScope(viewer, message.scopeType, message.scopeId))) return null;
    return toRef(message);
  }

  async findByIds(ids: string[]): Promise<ModerationMessageRef[]> {
    if (ids.length === 0) return [];
    const rows = await this.messageRepo.findByIds(ids);
    return rows.map(toRef);
  }

  async canReadScope(viewer: AuthUser, scopeType: ModerationScopeType, scopeId: string): Promise<boolean> {
    const scope = getMessageScope(scopeType);
    if (!scope) return false;
    const access = await scope.canRead(viewer, scopeId);
    return access.visible;
  }

  async canModerateScope(viewer: AuthUser, scopeType: ModerationScopeType, scopeId: string): Promise<boolean> {
    const scope = getMessageScope(scopeType);
    if (!scope) return false;
    const ctx = await scope.viewerContext(viewer, scopeId);
    return ctx.capabilities.canModerate;
  }

  async removeByModerator(input: RemoveByModeratorInput): Promise<RemoveByModeratorResult> {
    const message = await this.messageRepo.findById(input.messageId);
    if (!message) throw new NotFoundError();
    // Tin hệ thống do server ghi (D-… "client không thể giả") — không phải nội dung người dùng để gỡ. Tin khảo sát (`POLL`, p7-04) là nội dung người dùng: gỡ được.
    if (message.kind === "SYSTEM") {
      throw new AppError(ErrorMessages[ErrorCode.MOD_003], 400, ErrorCode.MOD_003);
    }
    if (message.deletedAt) {
      return { messageId: message.id, deletedAt: message.deletedAt, alreadyDeleted: true };
    }

    const deletedAt = await this.messageService.tombstone(input.messageId, input.actorId, "MODERATION", input.reason, false);
    await this.audit.record({
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: "message.moderator-remove",
      targetType: "Message",
      targetId: message.id,
      workspaceId: message.workspaceId ?? undefined,
      reason: input.reason,
      metadata: {
        source: input.source,
        scopeType: message.scopeType,
        scopeId: message.scopeId,
        authorId: message.authorId,
        ...(input.reportId && { reportId: input.reportId }),
      },
    });
    return { messageId: message.id, deletedAt, alreadyDeleted: false };
  }

  async contextAround(messageId: string, size: number): Promise<MessageForModeration[]> {
    const target = await this.messageRepo.findById(messageId);
    if (!target) return [];
    const base = { scopeType: target.scopeType, scopeId: target.scopeId, threadKey: target.threadKey, limit: size };
    const [before, after] = await Promise.all([
      this.messageRepo.listBySeq({ ...base, seqBelow: target.seq, order: "desc" }),
      this.messageRepo.listBySeq({ ...base, seqAbove: target.seq, order: "asc" }),
    ]);
    return [...before.reverse(), target, ...after].map((m) => toModerationView(m, m.id === target.id));
  }
}

function toRef(message: Message): ModerationMessageRef {
  return {
    id: message.id,
    scopeType: message.scopeType,
    scopeId: message.scopeId,
    workspaceId: message.workspaceId,
    authorId: message.authorId,
    kind: message.kind,
    deleted: message.deletedAt !== null,
    excerpt: message.deletedAt ? "" : excerptOf(message, PREVIEW_MAX_GRAPHEMES),
    createdAt: message.createdAt,
  };
}

function toModerationView(message: Message, isTarget: boolean): MessageForModeration {
  const deleted = message.deletedAt !== null;
  return {
    id: message.id,
    seq: message.seq,
    authorId: message.authorId,
    kind: message.kind,
    content: deleted ? null : message.content,
    attachments: deleted ? [] : message.attachments.map((a) => ({ kind: a.kind, name: a.name, mime: a.mime })),
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deleted,
    deletedAt: message.deletedAt,
    isTarget,
  };
}
