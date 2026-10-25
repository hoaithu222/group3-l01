import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { createSystemMessageService } from "../../messages/public";
import { PrismaConversationRepository } from "../repositories/conversation.repository.prisma";
import { DirectConversationService } from "../services/direct-conversation.service";
import { ConversationHooksService } from "../services/conversation-hooks.service";

// DI riêng của file job (KHÔNG dùng `getConversationHooks()` từ registry) —
// worker.ts (tiến trình worker riêng) KHÔNG import `router.ts` nên các
// side-effect đăng ký ở đó (`registerConversationModule()`) có thể chưa chạy
// khi job này thực thi; mirror `channel-orphan-check.job.ts` (tự `new` lại
// dependency thay vì trông cậy instance do routes tạo).
const directService = new DirectConversationService(new PrismaConversationRepository());
const hooksService = new ConversationHooksService(directService, createSystemMessageService());

interface WorkspaceMemberRemovedPayload {
  workspaceId: string;
  userId: string;
}

/**
 * `conversations.workspace-member-removed` (queue `notifications`) — be.md
 * §5.9/§7. Kích hoạt bởi outbox `conversation.workspace-member-removed` ghi
 * trong CÙNG transaction ở `modules/members/services/membership-lifecycle.service.ts#revokeInTx()`
 * (dòng outbox riêng, `jobName` khác — mirror đúng cách `channel.membership-revoked`
 * đã làm cho p1-03). `dedupeKey` dùng `Date.now()` thay vì `v<permVersion>` như
 * be.md gợi ý — cùng lý do đã ghi ở `membership-lifecycle.service.ts` (CAS
 * `status` trên `WorkspaceMembership` đã tự chặn đúng 1 lần chuyển trạng thái
 * thật commit, không cần khoá theo permVersion để idempotent).
 */
registerJob("notifications", "conversations.workspace-member-removed", async (job) => {
  const { workspaceId, userId } = job.data as WorkspaceMemberRemovedPayload;
  await hooksService.onWorkspaceMemberRemoved(workspaceId, userId);
  logger.info("[conversations.workspace-member-removed] Đã xử lý", { workspaceId, userId });
});
