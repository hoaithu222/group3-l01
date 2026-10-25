import { ForbiddenError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import type {
  ReportPort,
  ReportTargetExtension,
  ReportTargetLookup,
  SubmitReportResult,
} from "../../../shared/ports/report.port";
import type { ReportSetDto } from "../dtos";
import { studyErrors } from "../study.errors";
import { loadSet, type StudyDeps } from "./study.deps";

export const STUDY_SET_REPORT_TARGET = "STUDY_SET";

/**
 * `POST /study-sets/:id/report` (be.md §4) — gửi báo cáo qua p1-08 (`ReportPort`, idempotent 1 báo cáo/người/bộ). Chỉ người
 * đọc được bộ và KHÔNG phải tác giả; bộ đã ẩn/riêng tư → 404 trung tính, không lộ sự tồn tại.
 */
export class StudySetReportService {
  constructor(
    private readonly d: Pick<StudyDeps, "sets" | "access">,
    private readonly reports: ReportPort
  ) {}

  async report(user: AuthUser, setId: string, dto: ReportSetDto): Promise<SubmitReportResult> {
    const set = await loadSet(this.d, setId);
    const perms = await this.d.access.assertMeta(user, set);
    if (!perms.report) {
      if (set.ownerId === user.id) throw new ForbiddenError("Không thể báo cáo bộ học của chính bạn");
      throw studyErrors.notFound();
    }
    return this.reports.submit(user, {
      targetType: STUDY_SET_REPORT_TARGET,
      targetId: set.id,
      reason: dto.reason,
      description: dto.description && dto.description.length > 0 ? dto.description : undefined,
    });
  }
}

/**
 * Điểm cắm của `moderation` cho đích `STUDY_SET` (`shared/ports/report.port`) — đăng ký lúc boot ở API (`study.routes.ts`) VÀ
 * worker (`jobs/study-report.consumer.ts`, vì `report.events` chạy ở worker). Bộ WORKSPACE → OWNER/ADMIN nhóm xử lý
 * (`SCOPE`); bộ PUBLIC → quản trị nền tảng (`PLATFORM_ONLY`, `moderation:update`).
 */
export class StudySetReportTarget implements ReportTargetExtension {
  constructor(private readonly d: Pick<StudyDeps, "sets" | "access">) {}

  async resolve(reporter: AuthUser, targetId: string): Promise<ReportTargetLookup> {
    const set = await this.d.sets.findById(targetId);
    if (!set) return "NOT_FOUND";
    const perms = await this.d.access.resolve(reporter, set);
    if (!perms.meta) return "NOT_FOUND";
    if (set.ownerId === reporter.id) return "SELF";
    if (!perms.report) return "NOT_FOUND";
    return {
      targetType: STUDY_SET_REPORT_TARGET,
      targetId: set.id,
      groupKey: `${STUDY_SET_REPORT_TARGET}:${set.id}`,
      scopeType: null,
      scopeId: null,
      scopeIsPrivate: false,
      workspaceId: set.visibility === "WORKSPACE" ? set.workspaceId : null,
      targetAuthorId: set.ownerId,
      handlerLevel: set.visibility === "WORKSPACE" ? "SCOPE" : "PLATFORM_ONLY",
    };
  }

  /** Đặt tuyệt đối theo số báo cáo ĐANG MỞ (idempotent khi job retry). Số ≥ `reportedPriorityThreshold` → hàng đợi ưu tiên (admin lọc). */
  async onReportCreated(input: { targetId: string; openCount: number }): Promise<void> {
    await this.d.sets.setReportedCount(input.targetId, input.openCount);
  }
}
