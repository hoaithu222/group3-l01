/**
 * Khai ĐỘC LẬP với Prisma enum/model (cùng giá trị) — module không import kiểu Prisma thẳng vào
 * tầng domain (`.claude/rules/architecture.md`), giống `modules/messages/entities`.
 *
 * `REPORT_TARGET_TYPES` để MỞ RỘNG: các phase sau thêm PORTFOLIO/COMPANY/JOB_OFFER/STUDY_SET/
 * MENTOR_POST vào đây + enum Prisma `ReportTargetType` (Mongo lưu chuỗi — không phá bản ghi cũ);
 * `ReportTargetResolver` chỉ cần thêm 1 nhánh `case`.
 */
export const REPORT_TARGET_TYPES = ["MESSAGE", "USER", "CHANNEL", "CONVERSATION", "STUDY_SET", "MENTOR_POST", "PORTFOLIO", "COMPANY", "JOB_OFFER"] as const;
export type ReportTargetTypeValue = (typeof REPORT_TARGET_TYPES)[number];

/** `COPYRIGHT`/`WRONG_CONTENT` (p4-01) dành cho đích `STUDY_SET` nhưng nằm chung enum — `POST /reports` không chặn theo loại đích. */
export const REPORT_REASONS = ["SPAM", "HARASSMENT", "INAPPROPRIATE", "SCAM", "IMPERSONATION", "OTHER", "COPYRIGHT", "WRONG_CONTENT"] as const;
export type ReportReasonValue = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export type ReportStatusValue = (typeof REPORT_STATUSES)[number];

export const REPORT_RESOLUTIONS = [
  "CONTENT_REMOVED",
  "AUTHOR_WARNED",
  "USER_LOCKED",
  "CHANNEL_ARCHIVED",
  "CONVERSATION_DISSOLVED",
  "NO_ACTION",
] as const;
export type ReportResolutionValue = (typeof REPORT_RESOLUTIONS)[number];

export const REPORT_HANDLER_LEVELS = ["SCOPE", "PLATFORM_ONLY"] as const;
export type ReportHandlerLevelValue = (typeof REPORT_HANDLER_LEVELS)[number];

export type ReportScopeTypeValue = "CHANNEL" | "CONVERSATION";

/** Khoá gộp nhiều báo cáo cùng đích — `"<targetType>:<targetId>"`. */
export function buildGroupKey(targetType: ReportTargetTypeValue, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/** Entity domain — khớp model Prisma `Report`. */
export interface Report {
  id: string;
  reporterId: string;
  targetType: ReportTargetTypeValue;
  targetId: string;
  groupKey: string;
  scopeType: ReportScopeTypeValue | null;
  scopeId: string | null;
  /** Kênh private / nhóm chat / 1-1 → nội dung chỉ xem qua luồng D-06. */
  scopeIsPrivate: boolean;
  workspaceId: string | null;
  targetAuthorId: string | null;
  handlerLevel: ReportHandlerLevelValue;
  reason: ReportReasonValue;
  description: string | null;
  status: ReportStatusValue;
  resolution: ReportResolutionValue | null;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAtLevel: ReportHandlerLevelValue | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Dữ liệu tạo mới — `status` luôn `OPEN`, các field xử lý luôn `null` (ghi TƯỜNG MINH, tránh bẫy absent≠null của Prisma-Mongo). */
export type ReportCreateInput = Pick<
  Report,
  | "reporterId"
  | "targetType"
  | "targetId"
  | "groupKey"
  | "scopeType"
  | "scopeId"
  | "scopeIsPrivate"
  | "workspaceId"
  | "targetAuthorId"
  | "handlerLevel"
  | "reason"
  | "description"
>;

/** Kết quả đích đã tra — nguồn cho `ReportCreateInput` (trừ người báo cáo/lý do/mô tả). */
export type ResolvedReportTarget = Pick<
  Report,
  | "targetType"
  | "targetId"
  | "groupKey"
  | "scopeType"
  | "scopeId"
  | "scopeIsPrivate"
  | "workspaceId"
  | "targetAuthorId"
  | "handlerLevel"
>;

/** Một nhóm báo cáo cùng đích (gộp theo `groupKey`). */
export interface ReportGroup {
  groupKey: string;
  targetType: ReportTargetTypeValue;
  targetId: string;
  reportCount: number;
  /** Lý do khác nhau, sắp theo số lần giảm dần. */
  reasons: ReportReasonValue[];
  firstAt: Date;
  latestAt: Date;
  status: ReportStatusValue;
  resolution: ReportResolutionValue | null;
  scopeType: ReportScopeTypeValue | null;
  scopeId: string | null;
  scopeIsPrivate: boolean;
  workspaceId: string | null;
  targetAuthorId: string | null;
  handlerLevel: ReportHandlerLevelValue;
  /** Báo cáo đại diện (mới nhất) — dùng làm `:reportId` cho thao tác trên nhóm. */
  representativeId: string;
}
