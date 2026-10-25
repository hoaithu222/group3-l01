import { NotFoundError } from "../../../core/exceptions";
import type { AdminUserQueryDto } from "../dtos";
import type { IBadgeRepository } from "../repositories/badge.repository.interface";
import type { IGamDirectory } from "../repositories/directory";
import type { IUserBadgeRepository } from "../repositories/user-badge.repository.interface";
import { toBadgeDto, type BadgeDto, type XpEventDto } from "./gamification.presenter";
import type { GamificationQueryService } from "./gamification-query.service";

export interface AdminBadgeHoldingDto extends BadgeDto {
  via: string;
  revokedAt: string | null;
  revokeReason: string | null;
}

/** Sự kiện XP kèm tên nhóm (chỉ admin thấy; `null` khi sự kiện không thuộc nhóm nào hoặc nhóm không còn). */
export interface AdminXpEventDto extends XpEventDto {
  workspaceName: string | null;
}

/** Tổng quan gamification của MỘT người cho admin (`gamification:view`): tóm tắt, huy hiệu (kể cả đã thu hồi), lịch sử XP (cursor). Không lộ riêng tư ngoài cấp độ/điểm. */
export class GamificationAdminService {
  constructor(
    private readonly d: { query: GamificationQueryService; badges: IBadgeRepository; userBadges: IUserBadgeRepository; directory: IGamDirectory }
  ) {}

  async userOverview(userId: string, query: AdminUserQueryDto) {
    const who = await this.d.directory.getTimezoneAndStatus(userId);
    if (!who) throw new NotFoundError("Không tìm thấy người dùng");
    const [summary, owned, xpEvents] = await Promise.all([this.d.query.me(userId), this.d.userBadges.listByUser(userId), this.d.query.xpEvents(userId, query)]);
    const badges = new Map((await this.d.badges.findByIds(owned.map((b) => b.badgeId))).map((b) => [b.id, b]));
    const holdings: AdminBadgeHoldingDto[] = owned.flatMap((o) => {
      const b = badges.get(o.badgeId);
      return b ? [{ ...toBadgeDto(b, o), via: o.via, revokedAt: o.revokedAt ? o.revokedAt.toISOString() : null, revokeReason: o.revokeReason }] : [];
    });
    // Cột "Workspace" ở admin: tên nhóm của từng sự kiện (chỉ tên — không thành viên/nội dung); nhóm đã xoá → `null`, admin hiện id rút gọn.
    const names = await this.d.directory.getWorkspaceNames(xpEvents.data.flatMap((e) => (e.workspaceId ? [e.workspaceId] : [])));
    const events: AdminXpEventDto[] = xpEvents.data.map((e) => ({ ...e, workspaceName: e.workspaceId ? (names.get(e.workspaceId) ?? null) : null }));
    return { summary, badges: holdings, xpEvents: events, xpEventsMeta: xpEvents.meta };
  }
}
