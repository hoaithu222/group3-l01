import { LIMITS } from "../../../core/constants/limits";
import { addDaysToLocalDate } from "../../../core/utils/local-date";
import type { WorkspaceMembershipPort } from "../../../shared/ports/workspace-membership.port";
import { burnoutErrors } from "../burnout.errors";
import type { WellbeingLevel } from "../domain/burnout-rules";
import { isTrackingEnabled } from "../entities/burnout.interface";
import type { IBurnoutAssessmentRepository } from "../repositories/assessment.repository.interface";
import type { IBurnoutDirectory } from "../repositories/directory";
import type { IWellbeingSettingRepository } from "../repositories/setting.repository.interface";
import type { IWellbeingShareRepository } from "../repositories/share.repository.interface";

export interface ShareDto {
  workspaceId: string;
  name: string;
}

export interface IndicatorDto {
  userId: string;
  level: WellbeingLevel;
  date: string;
}

export interface WellbeingShareDeps {
  shares: IWellbeingShareRepository;
  settings: IWellbeingSettingRepository;
  assessments: IBurnoutAssessmentRepository;
  directory: IBurnoutDirectory;
  /** Cổng dùng chung của `modules/members` (be.md §5 "Chia sẻ" — kiểm còn là thành viên ACTIVE, cả lúc bật lẫn lúc trưởng nhóm đọc). */
  membership: WorkspaceMembershipPort;
  now?: () => Date;
}

/**
 * Chia sẻ mức rủi ro với trưởng nhóm (P1, be.md §2/§4/§5 "Chia sẻ") — opt-in THỨ HAI theo workspace, tự nguyện, tách khỏi opt-in theo dõi.
 * Trưởng nhóm (OWNER/ADMIN, kiểm ở middleware `requireWorkspaceRole` của route) CHỈ thấy `level` (LOW/MEDIUM/HIGH) của đánh giá GẦN NHẤT
 * (`recentAlertDays` ngày) — KHÔNG BAO GIỜ `riskScore`/`factors`/số phút hoạt động. Membership ACTIVE được kiểm LẠI mỗi lần đọc (WELL-03):
 * rời nhóm thì chỉ báo biến mất ngay dù dòng `WellbeingShare` còn sót (dọn triệt để ở job opt-out purge/xoá dữ liệu).
 */
export class WellbeingShareService {
  private readonly now: () => Date;

  constructor(private readonly d: WellbeingShareDeps) {
    this.now = d.now ?? (() => new Date());
  }

  /** `GET /me/wellbeing/shares` — CHỈ nhóm mình đã tự bật chia sẻ (không phải danh sách mọi nhóm mình tham gia). */
  async list(userId: string): Promise<ShareDto[]> {
    const rows = await this.d.shares.listByUser(userId);
    if (rows.length === 0) return [];
    const names = await this.d.directory.workspaceNames(rows.map((r) => r.workspaceId));
    return rows.map((r) => ({ workspaceId: r.workspaceId, name: names.get(r.workspaceId) ?? "" }));
  }

  /** `PUT /me/wellbeing/shares/:workspaceId` — cần ĐANG bật theo dõi (`WELL_001`) và là thành viên ACTIVE của nhóm (`WELL_002`). Idempotent. */
  async share(userId: string, workspaceId: string): Promise<ShareDto> {
    const setting = await this.d.settings.findByUserId(userId);
    if (setting === null || !isTrackingEnabled(setting)) throw burnoutErrors.notEnabled();
    const status = await this.d.membership.statusOf(workspaceId, userId);
    if (status !== "ACTIVE") throw burnoutErrors.notMember();
    await this.d.shares.upsert(userId, workspaceId, this.now());
    const names = await this.d.directory.workspaceNames([workspaceId]);
    return { workspaceId, name: names.get(workspaceId) ?? "" };
  }

  /**
   * `DELETE /me/wellbeing/shares/:workspaceId` — rút lại đồng ý LUÔN được phép (không đòi đang bật theo dõi hay còn là thành viên — cùng
   * triết lý "tắt/xoá bất kỳ lúc nào" của `DELETE /me/wellbeing/data`). Idempotent.
   */
  async unshare(userId: string, workspaceId: string): Promise<void> {
    await this.d.shares.remove(userId, workspaceId);
  }

  /**
   * `GET /workspaces/:id/wellbeing/indicators` — chỉ người CÓ chia sẻ với nhóm này VÀ còn là thành viên ACTIVE (kiểm lại tại đây, WELL-03);
   * quyền OWNER/ADMIN do middleware route (`requireWorkspaceRole`) kiểm trước khi vào đây.
   */
  async indicators(workspaceId: string): Promise<IndicatorDto[]> {
    const sharedUserIds = await this.d.shares.listUserIdsByWorkspace(workspaceId);
    if (sharedUserIds.length === 0) return [];
    const statuses = await Promise.all(sharedUserIds.map((userId) => this.d.membership.statusOf(workspaceId, userId)));
    const activeIds = sharedUserIds.filter((_, i) => statuses[i] === "ACTIVE");
    if (activeIds.length === 0) return [];
    const since = addDaysToLocalDate(this.now().toISOString().slice(0, 10), -LIMITS.wellbeing.recentAlertDays);
    const latest = await this.d.assessments.latestForUsers(activeIds, since);
    return [...latest.entries()].map(([userId, v]) => ({ userId, level: v.level, date: v.date }));
  }
}
