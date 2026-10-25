import { LIMITS } from "../../../core/constants/limits";
import { AppError } from "../../../core/exceptions";
import type { ResolvedAccess } from "../../../core/permission";
import type { AuthUser } from "../../../core/types/express";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import { tokenize } from "../../../core/utils/search-query";
import type { SearchType, WorkspaceSearchQueryDto } from "../dtos";
import type {
  ChannelHit,
  FileHit,
  MeetingHit,
  MessageHit,
  PersonHit,
  SearchContext,
  SearchPage,
} from "../entities/search.interface";
import type { Searcher } from "./searchers/searcher.types";

/** Một searcher cho mỗi `type=`. */
export interface SearcherMap {
  messages: Searcher<MessageHit>;
  files: Searcher<FileHit>;
  channels: Searcher<ChannelHit>;
  people: Searcher<PersonHit>;
  meetings: Searcher<MeetingHit>;
}

export type SearchHit = MessageHit | FileHit | ChannelHit | PersonHit | MeetingHit;

/**
 * Điều phối `GET /workspaces/:workspaceId/search` (be.md p5-04 §5): kiểm từ khoá (`SRCH_101`), dựng ngữ cảnh người tìm rồi giao cho
 * searcher của `type=`. Quyền vào workspace (`requireWorkspaceRole("GUEST")`) đã kiểm ở route; quyền TỪNG scope do searcher tính.
 * Không bao giờ log từ khoá (riêng tư).
 */
export class WorkspaceSearchService {
  constructor(private readonly searchers: SearcherMap) {}

  async search(user: AuthUser, workspaceId: string, access: ResolvedAccess, query: WorkspaceSearchQueryDto): Promise<SearchPage<SearchHit>> {
    const tokenized = tokenize(query.q, {
      min: LIMITS.search.queryMin,
      max: LIMITS.search.queryMax,
      maxTokens: LIMITS.search.maxTerms,
    });
    if (!tokenized.valid) throw new AppError(ErrorMessages[ErrorCode.SRCH_101], 400, ErrorCode.SRCH_101);

    const ctx: SearchContext = {
      user,
      userId: user.id,
      workspaceId,
      role: access.role,
      isGuest: access.role === "GUEST",
      tokens: tokenized.tokens,
      regexes: tokenized.regexes,
    };
    const searcher = this.searchers[query.type as SearchType] as Searcher<SearchHit>;
    return searcher.search(ctx, query);
  }
}
