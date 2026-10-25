import { NotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { logger } from "../../../infrastructure/logger";
import type {
  IMessageSendPort,
  MessageDraftInput,
  NormalizedDraft,
  PortCreatedMessage,
  PortReadableMessage,
  PortScopeType,
  PortSourceRef,
  PortWriteAccess,
  SendMessageAsInput,
  SendMessageAsResult,
} from "../../../shared/ports/message-send.port";
import type { IPortUserLookup } from "../repositories/port-user.lookup";
import type { IMessageRepository } from "../repositories/message.repository.interface";
import { getMessageScope } from "../scope/message-scope.registry";
import type { MessageScope } from "../scope/message-scope.interface";
import type { Message } from "../entities/message.interface";
import type { MessageService } from "./message.service";

const toCreated = (m: Message): PortCreatedMessage => ({
  id: m.id,
  scopeType: m.scopeType,
  scopeId: m.scopeId,
  workspaceId: m.workspaceId,
  threadId: m.threadId,
  authorId: m.authorId,
  kind: m.kind,
  createdAt: m.createdAt,
});

/**
 * Cài đặt `IMessageSendPort` (p7-04, `shared/ports/message-send.port.ts`) bằng service messages CÓ SẴN: `send()` đi CHÍNH `MessageService.send()` (quyền ghi, chuẩn hoá, mention, thread, idempotency,
 * outbox) và `validateDraft()` dùng CHUNG các bước chuẩn hoá của `send()` — không có logic gửi tin nào bị nhân bản ở đây. Lớp này chỉ dựng lại `AuthUser` từ `userId` (job không có request) và ánh xạ kiểu.
 */
export class MessageSendPortImpl implements IMessageSendPort {
  constructor(
    private readonly messages: Pick<MessageService, "send" | "validateDraft">,
    private readonly repo: Pick<IMessageRepository, "findById" | "addSourceRef">,
    private readonly users: IPortUserLookup,
    private readonly scopeOf: (scopeType: PortScopeType) => MessageScope | undefined = getMessageScope
  ) {}

  async send(input: SendMessageAsInput): Promise<SendMessageAsResult> {
    const user = await this.requireUser(input.authorId);
    const { onCreated } = input;
    const { view, replayed } = await this.messages.send(
      user,
      input.scopeType,
      input.scopeId,
      {
        clientMessageId: input.clientMessageId,
        ...(input.content !== undefined ? { content: input.content } : {}),
        attachments: (input.attachmentAssetIds ?? []).map((assetId) => ({ assetId })),
        mentions: input.mentions ?? [],
        ...(input.replyToId ? { replyToId: input.replyToId } : {}),
        ...(input.threadId ? { threadRootId: input.threadId } : {}),
      },
      { kind: input.kind ?? "USER", ...(onCreated ? { onCreated: (tx, message) => onCreated(tx, toCreated(message)) } : {}) }
    );
    return { view, replayed };
  }

  async canWrite(userId: string, scopeType: PortScopeType, scopeId: string): Promise<PortWriteAccess> {
    const user = await this.users.findActive(userId);
    const scope = this.scopeOf(scopeType);
    if (!user || !scope) return { readable: false, allowed: false, workspaceId: null };
    const access = await scope.canWrite(user, scopeId);
    return { readable: access.visible, allowed: access.visible && access.allowed, workspaceId: access.visible ? access.workspaceId : null };
  }

  async getReadable(userId: string, messageId: string): Promise<PortReadableMessage | null> {
    const [user, message] = await Promise.all([this.users.findActive(userId), this.repo.findById(messageId)]);
    if (!user || !message) return null;
    const scope = this.scopeOf(message.scopeType);
    if (!scope) return null;
    const access = await scope.canRead(user, message.scopeId);
    if (!access.visible) return null;
    const viewer = await scope.viewerContext(user, message.scopeId);
    // "Xoá phía tôi" (hội thoại): tin gốc trước mốc ẩn của người này coi như không thấy — không lộ qua đường chuyển thành thẻ/nhắc lại.
    if (message.threadKey === "root" && message.seq <= viewer.hiddenBeforeSeq) return null;
    const deleted = message.deletedAt !== null;
    return {
      ...toCreated(message),
      content: deleted ? null : message.content,
      attachments: deleted ? [] : message.attachments.map((a) => ({ assetId: a.assetId, kind: a.kind, name: a.name, mime: a.mime, size: a.size })),
      deletedAt: message.deletedAt,
      sourceRefs: message.sourceRefs,
      myPermissions: { canModerate: viewer.capabilities.canModerate, canWrite: viewer.capabilities.canWrite },
    };
  }

  async validateDraft(userId: string, scopeType: PortScopeType, scopeId: string, draft: MessageDraftInput): Promise<NormalizedDraft> {
    const user = await this.requireUser(userId);
    const checked = await this.messages.validateDraft(user, scopeType, scopeId, {
      ...(draft.content !== undefined ? { content: draft.content } : {}),
      attachments: (draft.attachmentAssetIds ?? []).map((assetId) => ({ assetId })),
      mentions: draft.mentions ?? [],
      ...(draft.replyToId ? { replyToId: draft.replyToId } : {}),
    });
    return { content: checked.content, mentions: checked.mentions, attachmentAssetIds: checked.attachmentAssetIds, replyToId: checked.replyToId };
  }

  async appendSourceRef(messageId: string, ref: PortSourceRef): Promise<void> {
    const outcome = await this.repo.addSourceRef(messageId, ref);
    if (outcome === "NOT_FOUND") throw new NotFoundError();
    // Đầy 20 tham chiếu: thẻ/tài liệu ĐÃ tạo rồi nên không làm hỏng yêu cầu — chỉ mất huy hiệu "đã chuyển" thứ 21 trên tin.
    if (outcome === "FULL") logger.warn("[messages] Tin đã đạt số tham chiếu nguồn tối đa, bỏ qua tham chiếu mới", { messageId, kind: ref.kind });
  }

  private async requireUser(userId: string): Promise<AuthUser> {
    const user = await this.users.findActive(userId);
    if (!user) throw new NotFoundError();
    return user;
  }
}
