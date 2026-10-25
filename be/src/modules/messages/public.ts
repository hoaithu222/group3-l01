/**
 * Barrel CÔNG KHAI của module `messages` (p1-04) — NGOẠI LỆ CÓ CHỦ ĐÍCH của
 * luật "modules KHÔNG import chéo module" (`.claude/rules/architecture.md`
 * "Shared module services"), cùng cơ chế `@modules/assets/public`/
 * `@modules/devices/public`/`@modules/notifications/public`. Module cung cấp
 * `MessageScope` (CHANNEL — p1-03, CONVERSATION — p1-05 sau này) import TỪ
 * ĐÂY để gọi `registerMessageScope()`, KHÔNG import trực tiếp file trong
 * `services/`/`repositories/`.
 *
 * `ISystemMessagePort`/`createSystemMessageService()` — be.md §5.7 gọi đây
 * "core interface ISystemMessagePort" nhưng codebase dùng pattern factory
 * qua `public.ts` (giống `createAssetLinkService()`) thay vì 1 registry
 * get/set riêng — xem docstring `services/system-message.service.ts`.
 */
import { PrismaMessageRepository } from "./repositories/message.repository.prisma";
import { PrismaReactionRepository } from "./repositories/reaction.repository.prisma";
import { PrismaMessageHideRepository } from "./repositories/message-hide.repository.prisma";
import { SystemMessageService } from "./services/system-message.service";
import { MessageService } from "./services/message.service";
import { MessageModerationService } from "./services/message-moderation.service";
import { MessageSendPortImpl } from "./services/message-send.port.impl";
import { PrismaPortUserLookup } from "./repositories/port-user.lookup";
import { AuditService } from "../audit-log/audit-log.service";
import type { MessageModerationPort } from "../../shared/ports/message-moderation.port";
import type { IMessageSendPort } from "../../shared/ports/message-send.port";

export { registerMessageScope, getMessageScope } from "./scope/message-scope.registry";
/** p1-06 be.md §4 `GET /scopes/:scopeType/:scopeId/mentionables` dùng lại middleware THẬT này (không phát minh option mới) — export qua barrel thay vì `modules/mentions` import thẳng file trong `modules/messages/middlewares/`. */
export { requireMessageScope } from "./middlewares/require-message-scope";
/** p1-06 be.md §3 `threadQuerySchema = listMessagesQuerySchema` — tái sử dụng NGUYÊN VẸN. */
export { listMessagesQuerySchema, type ListMessagesQueryDto } from "./dtos";
/** p1-06 be.md §4 `GET /scopes/:scopeType/:scopeId/mentionables` dùng chung khuôn param `scopeType/scopeId` với `GET .../messages`. */
export { scopeParamsSchema, type ScopeParamsDto } from "./dtos";
/**
 * p1-06 be.md §4 `GET /messages/:id/thread` cần `MessageService.get()`/`.list()`
 * (đọc root + reply theo `threadId`, CÙNG cursor beforeSeq/afterSeq/around đã
 * build ở p1-04) — export factory qua barrel thay vì `modules/threads` tự
 * chép lại logic phân trang (giống `createSystemMessageService()`).
 */
export { MessageService };
export type { ListResult, SendResult } from "./services/message.service";
export type { MessageView } from "./entities/message.interface";
export function createMessageService(): MessageService {
  return new MessageService(
    new PrismaMessageRepository(),
    new PrismaReactionRepository(),
    new PrismaMessageHideRepository()
  );
}
/** p1-05 be.md §5.6 preview — CONVERSATION list dùng lại (docstring `message-projection.ts` đã dành sẵn "dùng bởi adapter CONVERSATION tương lai"). */
export { excerptOf } from "./services/message-projection";
export type {
  MessageScope,
  MessageScopeReadAccess,
  MessageScopeWriteAccess,
  MessageScopeCapabilities,
  MessageScopeViewerContext,
  MessageCommittedInfo,
  MessageActivityInfo,
  MessageActivityMention,
  MentionValidationInput,
  MentionValidationResult,
} from "./scope/message-scope.interface";
export type { MessageScopeTypeValue, Message } from "./entities/message.interface";
export type { ISystemMessagePort, SystemMessagePostInput, SystemMessageUpdateInput } from "./services/system-message.service";

/** Factory tiện dụng (Prisma) — module gọi tự `new` trong `{module}.routes.ts`/`{module}.service.ts` của chính nó, giống `createAssetLinkService()`. */
export function createSystemMessageService(): SystemMessageService {
  return new SystemMessageService(new PrismaMessageRepository());
}

/**
 * p7-04 `IMessageSendPort` (`shared/ports/message-send.port.ts`) — module khác (`chat-extensions`: khảo sát/tin hẹn giờ/nhắc lại/chuyển tin) gửi và đọc tin THAY người dùng
 * qua CHÍNH `MessageService` (không nhân bản logic gửi tin, không import `messages` nội bộ).
 */
export type { IMessageSendPort } from "../../shared/ports/message-send.port";
export function createMessageSendPort(): IMessageSendPort {
  return new MessageSendPortImpl(createMessageService(), new PrismaMessageRepository(), new PrismaPortUserLookup());
}

/**
 * p1-08 `MessageModerationPort` (`shared/ports/message-moderation.port.ts`) — `modules/moderation`
 * gỡ tin/xem ngữ cảnh ±3 qua đây, KHÔNG import `messages` nội bộ (gỡ = `MessageService.tombstone` MODERATION + audit).
 */
export type { MessageModerationPort } from "../../shared/ports/message-moderation.port";
export function createMessageModerationPort(): MessageModerationPort {
  return new MessageModerationService(new PrismaMessageRepository(), createMessageService(), new AuditService());
}
