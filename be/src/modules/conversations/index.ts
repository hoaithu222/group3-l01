/**
 * Barrel của module `conversations` (p1-05) — mirror `modules/channels/index.ts`.
 * `router.ts` gọi `registerConversationModule()` NGAY SAU khi import
 * `conversations.routes.ts` (side-effect boot, phải chạy trước request đầu
 * tiên chạm `registry.get("CONVERSATION")`/`getConversationHooks()`).
 */
import { createConversationMessageScopeAdapter } from "./scope/conversation.message-scope";
import { registerMessageScope, createSystemMessageService } from "../messages/public";
import { registerConversationHooks, registerReadReceiptPublisher } from "../../core/permission";
import { PrismaConversationRepository } from "./repositories/conversation.repository.prisma";
import { DirectConversationService } from "./services/direct-conversation.service";
import { ConversationHooksService } from "./services/conversation-hooks.service";
import { emitReadReceipt } from "./services/read-receipt.service";

export function registerConversationModule(): void {
  registerMessageScope("CONVERSATION", createConversationMessageScopeAdapter());

  const directService = new DirectConversationService(new PrismaConversationRepository());
  registerConversationHooks(new ConversationHooksService(directService, createSystemMessageService()));

  // p1-07 — `ReadMarkerService` (modules/read-state) phát `read:receipt` qua cổng này khi mốc đọc hội thoại tiến;
  // `emitReadReceipt` tự tôn trọng `User.privacy.readReceipts` của người đọc (be.md p1-05 §5.8).
  registerReadReceiptPublisher({ publish: emitReadReceipt });
}
