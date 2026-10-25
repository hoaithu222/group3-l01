/**
 * Barrel CÔNG KHAI của module `conversations` (p1-05) — NGOẠI LỆ CÓ CHỦ ĐÍCH
 * của luật "modules KHÔNG import chéo module" (`.claude/rules/architecture.md`
 * "Shared module services"), cùng cơ chế `@modules/assets/public`/
 * `@modules/messages/public`. `modules/admin-conversations` (be.md §1, module
 * RIÊNG theo file tree, không nằm trong `modules/conversations/` như
 * `admin-channels.routes.ts` của kênh) cần `platformDissolve()` — dùng LẠI
 * đúng transaction đã có ở `GroupConversationService` thay vì chép lại logic
 * giải tán ở nơi khác (tránh 2 nơi lệch nhau khi sửa).
 */
import { PrismaConversationRepository } from "./repositories/conversation.repository.prisma";
import { GroupConversationService } from "./services/group-conversation.service";
import { createAssetLinkService } from "../assets/public";
import { createSystemMessageService } from "../messages/public";
import type { ConversationAdminPort } from "../../shared/ports/moderation-actions.port";
import type { ConversationPort } from "../../shared/ports/conversation-group.port";
import { ConversationHooksService } from "./services/conversation-hooks.service";
import { DirectConversationService } from "./services/direct-conversation.service";
import { ConversationPortImpl } from "./adapters/conversation.port.impl";
import { MemberContactPortImpl } from "./adapters/member-contact.port.impl";
import type { MemberContactPort } from "../../shared/ports/member-contact.port";

export type { GroupConversationService } from "./services/group-conversation.service";

/** p1-02 `MemberContactPort` — `members` tính `MemberCard.actions.canMessage/canCall` bằng đúng luật D-16 của `conversations` (một nguồn sự thật). */
export function createMemberContactPort(): MemberContactPort {
  return new MemberContactPortImpl();
}

/** Factory tiện dụng (Prisma) — `admin-conversations.routes.ts` tự `new` trong DI wiring, giống `createAssetLinkService()`. */
export function createGroupConversationService(): GroupConversationService {
  return new GroupConversationService(new PrismaConversationRepository(), createAssetLinkService(), createSystemMessageService());
}

/** p6-03 `ConversationPort` — `mentor` tạo nhóm chat "Cố vấn · <bài>" (cho phép khách chỉ định) và gỡ cố vấn khi kết thúc. */
export function createConversationPort(): ConversationPort {
  const hooks = new ConversationHooksService(new DirectConversationService(new PrismaConversationRepository()), createSystemMessageService());
  return new ConversationPortImpl(createSystemMessageService(), hooks);
}

/** p1-08 `ConversationAdminPort` — `modules/moderation` giải tán nhóm chat cấp nền tảng (dùng lại `platformDissolve`, idempotent). */
export function createConversationAdminPort(): ConversationAdminPort {
  const service = createGroupConversationService();
  return {
    async platformDissolve(adminId, conversationId) {
      await service.platformDissolve(adminId, conversationId);
    },
  };
}
