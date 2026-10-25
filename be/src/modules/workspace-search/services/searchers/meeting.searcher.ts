import { encodeCursor } from "../../../../core/utils/cursor";
import { parseCursorPoint } from "../../../../core/utils/search-query";
import type { WorkspaceSearchQueryDto } from "../../dtos";
import type { MeetingHit, SearchContext, SearchPage } from "../../entities/search.interface";
import type { ICatalogSearchRepository } from "../../repositories/search.repository.interface";
import type { Searcher } from "./searcher.types";

/**
 * Tìm CUỘC HỌP theo tiêu đề (`type=meetings`): người tham dự còn hiệu lực, hoặc cuộc họp `visibility = WORKSPACE` khi người tìm không
 * phải khách (D-18; khớp resolver `MEETING`). Cuộc họp `ATTENDEES` mà người tìm không tham dự KHÔNG bao giờ trả — kể cả OWNER/ADMIN
 * (họ chỉ xem metadata khi đã biết id). Chỉ trả metadata (tiêu đề/giờ/trạng thái), không agenda/link. Sắp `startAt` mới → cũ.
 */
export class MeetingSearcher implements Searcher<MeetingHit> {
  constructor(private readonly catalog: ICatalogSearchRepository) {}

  async search(ctx: SearchContext, query: WorkspaceSearchQueryDto): Promise<SearchPage<MeetingHit>> {
    const attendeeIds = await this.catalog.attendeeMeetingIds(ctx.workspaceId, ctx.userId);
    const rows = await this.catalog.searchMeetings({
      workspaceId: ctx.workspaceId,
      regexes: ctx.regexes,
      includeWorkspaceVisible: !ctx.isGuest,
      attendeeMeetingIds: attendeeIds,
      before: parseCursorPoint(query.cursor),
      limit: query.limit + 1,
    });

    const page = rows.slice(0, query.limit);
    const hasMore = rows.length > query.limit;
    const last = page[page.length - 1];
    const attendees = new Set(attendeeIds);
    return {
      data: page.map((m) => ({
        meetingId: m.id,
        code: m.code,
        title: m.title,
        startAt: m.startAt,
        endAt: m.endAt,
        status: m.status,
        isAttendee: attendees.has(m.id),
      })),
      meta: {
        nextCursor: hasMore && last ? encodeCursor(last.startAt, last.id) : null,
        hasMore,
        limit: query.limit,
        partial: false,
        truncated: false,
      },
    };
  }
}
