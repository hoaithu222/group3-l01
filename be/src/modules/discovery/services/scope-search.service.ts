import { LIMITS } from "../../../core/constants/limits";
import { AppError, ScopeNotFoundError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { encodeCursor } from "../../../core/utils/cursor";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { searchRequestsTotal } from "../../../infrastructure/metrics";
import { avatarUrlOf } from "../../../shared/media";
import type { ScopeSearchQueryDto } from "../dtos";
import type { DiscoveryScopeType, DiscoveryUserBrief, SearchHit, SearchPageMeta, SearchRow } from "../entities/discovery.interface";
import type { IDiscoveryLookupRepository } from "../repositories/discovery-lookup.repository.interface";
import type { IMessageSearchRepository } from "../repositories/message-search.repository.interface";
import { parseCursorParam } from "./cursor-param";
import { isHiddenForViewer } from "./message-visibility";
import {
  buildBaseFilter,
  computeSearchBounds,
  iterateWindows,
  parseSearchTerms,
  withWindow,
} from "./search-query.builder";
import type { ScopeResolver } from "./saved.service";
import { buildSnippet } from "./snippet.util";
import { getMessageScope } from "../../messages/public";

export interface SearchPage {
  data: SearchHit[];
  meta: SearchPageMeta;
}

const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

/**
 * Tìm tin trong MỘT kênh/hội thoại (be.md p1-09 §5.4). Thiết kế đã chốt:
 *  - từ khoá → `normalizeSearch` → mỗi từ 1 regex ĐÃ ESCAPE trên `normalizedContent`, AND;
 *  - quét cửa sổ thời gian mới → cũ với ngân sách `LIMITS.search.maxTimeMs` cho cả request:
 *    hết giờ → trả các kết quả mới hơn đã có + `partial: true` (không lỗi);
 *  - quyền đọc kiểm TRƯỚC truy vấn và LẠI ngay trước khi trả (DU-02); loại tin bị thu hồi,
 *    bị ẩn (`hiddenBeforeSeq`, `MessageHide`) và reply mất tin gốc;
 *  - không bao giờ log từ khoá (riêng tư).
 */
export class ScopeSearchService {
  constructor(
    private readonly messageRepo: IMessageSearchRepository,
    private readonly lookupRepo: IDiscoveryLookupRepository,
    private readonly resolveScope: ScopeResolver = getMessageScope,
    private readonly clock: () => number = Date.now,
    private readonly countSearch: (scopeType: DiscoveryScopeType, partial: boolean) => void = (scopeType, partial) =>
      searchRequestsTotal.inc({ scopeType, partial: String(partial) })
  ) {}

  async search(user: AuthUser, scopeType: DiscoveryScopeType, scopeId: string, query: ScopeSearchQueryDto): Promise<SearchPage> {
    const terms = parseSearchTerms(query.q);
    const cursor = parseCursorParam(query.cursor);

    const scope = this.resolveScope(scopeType);
    if (!scope) throw new ScopeNotFoundError();
    if (scope.searchable && !scope.searchable(scopeId)) {
      throw new AppError(ErrorMessages[ErrorCode.SRCH_003], 400, ErrorCode.SRCH_003);
    }
    const access = await scope.canRead(user, scopeId);
    if (!access.visible) throw new ScopeNotFoundError();
    const viewerCtx = await scope.viewerContext(user, scopeId);

    const base = buildBaseFilter({
      scopeType,
      scopeId,
      terms,
      authorId: query.authorId,
      hasFile: query.hasFile,
      fileKind: query.fileKind,
      includeThreads: query.includeThreads,
      floorSeq: viewerCtx.hiddenBeforeSeq,
    });
    const { rows, partial } = await this.scanWindows(base, cursor, query);

    // Quyền có thể bị thu hồi trong lúc truy vấn chạy (tới maxTimeMs) — kiểm lại trước khi trả bất kỳ nội dung nào.
    const recheck = await scope.canRead(user, scopeId);
    if (!recheck.visible) throw new ScopeNotFoundError();

    const pageRows = rows.slice(0, query.limit);
    const last = pageRows[pageRows.length - 1];
    const hasMore = rows.length > query.limit;
    const meta: SearchPageMeta = {
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
      hasMore,
      limit: query.limit,
      partial,
    };

    const visible = await this.filterVisible(user.id, scopeType, scopeId, pageRows, viewerCtx.hiddenBeforeSeq);
    const authors = await this.lookupRepo.userBriefs(unique(visible.flatMap((r) => (r.authorId ? [r.authorId] : []))));
    const data = visible.map((r) => this.toHit(r, terms, authors));

    this.countSearch(scopeType, partial);
    return { data, meta };
  }

  private async scanWindows(
    base: ReturnType<typeof buildBaseFilter>,
    cursor: ReturnType<typeof parseCursorParam>,
    query: ScopeSearchQueryDto
  ): Promise<{ rows: SearchRow[]; partial: boolean }> {
    const needed = query.limit + 1;
    const deadline = this.clock() + LIMITS.search.maxTimeMs;
    const { upper, lower } = computeSearchBounds({ from: query.from, to: query.to, cursor, now: new Date(this.clock()) });

    const rows: SearchRow[] = [];
    let partial = false;
    let first = true;
    for (const window of iterateWindows(upper, lower)) {
      const remaining = Math.floor(deadline - this.clock());
      if (remaining <= 0) {
        partial = true;
        break;
      }
      // Điều kiện tie-break `(createdAt, _id)` chỉ cần ở cửa sổ đầu (các cửa sổ sau cũ hơn `cursor.at` hẳn).
      const result = await this.messageRepo.search(withWindow(base, window, first ? cursor : undefined), needed - rows.length, remaining);
      first = false;
      if (result.timedOut) {
        partial = true;
        break;
      }
      rows.push(...result.rows);
      if (rows.length >= needed) break;
    }
    return { rows, partial };
  }

  /** Loại tin thu hồi/rỗng, tin bị ẩn với người xem và reply mà tin gốc không còn trong phạm vi. */
  private async filterVisible(
    userId: string,
    scopeType: DiscoveryScopeType,
    scopeId: string,
    rows: readonly SearchRow[],
    hiddenBeforeSeq: number
  ): Promise<SearchRow[]> {
    if (rows.length === 0) return [];
    const parentIds = unique(rows.flatMap((r) => (r.threadId ? [r.threadId] : [])));
    const [hidden, parents] = await Promise.all([
      this.messageRepo.findHiddenMessageIds(userId, rows.map((r) => r.id)),
      this.messageRepo.findExistingMessageIds(scopeType, scopeId, parentIds),
    ]);
    return rows.filter(
      (r) =>
        r.deletedAt === null &&
        !!r.content &&
        !isHiddenForViewer(r, hiddenBeforeSeq, hidden) &&
        (r.threadId === null || parents.has(r.threadId))
    );
  }

  private toHit(row: SearchRow, terms: readonly string[], authors: ReadonlyMap<string, DiscoveryUserBrief>): SearchHit {
    const { snippet, highlights } = buildSnippet(row.content, row.mentions, terms, LIMITS.search.snippetChars);
    const author = row.authorId ? authors.get(row.authorId) : undefined;
    return {
      messageId: row.id,
      seq: row.seq,
      threadId: row.threadId,
      parentMessageId: row.threadId,
      author: { id: row.authorId, name: author?.name ?? null, avatarUrl: avatarUrlOf(author?.avatarAssetId) },
      createdAt: row.createdAt,
      snippet,
      highlights,
      attachmentsSummary:
        row.attachmentKinds.length > 0 ? { count: row.attachmentKinds.length, kinds: unique(row.attachmentKinds) } : null,
      inThread: row.threadId !== null,
    };
  }
}
