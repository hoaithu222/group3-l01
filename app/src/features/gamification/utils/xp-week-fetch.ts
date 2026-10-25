import type { XpEventDto, XpEventsPage } from '../api/gamification.types';

/** Trần của BE (`LIMITS.gamification.xpEventsPageMax`) — mỗi trang lấy tối đa để ít vòng gọi nhất. */
export const XP_WEEK_PAGE_SIZE = 50;

/**
 * Số trang tối đa cho MỘT lần làm mới: 6 × 50 = 300 sự kiện. Người ôn thẻ (mỗi thẻ một sự kiện, kể cả sự kiện chạm
 * trần xp 0) có thể vượt con số đó trong 7 ngày — dừng ở đây để Trang chủ không bắn hàng chục request nối đuôi nhau;
 * phần bị cắt là các ngày CŨ nhất, và người gọi được báo qua `truncated`.
 */
export const XP_WEEK_MAX_PAGES = 6;

export interface XpWeekResult {
  /** Sự kiện trong cửa sổ (mới → cũ), đã bỏ phần cũ hơn `since`. */
  events: XpEventDto[];
  /** `true` ⇔ dừng vì hết ngân sách trang trong khi vẫn còn sự kiện thuộc cửa sổ ⇒ tổng tuần là CẬN DƯỚI. */
  truncated: boolean;
}

/**
 * Tải lần lượt các trang `GET /me/xp-events` (mới → cũ, cursor) cho tới khi gặp sự kiện cũ hơn `since`, hết dữ liệu,
 * hoặc hết `maxPages`. Hàm thuần theo nghĩa `fetchPage` được truyền vào — test không cần mạng.
 *
 * ⚠️ Sự kiện có `occurredAt` không đọc được bị BỎ QUA chứ không coi là "đã cũ": một dòng hỏng không được làm ta
 * dừng sớm và mất cả tuần dữ liệu phía sau.
 */
export async function collectXpEventsSince(
  fetchPage: (cursor: string | undefined) => Promise<XpEventsPage>,
  since: Date,
  maxPages: number = XP_WEEK_MAX_PAGES,
): Promise<XpWeekResult> {
  const events: XpEventDto[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor);
    let reachedOlder = false;
    for (const event of result.data) {
      const at = Date.parse(event.occurredAt);
      if (Number.isNaN(at)) continue;
      if (at >= since.getTime()) events.push(event);
      else reachedOlder = true;
    }
    const next = result.meta.nextCursor;
    if (reachedOlder || !result.meta.hasMore || !next) return { events, truncated: false };
    cursor = next;
  }
  return { events, truncated: true };
}
