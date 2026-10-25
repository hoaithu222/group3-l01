import type { AuthUser } from "../../../core/types/express";
import type { NotifyInput } from "../../notifications/public";
import type { WorkspaceMembershipPort } from "../../../shared/ports/workspace-membership.port";
import type { ConversationPort } from "../../../shared/ports/conversation-group.port";
import type { ReportPort } from "../../../shared/ports/report.port";
import type { IMentorPostRepository } from "../repositories/mentor-post.repository.interface";
import type { IMentorApplicationRepository } from "../repositories/mentor-application.repository.interface";
import type { IMentorEngagementRepository } from "../repositories/mentor-engagement.repository.interface";
import type { IMentorDirectory } from "../repositories/mentor-directory.interface";
import type { IOutboxPort, ITxRunner, TxHandle } from "../repositories/tx";
import type { IMentorSettings } from "./mentor-settings";

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";

/** Kiểm quyền qua `permissionService` (bản thật) — tách cổng để unit test không cần Redis/resolver. */
export interface IMentorAccess {
  /** Vai trò của người xem trong nhóm (`null` = không thấy nhóm). */
  workspaceRole(user: AuthUser, workspaceId: string): Promise<WorkspaceRole | null>;
  /** Kênh riêng tư: người duyệt phải QUẢN LÝ được kênh mới chỉ định cho cố vấn (`MENTOR_008`). */
  canManageChannel(user: AuthUser, channelId: string): Promise<boolean>;
}

/** Ghi thông báo TRONG transaction (`notify()` của p0-06). */
export interface IMentorNotifier {
  notify(tx: TxHandle, input: NotifyInput): Promise<void>;
}

/** `AuditService.record` (structural typing — reuse-first.md). */
export interface AuditRecorder {
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

/** Tin hệ thống (`ISystemMessagePort.post` của `messages`) — chỉ phần mentor cần: `MENTOR_JOINED` / `MENTOR_LEFT` (p6-03 be.md §5). */
export interface IMentorSystemMessages {
  mentorJoined(conversationId: string, workspaceId: string, mentorId: string, endsAt: Date, dedupeKey: string): Promise<void>;
  mentorLeft(conversationId: string, workspaceId: string, mentorId: string, reason: "EXPIRED" | "LEFT" | "REMOVED", dedupeKey: string): Promise<void>;
}

export interface MentorDeps {
  posts: IMentorPostRepository;
  applications: IMentorApplicationRepository;
  engagements: IMentorEngagementRepository;
  directory: IMentorDirectory;
  access: IMentorAccess;
  membership: WorkspaceMembershipPort;
  conversations: ConversationPort;
  reports: ReportPort;
  systemMessages: IMentorSystemMessages;
  /** Cài đặt runtime (`SystemConfig`): số ngày mặc định của một đợt. */
  settings: IMentorSettings;
  notifier: IMentorNotifier;
  audit: AuditRecorder;
  tx: ITxRunner;
  outbox: IOutboxPort;
  now: () => Date;
}
