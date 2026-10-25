import { v5 as uuidv5 } from "uuid";
import { AppError, ForbiddenError, NotFoundError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { getConversationHooks } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { getMessageScope } from "../scope/message-scope.registry";
import type { IMessageRepository } from "../repositories/message.repository.interface";
import type { MessageService } from "./message.service";
import type { ForwardMessageDto, ForwardTargetDto } from "../dtos/forward-message.dto";
import type { MessageScopeTypeValue } from "../entities/message.interface";

/** Namespace CỐ ĐỊNH cho `uuidv5` (be.md §5.6) — chỉ cần ổn định qua thời gian, không cần là DNS/URL thật. */
const FORWARD_NAMESPACE = "9d3f7a2e-6b41-4c8a-9c5d-2b7e4a1f0d63";

export type ForwardStatus = "SENT" | "DENIED" | "FAILED";

export interface ForwardResultItem {
  target: ForwardTargetDto;
  status: ForwardStatus;
  messageId?: string;
  scopeType?: string;
  scopeId?: string;
  code?: string;
}

function targetKeyOf(target: ForwardTargetDto): string {
  return "directUserId" in target ? `direct:${target.directUserId}` : `${target.scopeType}:${target.scopeId}`;
}

/** be.md §5.6 — chuyển tiếp tuần tự tới ≤ 10 đích, idempotent theo `clientMessageId` dẫn xuất `uuidv5`, không rollback đích khác khi 1 đích lỗi. */
export class MessageForwardService {
  constructor(
    private readonly messageService: MessageService,
    private readonly messageRepo: IMessageRepository
  ) {}

  async forward(user: AuthUser, sourceId: string, dto: ForwardMessageDto): Promise<{ results: ForwardResultItem[] }> {
    const source = await this.messageRepo.findById(sourceId);
    if (!source) throw new NotFoundError();

    const scope = getMessageScope(source.scopeType);
    if (!scope) throw new NotFoundError();
    const access = await scope.canRead(user, source.scopeId);
    if (!access.visible) throw new NotFoundError();
    if (source.kind !== "USER" || source.deletedAt) {
      throw new AppError(ErrorMessages[ErrorCode.MSG_015], 400, ErrorCode.MSG_015);
    }

    const results: ForwardResultItem[] = [];

    for (const target of dto.targets) {
      const targetKey = targetKeyOf(target);
      try {
        let scopeType: MessageScopeTypeValue;
        let scopeId: string;

        if ("directUserId" in target) {
          // item 6 báo cáo p1-05 — `getOrCreateDirect()` giờ đã sẵn sàng qua
          // `ConversationHooks` (`core/permission/conversation-hooks.port.ts`,
          // đăng ký bởi `modules/conversations/index.ts#registerConversationModule()`
          // lúc `router.ts` boot, mirror `registerChannelModule()`). `null`
          // (chưa đăng ký — vd script/test không boot đủ router) → giữ
          // `MSG_017` làm mã dự phòng (be.md §5.6 "pick a sensible placeholder
          // code, document it") thay vì crash.
          const hooks = getConversationHooks();
          if (!hooks) {
            results.push({ target, status: "DENIED", code: ErrorCode.MSG_017 });
            continue;
          }
          const direct = await hooks.getOrCreateDirect(user.id, target.directUserId);
          scopeType = "CONVERSATION";
          scopeId = direct.conversationId;
        } else {
          scopeType = target.scopeType;
          scopeId = target.scopeId;
        }

        if (dto.note && dto.note.trim() !== "") {
          const noteClientMessageId = uuidv5(`fwd:${dto.forwardRequestId}:${targetKey}:note`, FORWARD_NAMESPACE);
          await this.messageService.send(user, scopeType, scopeId, {
            clientMessageId: noteClientMessageId,
            content: dto.note,
            attachments: [],
            mentions: [],
          });
        }

        const clientMessageId = uuidv5(`fwd:${dto.forwardRequestId}:${targetKey}`, FORWARD_NAMESPACE);
        const sendResult = await this.messageService.sendForward(user, scopeType, scopeId, {
          clientMessageId,
          content: source.content,
          attachments: source.attachments,
          forwardedFrom: {
            messageId: source.id,
            scopeType: source.scopeType,
            authorId: source.authorId,
            createdAt: source.createdAt,
          },
        });
        results.push({
          target,
          status: "SENT",
          messageId: sendResult.view.id,
          scopeType,
          scopeId,
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          results.push({ target, status: "DENIED", code: ErrorCode.RES_001 });
        } else if (err instanceof ForbiddenError || (err instanceof AppError && err.statusCode === 403)) {
          results.push({ target, status: "DENIED", code: err instanceof AppError ? err.errorCode : ErrorCode.AUTH_005 });
        } else if (err instanceof AppError) {
          results.push({ target, status: "FAILED", code: err.errorCode });
        } else {
          results.push({ target, status: "FAILED", code: ErrorCode.SYS_500 });
        }
      }
    }

    return { results };
  }
}
