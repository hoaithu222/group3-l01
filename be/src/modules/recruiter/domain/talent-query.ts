import { createHash } from "crypto";
import { escapeRegex } from "../../../core/utils/escape-regex";
import { normalizeSearch } from "../../../core/utils/normalize";
import { tokenize, wordStartPattern } from "../../../core/utils/search-query";
import { LIMITS } from "../../../core/constants/limits";

/**
 * Truy vấn tìm ứng viên (be.md §5 "Tìm kiếm") — dựng pipeline `aggregateRaw` THUẦN trên `TalentSearchIndex`.
 * Bộ lọc cứng: chỉ `openToWork`, không bị người này chặn công ty đang tìm; kỹ năng (`$all`), điểm đóng góp tối thiểu, số huy hiệu, vị trí/khu vực mong muốn,
 * từ khoá (mỗi từ khớp ĐẦU một từ của tên/tiêu đề/vị trí — regex đã escape). `matchScore` = số kỹ năng khớp (chỉ có nghĩa khi lọc kỹ năng).
 * Sắp xếp: kỹ năng khớp → điểm đóng góp (null cuối) → cập nhật gần nhất → id (ổn định). Phân trang theo CHỈ SỐ (`encodeOffsetCursor`).
 */
export interface TalentSearchInput {
  skills?: string[];
  minContribution?: number;
  minBadges?: number;
  role?: string;
  location?: string;
  q?: string;
  offset: number;
  limit: number;
}

type Doc = Record<string, unknown>;
const oid = (id: string): Doc => ({ $oid: id });

export interface TalentPipeline {
  pipeline: Doc[];
  /** Số dòng đọc = `limit + 1` (dòng thừa cho biết còn trang sau). */
  fetch: number;
}

export function buildTalentPipeline(companyId: string, input: TalentSearchInput): TalentPipeline {
  const skills = [...new Set((input.skills ?? []).map((s) => s.toLowerCase()))];
  const and: Doc[] = [];
  const match: Doc = { openToWork: true, blockedCompanyIds: { $ne: oid(companyId) } };

  if (skills.length > 0) match.skillCodes = { $all: skills };
  if (input.minContribution !== undefined && input.minContribution > 0) match.contributionPctX10 = { $gte: Math.round(input.minContribution * 10) };
  if (input.minBadges !== undefined && input.minBadges > 0) match.badgeCount = { $gte: input.minBadges };
  const role = input.role ? normalizeSearch(input.role) : "";
  if (role) and.push({ preferredRolesKey: { $regex: wordStartPattern(role) } });
  const location = input.location ? normalizeSearch(input.location) : "";
  if (location) and.push({ locationKey: { $regex: `^${escapeRegex(location)}` } });
  if (input.q) {
    const t = tokenize(input.q, { min: 2, max: LIMITS.talent.keywordMax, maxTokens: 6 });
    for (const pattern of t.regexes) and.push({ normalizedText: { $regex: pattern } });
  }
  if (and.length > 0) match.$and = and;

  const fetch = input.limit + 1;
  return {
    fetch,
    pipeline: [
      { $match: match },
      { $addFields: { matchScore: { $size: { $setIntersection: ["$skillCodes", skills] } }, contribSort: { $ifNull: ["$contributionPctX10", -1] } } },
      { $sort: { matchScore: -1, contribSort: -1, rebuiltAt: -1, _id: -1 } },
      { $skip: input.offset },
      { $limit: fetch },
      {
        $project: {
          userId: 1,
          displayName: 1,
          avatarAssetId: 1,
          headline: 1,
          preferredRoles: 1,
          location: 1,
          skills: 1,
          badgeCount: 1,
          contributionPctX10: 1,
          contributionWorkspaces: 1,
          portfolioUrl: 1,
          matchScore: 1,
        },
      },
    ],
  };
}

/** Băm ổn định của bộ lọc (khoá cache `talent:search:<companyId>:<ver>:<hash>`). */
export function hashTalentQuery(input: Omit<TalentSearchInput, "offset"> & { offset: number }): string {
  const canonical = JSON.stringify({
    s: [...new Set((input.skills ?? []).map((s) => s.toLowerCase()))].sort(),
    c: input.minContribution ?? 0,
    b: input.minBadges ?? 0,
    r: input.role ? normalizeSearch(input.role) : "",
    l: input.location ? normalizeSearch(input.location) : "",
    q: input.q ? normalizeSearch(input.q) : "",
    o: input.offset,
    n: input.limit,
  });
  return createHash("sha1").update(canonical).digest("hex").slice(0, 16);
}

/** Đọc một giá trị Extended JSON `{ $oid }` (kết quả `aggregateRaw`) hoặc chuỗi thường. */
export function ejsonId(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "$oid" in v) return String((v as { $oid: unknown }).$oid);
  return "";
}

export function ejsonDate(v: unknown): Date | null {
  if (typeof v === "string") return new Date(v);
  if (v && typeof v === "object" && "$date" in v) {
    const d = (v as { $date: unknown }).$date;
    if (typeof d === "string" || typeof d === "number") return new Date(d);
    if (d && typeof d === "object" && "$numberLong" in d) return new Date(Number((d as { $numberLong: unknown }).$numberLong));
  }
  return null;
}
