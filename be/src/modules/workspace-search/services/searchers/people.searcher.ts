import { LIMITS } from "../../../../core/constants/limits";
import { AppError } from "../../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../../core/utils/error.codes";
import { normalizeSearch } from "../../../../core/utils/normalize";
import { matchesAllTokens } from "../../../../core/utils/search-query";
import { logger } from "../../../../infrastructure/logger";
import { avatarUrlOf } from "../../../../shared/media";
import type { WorkspaceSearchQueryDto } from "../../dtos";
import type { PersonHit, SearchContext, SearchPage } from "../../entities/search.interface";
import type { ICatalogSearchRepository } from "../../repositories/search.repository.interface";
import { decodeOffsetCursor, encodeOffsetCursor, unique, type Searcher } from "./searcher.types";

export type PresenceReader = (viewerId: string, userIds: string[]) => Promise<Record<string, { state: string }>>;

/**
 * Tìm NGƯỜI trong workspace (`type=people`): thành viên ACTIVE theo tên tài khoản hoặc tên hiển thị trong nhóm, không dấu, neo đầu từ.
 * Khách KHÔNG được tìm danh sách người (403 `SRCH_103`). Presence lấy qua `presence.service` (đã tôn trọng chặn/ẩn trạng thái).
 */
export class PeopleSearcher implements Searcher<PersonHit> {
  constructor(
    private readonly catalog: ICatalogSearchRepository,
    private readonly presence: PresenceReader
  ) {}

  async search(ctx: SearchContext, query: WorkspaceSearchQueryDto): Promise<SearchPage<PersonHit>> {
    if (ctx.isGuest) throw new AppError(ErrorMessages[ErrorCode.SRCH_103], 403, ErrorCode.SRCH_103);

    const members = await this.catalog.listActiveMembers(ctx.workspaceId, LIMITS.search.peopleScanMax);
    const accountMatches = await this.catalog.matchUsersByName(
      members.map((m) => m.userId),
      ctx.regexes
    );
    const matched = members.filter(
      (m) => accountMatches.has(m.userId) || (m.displayName !== null && matchesAllTokens(normalizeSearch(m.displayName), ctx.tokens))
    );

    // Tên + ảnh tài khoản: người khớp theo tên tài khoản đã có sẵn từ `matchUsersByName`; người chỉ khớp tên hiển thị nạp bù 1 lượt.
    const accounts = new Map(accountMatches);
    const missing = matched.filter((m) => !accounts.has(m.userId)).map((m) => m.userId);
    for (const [id, brief] of await this.catalog.userBriefs(missing)) accounts.set(id, brief);

    const named = matched
      .map((m) => ({
        userId: m.userId,
        role: m.role,
        displayName: m.displayName?.trim() || accounts.get(m.userId)?.name || "Người dùng",
      }))
      .sort((a, b) => normalizeSearch(a.displayName).localeCompare(normalizeSearch(b.displayName)) || a.userId.localeCompare(b.userId));

    const offset = decodeOffsetCursor(query.cursor);
    const page = named.slice(offset, offset + query.limit);
    const hasMore = offset + query.limit < named.length;
    const states = await this.presenceOf(
      ctx.userId,
      page.map((p) => p.userId)
    );

    return {
      data: page.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        avatarUrl: avatarUrlOf(accounts.get(p.userId)?.avatarAssetId),
        role: p.role,
        presence: states[p.userId]?.state ?? "HIDDEN",
      })),
      meta: {
        nextCursor: hasMore ? encodeOffsetCursor(offset + query.limit) : null,
        hasMore,
        limit: query.limit,
        partial: false,
        truncated: members.length >= LIMITS.search.peopleScanMax,
      },
    };
  }

  /** Presence là phần trang trí — Redis lỗi không được làm hỏng kết quả tìm. */
  private async presenceOf(viewerId: string, userIds: string[]): Promise<Record<string, { state: string }>> {
    if (userIds.length === 0) return {};
    try {
      return await this.presence(viewerId, unique(userIds));
    } catch (err) {
      logger.warn("[workspace-search] Không đọc được presence, bỏ qua", { error: err instanceof Error ? err.message : String(err) });
      return {};
    }
  }
}
