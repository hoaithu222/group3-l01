import type { Report } from "../entities/report.interface";
import type { IModerationDirectory } from "../repositories/moderation-directory.repository.interface";

/** Phần của báo cáo/nhóm báo cáo đủ để tính "ai xử lý theo phạm vi" — `Report` lẫn `ReportGroup` đều thoả. */
export type HandlerScope = Pick<Report, "targetType" | "scopeType" | "scopeId" | "scopeIsPrivate" | "workspaceId">;

/**
 * Người xử lý theo PHẠM VI của báo cáo (không lưu danh sách — tính lại theo dữ liệu hiện tại, be.md p1-08 §2): tin nhóm chat → OWNER/ADMIN nhóm;
 * tin kênh PRIVATE → MANAGER kênh; còn lại (kênh public, USER/CHANNEL có ngữ cảnh) → OWNER/ADMIN workspace. Dùng chung cho thông báo
 * "báo cáo mới" (`report.events`) và nhắc báo cáo tồn đọng (`reports.stale-reminder`).
 */
export async function listScopeHandlerIds(directory: IModerationDirectory, report: HandlerScope): Promise<string[]> {
  if (report.targetType === "MESSAGE" && report.scopeType === "CONVERSATION" && report.scopeId) {
    return directory.listConversationAdminIds(report.scopeId);
  }
  if (report.targetType === "MESSAGE" && report.scopeType === "CHANNEL" && report.scopeIsPrivate && report.scopeId) {
    return directory.listChannelManagerIds(report.scopeId);
  }
  return report.workspaceId ? directory.listWorkspaceAdminIds(report.workspaceId) : [];
}
