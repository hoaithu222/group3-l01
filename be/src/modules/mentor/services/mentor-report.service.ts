import type { AuthUser } from "../../../core/types/express";
import type {
  ReportPort,
  ReportTargetExtension,
  ReportTargetLookup,
  SubmitReportResult,
} from "../../../shared/ports/report.port";
import type { ReportPostDto } from "../dtos";
import type { IMentorPostRepository } from "../repositories/mentor-post.repository.interface";
import type { IMentorAccess } from "./mentor.deps";
import { isWorkspaceAdmin } from "./mentor-access";
import { MENTOR_POST_REPORT_TARGET } from "./mentor-report.constants";

/**
 * `POST /mentor/posts/:id/report` — gửi qua p1-08 (`ReportPort.submit`, idempotent 1 báo cáo/người/bài). Kiểm quyền/tự báo cáo nằm ở
 * `MentorPostReportTarget.resolve` (moderation gọi lại) để `POST /reports { targetType: MENTOR_POST }` cũng đúng luật.
 */
export class MentorReportService {
  constructor(private readonly reports: ReportPort) {}

  report(user: AuthUser, postId: string, dto: ReportPostDto): Promise<SubmitReportResult> {
    return this.reports.submit(user, {
      targetType: MENTOR_POST_REPORT_TARGET,
      targetId: postId,
      reason: dto.reason,
      description: dto.description && dto.description.length > 0 ? dto.description : undefined,
    });
  }
}

/**
 * Điểm cắm của `moderation` cho đích `MENTOR_POST` (`shared/ports/report.port`) — đăng ký ở API (`registerMentorModule()`) VÀ worker
 * (`jobs/mentor.jobs.ts`, vì `report.events` chạy ở worker). Bài là công khai với người đăng nhập → CHỈ quản trị nền tảng xử lý
 * (`PLATFORM_ONLY`, `moderation:update`); nhiều báo cáo cùng bài gộp theo `groupKey` (IR-25).
 */
export class MentorPostReportTarget implements ReportTargetExtension {
  constructor(
    private readonly posts: Pick<IMentorPostRepository, "findById" | "setReportedCount">,
    private readonly access: Pick<IMentorAccess, "workspaceRole">
  ) {}

  async resolve(reporter: AuthUser, targetId: string): Promise<ReportTargetLookup> {
    const post = await this.posts.findById(targetId);
    if (!post || post.hiddenAt) return "NOT_FOUND";
    // OWNER/ADMIN của nhóm đăng bài không tự báo cáo bài của nhóm (ma trận README §6) — coi như "chính mình".
    if (post.createdBy === reporter.id || isWorkspaceAdmin(await this.access.workspaceRole(reporter, post.workspaceId))) return "SELF";
    return {
      targetType: MENTOR_POST_REPORT_TARGET,
      targetId: post.id,
      groupKey: `${MENTOR_POST_REPORT_TARGET}:${post.id}`,
      scopeType: null,
      scopeId: null,
      scopeIsPrivate: false,
      workspaceId: post.workspaceId,
      targetAuthorId: post.createdBy,
      handlerLevel: "PLATFORM_ONLY",
    };
  }

  /** Đặt TUYỆT ĐỐI theo số báo cáo đang mở (job retry vô hại). */
  async onReportCreated(input: { targetId: string; openCount: number }): Promise<void> {
    await this.posts.setReportedCount(input.targetId, input.openCount);
  }
}
