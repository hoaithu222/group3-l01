import { normalizeSearch } from "../../../../core/utils/normalize";
import { matchesAllTokens } from "../../../../core/utils/search-query";
import type { WorkspaceSearchQueryDto } from "../../dtos";
import type { ChannelHit, SearchContext, SearchPage } from "../../entities/search.interface";
import type { ReadableScopesService } from "../readable-scopes.service";
import { decodeOffsetCursor, encodeOffsetCursor, type Searcher } from "./searcher.types";

/**
 * Tìm KÊNH theo tên (`type=channels`): kênh công khai + kênh riêng tư có grant (khách: chỉ kênh được chỉ định) — cùng tập
 * `ReadableScopesService` với tìm tin nên không lộ tên kênh riêng tư không được grant (WS-09). Kênh đã tham gia xếp trước.
 * Danh sách nhỏ (≤ `LIMITS.channel.perWorkspaceMax`) tính trong bộ nhớ, cursor theo chỉ số (`n:<offset>`).
 */
export class ChannelSearcher implements Searcher<ChannelHit> {
  constructor(private readonly scopes: ReadableScopesService) {}

  async search(ctx: SearchContext, query: WorkspaceSearchQueryDto): Promise<SearchPage<ChannelHit>> {
    const [readable, joined] = await Promise.all([
      this.scopes.compute({
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        role: ctx.role,
        includeDirect: false,
        withConversations: false,
        max: Number.MAX_SAFE_INTEGER,
      }),
      this.scopes.joinedChannelIds(ctx.workspaceId, ctx.userId),
    ]);

    const matches = [...readable.channels.values()]
      .filter((c) => matchesAllTokens(normalizeSearch(c.name), ctx.tokens))
      .sort(
        (a, b) =>
          Number(joined.has(b.id)) - Number(joined.has(a.id)) || a.normalizedName.localeCompare(b.normalizedName) || a.id.localeCompare(b.id)
      );

    const offset = decodeOffsetCursor(query.cursor);
    const page = matches.slice(offset, offset + query.limit);
    const hasMore = offset + query.limit < matches.length;
    return {
      data: page.map((c) => ({
        channelId: c.id,
        name: c.name,
        type: c.type,
        visibility: c.visibility,
        status: c.status,
        joined: joined.has(c.id),
        ...(ctx.isGuest ? {} : { memberCount: c.memberCount }),
      })),
      meta: {
        nextCursor: hasMore ? encodeOffsetCursor(offset + query.limit) : null,
        hasMore,
        limit: query.limit,
        partial: false,
        truncated: false,
      },
    };
  }
}
