/** Loại đích báo cáo của bài tìm cố vấn (khớp enum Prisma `ReportTargetType.MENTOR_POST`). */
export const MENTOR_POST_REPORT_TARGET = "MENTOR_POST";

/**
 * Lý do báo cáo bài (tập con của `REPORT_REASONS` p1-08 — `moderation` kiểm lại khi nhận). Khai riêng để DTO không import `moderation`.
 */
export const REPORT_REASONS_FOR_MENTOR = ["SPAM", "HARASSMENT", "INAPPROPRIATE", "SCAM", "IMPERSONATION", "OTHER"] as const;
