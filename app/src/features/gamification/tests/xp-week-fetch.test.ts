import type { XpEventDto, XpEventsPage } from '../api/gamification.types';
import { collectXpEventsSince } from '../utils/xp-week-fetch';

/** Tải nhiều trang sự kiện XP cho tới hết cửa sổ 7 ngày — `fetchPage` được truyền vào nên không cần mạng. */

const at = (dayOfMonth: number, hour: number): string =>
  new Date(2026, 8, dayOfMonth, hour, 0).toISOString();

const dto = (id: string, occurredAt: string): XpEventDto => ({
  blockedReason: null,
  capped: false,
  id,
  occurredAt,
  sourceType: 'TASK_COMPLETED',
  workspaceId: null,
  xp: 5,
});

const page = (data: XpEventDto[], nextCursor: string | null): XpEventsPage => ({
  data,
  meta: { hasMore: nextCursor !== null, limit: 50, nextCursor },
});

const since = new Date(2026, 8, 20);

describe('collectXpEventsSince', () => {
  it('đọc nhiều trang cho tới khi gặp sự kiện cũ hơn cửa sổ rồi DỪNG (không tải thừa)', async () => {
    const fetchPage = jest
      .fn<Promise<XpEventsPage>, [string | undefined]>()
      .mockResolvedValueOnce(page([dto('a', at(26, 9)), dto('b', at(25, 9))], 'c1'))
      .mockResolvedValueOnce(page([dto('c', at(21, 9)), dto('d', at(18, 9))], 'c2'))
      .mockResolvedValueOnce(page([dto('e', at(1, 9))], null));

    const result = await collectXpEventsSince(fetchPage, since);

    expect(result.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(result.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 'c1');
  });

  it('hết dữ liệu (hasMore false) ⇒ dừng, không cắt', async () => {
    const fetchPage = jest.fn().mockResolvedValue(page([dto('a', at(26, 9))], null));

    const result = await collectXpEventsSince(fetchPage, since);

    expect(result).toEqual({ events: [expect.objectContaining({ id: 'a' })], truncated: false });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('hết ngân sách trang mà vẫn còn sự kiện trong cửa sổ ⇒ `truncated` (tổng chỉ là cận dưới)', async () => {
    const fetchPage = jest.fn().mockResolvedValue(page([dto('a', at(26, 9))], 'tiếp'));

    const result = await collectXpEventsSince(fetchPage, since, 3);

    expect(result.truncated).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('dòng có thời điểm hỏng bị bỏ qua, KHÔNG làm dừng sớm', async () => {
    const fetchPage = jest
      .fn()
      .mockResolvedValueOnce(page([dto('hỏng', 'xxx'), dto('a', at(26, 9))], 'c1'))
      .mockResolvedValueOnce(page([dto('b', at(22, 9)), dto('cũ', at(10, 9))], null));

    const result = await collectXpEventsSince(fetchPage, since);

    expect(result.events.map((e) => e.id)).toEqual(['a', 'b']);
  });
});
