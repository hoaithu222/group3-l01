import { normalizeSearch } from "../../../core/utils/normalize";
import { LIMITS } from "../../../core/constants/limits";
import type { TalentIndexDoc, TalentSkillRef } from "../entities/recruiter.interface";

/** Dữ liệu nguồn đã đọc (qua cổng career/contribution/portfolio) để dựng bản chiếu — HÀM THUẦN, dễ test theo từng cờ quyền riêng tư. */
export interface TalentIndexSource {
  now: Date;
  user: { id: string; name: string; status: string; avatarAssetId: string | null };
  career: {
    openToWork: boolean;
    headline: string | null;
    preferredRoles: readonly string[];
    location: string | null;
    updatedAt: Date | null;
    visibility: { showSkills: boolean; showContribution: boolean };
  };
  /** Huy hiệu CÒN hiệu lực (mới → cũ). */
  badges: ReadonlyArray<{ skill: { id: string; code: string; name: string; icon: string } }>;
  contribution: { pctX10: number; workspaces: number } | null;
  portfolioUrl: string | null;
  blockedCompanyIds: readonly string[];
}

/**
 * Dựng `TalentSearchIndex` của MỘT người (idempotent — ghi đè toàn bộ). Trả `null` = KHÔNG được có trong index (xoá nếu đang có):
 * tài khoản không ACTIVE (khoá/ẩn danh hoá) hoặc chưa/không còn bật Open to work.
 *
 * Lọc quyền riêng tư NGAY LÚC DỰNG (HR không bao giờ thấy thứ bị ẩn, không phụ thuộc lọc lúc đọc):
 *  - `showSkills=false` → không kỹ năng, `badgeCount=0` (không lộ số huy hiệu);
 *  - `showContribution=false` hoặc chưa nhóm nào đủ dữ liệu → `contributionPctX10/contributionWorkspaces = null`.
 * Không email/SĐT/tên nhóm/đồng đội — chỉ những trường trong `TalentIndexDoc`.
 */
export function buildTalentIndexDoc(src: TalentIndexSource): TalentIndexDoc | null {
  if (src.user.status !== "ACTIVE" || !src.career.openToWork) return null;

  const roles = src.career.preferredRoles.map((r) => r.trim()).filter((r) => r.length > 0);
  const headline = src.career.headline?.trim() || null;
  const location = src.career.location?.trim() || null;
  const showSkills = src.career.visibility.showSkills;

  const seen = new Set<string>();
  const skills: TalentSkillRef[] = [];
  if (showSkills) {
    for (const b of src.badges) {
      const code = b.skill.code.toLowerCase();
      if (seen.has(code)) continue;
      seen.add(code);
      skills.push({ skillId: b.skill.id, code, name: b.skill.name, icon: b.skill.icon });
    }
  }

  const contribution = src.career.visibility.showContribution ? src.contribution : null;

  return {
    userId: src.user.id,
    openToWork: true,
    displayName: src.user.name,
    normalizedText: normalizeSearch([src.user.name, headline, roles.join(" "), location].filter((s): s is string => !!s).join(" ")),
    avatarAssetId: src.user.avatarAssetId,
    headline,
    preferredRoles: roles.slice(0, LIMITS.talent.preferredRolesMax),
    preferredRolesKey: roles.slice(0, LIMITS.talent.preferredRolesMax).map(normalizeSearch),
    location,
    locationKey: location ? normalizeSearch(location) : null,
    skillCodes: skills.map((s) => s.code),
    skills,
    badgeCount: skills.length,
    contributionPctX10: contribution ? contribution.pctX10 : null,
    contributionWorkspaces: contribution ? contribution.workspaces : null,
    portfolioUrl: src.portfolioUrl,
    blockedCompanyIds: [...new Set(src.blockedCompanyIds)],
    sourceUpdatedAt: src.career.updatedAt ?? src.now,
    rebuiltAt: src.now,
  };
}
