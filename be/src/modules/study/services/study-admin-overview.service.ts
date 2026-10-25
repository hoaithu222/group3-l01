import { NotFoundError } from "../../../core/exceptions";
import type { AdminReportedSetsQueryDto } from "../dtos";
import type { StudyOwnerSummary } from "../entities/study-set.interface";
import { toAdminStudySetDto, type AdminStudySetDto } from "./study-admin.presenter";
import { buildPresentContext, type StudyDeps } from "./study.deps";

export interface AdminReportedSetsPage {
  data: AdminStudySetDto[];
  meta: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
}

export interface AdminUserStudySummary extends StudyOwnerSummary {
  userId: string;
}

/**
 * Số liệu học tập CHỈ ĐỌC cho quản trị (p4-01 admin.md §1, P1): danh sách bộ PUBLIC bị báo cáo nhiều (tab `content`) và bộ đếm học tập của một người (tab "Học tập" của
 * user drawer). Quyền `moderation:view` ở route; không ghi gì nên không có audit (giống `GET /admin/study-sets/:id`). Không trả nội dung mục, tên bộ PRIVATE/WORKSPACE.
 */
export class StudyAdminOverviewService {
  constructor(private readonly d: Pick<StudyDeps, "sets" | "assets" | "users">) {}

  async listReported(query: AdminReportedSetsQueryDto): Promise<AdminReportedSetsPage> {
    const { rows, total } = await this.d.sets.listAdminReported({ minReported: query.minReports, status: query.status, page: query.page, limit: query.limit });
    const ctx = await buildPresentContext(this.d, rows);
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    return {
      data: rows.map((s) => toAdminStudySetDto(s, ctx)),
      meta: { page: query.page, limit: query.limit, total, totalPages, hasNext: query.page < totalPages, hasPrev: query.page > 1 },
    };
  }

  /** Bộ đếm của một người dùng — người không tồn tại → 404. Chỉ số, không tiêu đề/nội dung. */
  async userSummary(userId: string): Promise<AdminUserStudySummary> {
    if (!(await this.d.users.findMany([userId])).has(userId)) throw new NotFoundError("Không tìm thấy người dùng");
    return { userId, ...(await this.d.sets.ownerSummary(userId)) };
  }
}
