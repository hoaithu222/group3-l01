import type { SearchContext, SearchPage, SearchScopeType } from "../../entities/search.interface";
export { encodeOffsetCursor, decodeOffsetCursor } from "../../../../core/utils/cursor";
import type { WorkspaceSearchQueryDto } from "../../dtos";

/** Một loại kết quả (`type=`) — nhận ngữ cảnh người tìm + query đã kiểm, trả một trang cursor. */
export interface Searcher<T> {
  search(ctx: SearchContext, query: WorkspaceSearchQueryDto): Promise<SearchPage<T>>;
}

export function emptyPage<T>(limit: number, truncated = false): SearchPage<T> {
  return { data: [], meta: { nextCursor: null, hasMore: false, limit, partial: false, truncated } };
}

export const unique = <T>(values: readonly T[]): T[] => Array.from(new Set(values));

export const scopeKey = (type: SearchScopeType, id: string): string => `${type}:${id}`;
