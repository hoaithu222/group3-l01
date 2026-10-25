import { ValidationError } from "../../../core/exceptions";
import { LIMITS } from "../../../core/constants/limits";
import { decodeCursor, encodeCursor } from "../../../core/utils/cursor";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { CursorMeta } from "../../../core/utils/response";
import type { AuthUser } from "../../../core/types/express";
import type { ListSetsQueryDto, PopularTagsQueryDto } from "../dtos";
import type { PopularTag } from "../entities/study-set.interface";
import { studyErrors } from "../study.errors";
import type { IStudyTagCache } from "./study-tag-cache";
import { toSummaryDto, type StudySetSummaryDto } from "./study-set.presenter";
import { buildPresentContext, type StudyDeps } from "./study.deps";
import { searchTerms } from "./study-tags";

export interface StudySetPage {
  data: StudySetSummaryDto[];
  meta: CursorMeta;
}

/** `GET /study-sets` (mine · workspace · public) và `GET /study-tags/popular` — p4-01 be.md §4–§5. */
export class StudySetListService {
  constructor(
    private readonly d: Pick<StudyDeps, "sets" | "users" | "assets" | "roles">,
    private readonly tagCache: IStudyTagCache
  ) {}

  /**
   * Quyền kiểm TRƯỚC khi truy vấn: `workspace` cần là thành viên (GUEST/người ngoài → 404); OWNER/ADMIN thấy cả bộ đã ẩn
   * để khôi phục, MEMBER chỉ thấy bộ đã ẩn của chính mình. `public` chỉ ACTIVE. `hasQuiz=true` = có câu chấm điểm được.
   */
  async list(user: AuthUser, query: ListSetsQueryDto): Promise<StudySetPage> {
    let includeHidden = false;
    if (query.scope === "workspace") {
      if (!query.workspaceId) throw studyErrors.workspaceRequired();
      const role = await this.d.roles.roleOf(user, query.workspaceId);
      if (role === null) throw studyErrors.notFound();
      includeHidden = role !== "MEMBER";
    }
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    if (query.cursor && !after) throw new ValidationError("Cursor không hợp lệ");

    const rows = await this.d.sets.list({
      scope: query.scope,
      viewerId: user.id,
      workspaceId: query.workspaceId,
      includeHidden,
      terms: query.q ? searchTerms(query.q) : undefined,
      tag: query.tag ? normalizeSearch(query.tag) : undefined,
      hasQuiz: query.hasQuiz === true ? true : undefined,
      after: after ?? undefined,
      limit: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const ctx = await buildPresentContext(this.d, page);
    return {
      data: page.map((s) => toSummaryDto(s, ctx)),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.updatedAt, last.id) : null, hasMore, limit: query.limit },
    };
  }

  /** ≤ 30 thẻ, cache 10 phút. Có `workspaceId` → thẻ của bộ WORKSPACE trong nhóm (cần là thành viên); không → bộ PUBLIC. */
  async popularTags(user: AuthUser, query: PopularTagsQueryDto): Promise<PopularTag[]> {
    if (query.workspaceId && (await this.d.roles.roleOf(user, query.workspaceId)) === null) throw studyErrors.notFound();
    const key = query.workspaceId ? `ws:${query.workspaceId}` : "public";
    const cached = await this.tagCache.get(key);
    if (cached) return cached;
    const tags = await this.d.sets.popularTags({ workspaceId: query.workspaceId, limit: LIMITS.study.popularTagsMax });
    await this.tagCache.set(key, tags, LIMITS.study.popularTagsCacheSeconds).catch(() => undefined);
    return tags;
  }
}
