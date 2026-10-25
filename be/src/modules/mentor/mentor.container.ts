import { AuditService } from "../audit-log/audit-log.service";
import { notify } from "../notifications/public";
import { createSystemMessageService } from "../messages/public";
import { createReportPort } from "../moderation/public";
import { createWorkspaceMembershipPort } from "../members/public";
import { createConversationPort } from "../conversations/public";
import { PrismaMentorPostRepository } from "./repositories/mentor-post.repository.prisma";
import { PrismaMentorApplicationRepository } from "./repositories/mentor-application.repository.prisma";
import { PrismaMentorEngagementRepository } from "./repositories/mentor-engagement.repository.prisma";
import { PrismaMentorDirectory } from "./repositories/mentor-directory.prisma";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import type { MentorDeps } from "./services/mentor.deps";
import { PermissionMentorAccess } from "./services/mentor-access";
import { RuntimeMentorSettings } from "./services/mentor-settings";
import { buildMentorServices, type MentorContainer } from "./mentor.services";

export { buildMentorServices, type MentorContainer };

/** Bộ phụ thuộc THẬT (Prisma + cổng sang members/conversations/messages/moderation/notifications). */
export function createPrismaMentorDeps(): MentorDeps {
  const systemMessages = createSystemMessageService();
  return {
    posts: new PrismaMentorPostRepository(),
    applications: new PrismaMentorApplicationRepository(),
    engagements: new PrismaMentorEngagementRepository(),
    directory: new PrismaMentorDirectory(),
    access: new PermissionMentorAccess(),
    membership: createWorkspaceMembershipPort(),
    conversations: createConversationPort(),
    reports: createReportPort(),
    systemMessages: {
      async mentorJoined(conversationId, workspaceId, mentorId, endsAt, dedupeKey) {
        await systemMessages.post({
          scopeType: "CONVERSATION",
          scopeId: conversationId,
          workspaceId,
          systemType: "MENTOR_JOINED",
          payload: { mentorId, endsAt: endsAt.toISOString() },
          dedupeKey,
        });
      },
      async mentorLeft(conversationId, workspaceId, mentorId, reason, dedupeKey) {
        await systemMessages.post({ scopeType: "CONVERSATION", scopeId: conversationId, workspaceId, systemType: "MENTOR_LEFT", payload: { mentorId, reason }, dedupeKey });
      },
    },
    settings: new RuntimeMentorSettings(),
    notifier: {
      async notify(tx, input) {
        await notify(tx, input);
      },
    },
    audit: new AuditService(),
    tx: new PrismaTxRunner(),
    outbox: new PrismaOutboxPort(),
    now: () => new Date(),
  };
}

let cached: MentorContainer | null = null;

/** Singleton lười — routes, job và listener thu hồi quyền dùng CHUNG (worker không import routes nên tự dựng qua đây). */
export function getMentorContainer(): MentorContainer {
  cached ??= buildMentorServices(createPrismaMentorDeps());
  return cached;
}
