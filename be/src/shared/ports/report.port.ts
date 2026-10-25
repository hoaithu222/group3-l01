import type { AuthUser } from "../../core/types/express";

/**
 * Cổng báo cáo cho module có ĐÍCH BÁO CÁO riêng ngoài tin nhắn/người dùng/kênh/nhóm chat (p4-01 `STUDY_SET`; sau này
 * PORTFOLIO/COMPANY/JOB_OFFER/MENTOR_POST — xem `report.interface.ts` của `moderation`). Đặt ở `shared/ports/` để `moderation`
 * KHÔNG import module nghiệp vụ và ngược lại (luật 3 tầng, `.claude/rules/architecture.md`).
 *
 * Hai chiều:
 *  - `ReportTargetExtension` — module sở hữu đích ĐĂNG KÝ lúc boot (API lẫn worker); `moderation` tra registry theo `targetType`.
 *  - `ReportPort` — `moderation` CUNG CẤP (`createReportPort()` ở `@modules/moderation/public`); module nghiệp vụ gọi để gửi
 *    báo cáo và đóng hàng báo cáo khi đã xử lý (vd ẩn bộ học) mà không import `moderation` trực tiếp.
 */

/** Đích đã tra — cùng hình với `ResolvedReportTarget` của `moderation` (phạm vi kênh/nhóm chat không áp dụng cho đích mở rộng). */
export interface ReportTargetResolution {
  targetType: string;
  targetId: string;
  /** `"<targetType>:<targetId>"` — gộp nhiều báo cáo cùng đích. */
  groupKey: string;
  scopeType: null;
  scopeId: null;
  scopeIsPrivate: boolean;
  workspaceId: string | null;
  targetAuthorId: string | null;
  /** `SCOPE` = OWNER/ADMIN nhóm xử lý; `PLATFORM_ONLY` = chỉ quản trị nền tảng. */
  handlerLevel: "SCOPE" | "PLATFORM_ONLY";
}

/** `NOT_FOUND` = không tồn tại/không thấy (→ 404 trung tính `MOD_002`); `SELF` = tự báo cáo nội dung của mình (→ 400 `BLOCK_001`). */
export type ReportTargetLookup = ReportTargetResolution | "NOT_FOUND" | "SELF";

export interface ReportTargetExtension {
  /** Kiểm người báo cáo THẤY được đích và được phép báo cáo; trả phạm vi xử lý. */
  resolve(reporter: AuthUser, targetId: string): Promise<ReportTargetLookup>;
  /**
   * Gọi từ consumer `report.events` sau mỗi báo cáo mới — cập nhật số liệu phi chuẩn hoá của đích (vd `reportedCount`).
   * PHẢI idempotent (job retry): đặt giá trị tuyệt đối theo `openCount`, KHÔNG tăng dần.
   */
  onReportCreated?(input: { targetId: string; openCount: number }): Promise<void>;
}

const registry = new Map<string, ReportTargetExtension>();

/** Đăng ký lại cùng `targetType` sẽ GHI ĐÈ (idempotent khi module được import nhiều lần trong test/worker). */
export function registerReportTargetExtension(targetType: string, ext: ReportTargetExtension): void {
  registry.set(targetType, ext);
}

export function getReportTargetExtension(targetType: string): ReportTargetExtension | undefined {
  return registry.get(targetType);
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearReportTargetExtensions(): void {
  registry.clear();
}

export interface SubmitReportInput {
  targetType: string;
  targetId: string;
  reason: string;
  description?: string;
}

export interface SubmitReportResult {
  id: string;
  status: string;
  createdAt: Date;
  /** `true` khi người này đã báo cáo đích này từ trước (idempotent) — caller trả 200 thay vì 201. */
  alreadyReported: boolean;
}

export interface CloseReportsInput {
  targetType: string;
  targetId: string;
  actor: { id: string; role?: string };
  /** `CONTENT_REMOVED` (đã ẩn/gỡ nội dung) hoặc `NO_ACTION` (bỏ qua). */
  resolution: "CONTENT_REMOVED" | "NO_ACTION";
  level: "SCOPE" | "PLATFORM";
  reason: string;
}

export interface ReportPort {
  submit(reporter: AuthUser, input: SubmitReportInput): Promise<SubmitReportResult>;
  /** Đóng MỌI báo cáo đang mở của đích (không có báo cáo mở = không làm gì, `closedCount 0`). */
  closeOpenByTarget(input: CloseReportsInput): Promise<{ closedCount: number }>;
}
