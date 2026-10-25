import { registerJob } from "../../../infrastructure/queue";
import { logger } from "../../../infrastructure/logger";
import { createSystemMessageService } from "../../messages/public";
import { PrismaConversationRepository } from "../repositories/conversation.repository.prisma";
import { DirectConversationService } from "../services/direct-conversation.service";
import { ConversationHooksService } from "../services/conversation-hooks.service";

// DI riêng của file job (KHÔNG dùng `getConversationHooks()` từ registry) —
// giống `workspace-member-removed.job.ts`: worker.ts (tiến trình worker riêng)
// KHÔNG import `router.ts` nên `registerConversationModule()` có thể chưa chạy.
const directService = new DirectConversationService(new PrismaConversationRepository());
const hooksService = new ConversationHooksService(directService, createSystemMessageService());

interface WorkspaceStatusPayload {
  workspaceId: string;
}

/**
 * `conversations.workspace-archived` / `conversations.workspace-restored` (queue
 * `notifications`) — be.md p1-05 §5.9/§7. Kích hoạt bởi 2 dòng outbox riêng do
 * `modules/workspaces/services/workspace-lifecycle.service.ts#archiveInTx()/restoreInTx()`
 * ghi trong CÙNG transaction đổi trạng thái workspace (jobName khác
 * `workspace.events` — mỗi cặp queue/jobName chỉ 1 processor).
 *
 * Idempotent: `onWorkspaceArchived` chỉ chạm GROUP đang ACTIVE, `onWorkspaceRestored`
 * chỉ chạm GROUP đang ARCHIVED (không bao giờ mở lại DISSOLVED) → retry/xử lý lặp vô hại.
 */
registerJob("notifications", "conversations.workspace-archived", async (job) => {
  const { workspaceId } = job.data as WorkspaceStatusPayload;
  await hooksService.onWorkspaceArchived(workspaceId);
  logger.info("[conversations.workspace-archived] Đã chuyển nhóm chat của workspace sang chỉ đọc", { workspaceId });
});

registerJob("notifications", "conversations.workspace-restored", async (job) => {
  const { workspaceId } = job.data as WorkspaceStatusPayload;
  await hooksService.onWorkspaceRestored(workspaceId);
  logger.info("[conversations.workspace-restored] Đã mở lại nhóm chat của workspace", { workspaceId });
});
