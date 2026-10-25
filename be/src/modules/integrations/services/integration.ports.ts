import type { IntegrationTargetScopeType } from "../../../core/constants/integration";
import type { NotifyInput } from "../../notifications/public";

/**
 * Các CỔNG mà dịch vụ tích hợp dùng để chạm vào phần còn lại của hệ thống (đọc dữ liệu module khác, quyền, thông báo, realtime, xếp job) — tách khỏi
 * dịch vụ để test bằng đồ giả (không DB/Redis/mạng). Cài đặt thật ở `integration.adapters.ts`.
 */

export interface TargetChannelInfo {
  id: string;
  workspaceId: string;
  name: string;
  type: string;
  visibility: string;
  status: string;
}

export interface TargetConversationInfo {
  id: string;
  workspaceId: string | null;
  kind: string;
  title: string | null;
  status: string;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  status: string;
  defaultChannelId: string | null;
}

/** Đọc CHỈ-ĐỌC dữ kiện module khác (kênh, nhóm chat, workspace, thành viên) — quyền vẫn do `PermissionService`. */
export interface IIntegrationDirectory {
  getChannel(channelId: string): Promise<TargetChannelInfo | null>;
  getConversation(conversationId: string): Promise<TargetConversationInfo | null>;
  getWorkspace(workspaceId: string): Promise<WorkspaceInfo | null>;
  /** Tên nhiều workspace/người dùng một lượt (danh sách admin) — id không có trong kết quả = đã xoá. */
  getWorkspaces(workspaceIds: string[]): Promise<Map<string, WorkspaceInfo>>;
  getUserNames(userIds: string[]): Promise<Map<string, string>>;
  /** Người dùng đang ACTIVE ở workspace với một trong các vai trò. */
  listMemberIdsByRole(workspaceId: string, roles: Array<"OWNER" | "ADMIN">): Promise<string[]>;
}

export interface WorkspaceAccess {
  /** `false` = không thấy workspace (404 trung tính). */
  visible: boolean;
  role: string | null;
}

export interface IIntegrationAccess {
  workspaceAccess(userId: string, workspaceId: string): Promise<WorkspaceAccess>;
  /** Người dùng có quyền GHI vào đích (kênh: `channel.message.send`; nhóm chat: `conversation.message.send`). */
  canWriteTarget(userId: string, scopeType: IntegrationTargetScopeType, scopeId: string): Promise<boolean>;
  canReadTarget(userId: string, scopeType: IntegrationTargetScopeType, scopeId: string): Promise<boolean>;
}

export interface IntegrationErrorNotice {
  /** Id `Integration` hoặc `UserIntegration` (khoá dedupe). */
  subjectId: string;
  workspaceId: string | null;
  provider: string;
  reason: string;
  /** Mốc thời gian làm khoá dedupe: cùng lỗi ở hai thời điểm khác nhau là hai thông báo. */
  at: Date;
  recipientIds: string[];
}

/** Thông báo `INTEGRATION_ERROR` (hộp thư + push) — cài đặt bằng `notify()` trong transaction. */
export interface IIntegrationNotifier {
  integrationError(notice: IntegrationErrorNotice): Promise<void>;
}

export interface IntegrationUpdatedPayload {
  integrationId: string;
  workspaceId: string;
  status: string;
  statusReason: string | null;
  lastEventAt: string | null;
  version: number;
}

/** Realtime `integration:updated` tới OWNER/ADMIN của workspace (`user:{id}`). */
export interface IIntegrationEmitter {
  integrationUpdated(userIds: string[], payload: IntegrationUpdatedPayload): void;
}

export interface CalendarSyncJob {
  meetingId: string;
  userId: string;
  version: number;
  change: "UPSERT" | "DELETE";
}

/** Dữ kiện cuộc họp cần để đẩy lên lịch ngoài (đọc CHỈ-ĐỌC bảng `Meeting`/`MeetingAttendee` của p2-04 — không import `modules/meetings`). */
export interface CalendarMeetingInfo {
  id: string;
  code: string;
  title: string;
  agenda: string | null;
  location: string | null;
  externalUrl: string | null;
  startAt: Date;
  endAt: Date;
  timezone: string;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  deleted: boolean;
  version: number;
  /** Người tham dự còn hiệu lực (chưa bị xoá) và KHÔNG từ chối — đây là những người có sự kiện trên lịch của mình. */
  attendeeIds: string[];
}

export interface IMeetingCalendarReader {
  getMeeting(meetingId: string): Promise<CalendarMeetingInfo | null>;
  /** Cuộc họp chưa kết thúc (`endAt > from`, SCHEDULED/LIVE) mà người dùng đang tham dự — backfill ngay sau khi nối lịch. */
  listUpcomingForUser(userId: string, from: Date, limit: number): Promise<Array<{ meetingId: string; version: number }>>;
  /** `endAt` của các cuộc họp (dọn sự kiện TƯƠNG LAI khi ngắt kết nối). Id không có = cuộc họp đã xoá hẳn. */
  endTimes(meetingIds: string[]): Promise<Map<string, Date>>;
}

/** Xếp job nền (luôn bọc timeout, không ném khi Redis lỗi ở đường phản hồi request). */
export interface IIntegrationJobs {
  /** Hẹn làm mới token trước `expiresAt − lead`. `kind` phân biệt kết nối cấp workspace / cá nhân. */
  scheduleTokenRefresh(kind: "WORKSPACE" | "USER", id: string, expiresAt: Date): Promise<void>;
  enqueueCalendarSync(job: CalendarSyncJob): Promise<void>;
  enqueueTargetRecheck(input: { scopeType: string; scopeId: string; userIds: string[] }): Promise<void>;
  /** Dọn sự kiện tương lai trên lịch ngoài + thu hồi token sau khi người dùng ngắt kết nối. */
  enqueueCalendarCleanup(userIntegrationId: string): Promise<void>;
}

/** Kho cờ nhà cung cấp trong `SystemConfig` (khoá `integrations`): đọc giá trị ghi đè + version, ghi lại có kiểm CAS/lý do/audit (qua `SystemConfigService`). */
export interface IProviderConfigStore {
  read(): Promise<{ stored: Record<string, unknown>; version: number }>;
  write(value: Record<string, unknown>, expectedVersion: number, reason: string, actor: { id: string; role?: string }): Promise<void>;
}

/** Ghi audit — thoả mãn bởi `AuditService` (structural typing, giống `system-config`). */
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

export type { NotifyInput };
