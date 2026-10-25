import type { TaskCommentView } from '../api/task-detail.types';
import {
  canEditComment,
  hasServerComment,
  mergeFeed,
  prependActivity,
  removeComment,
  tempCommentId,
  upsertComment,
  type PagesData,
} from '../utils/comment-feed';
import { makeActivity, makeComment } from './detail-fixtures';

function pages(...items: TaskCommentView[]): PagesData<TaskCommentView> {
  return { pageParams: [undefined], pages: [{ items, nextCursor: null }] };
}

describe('upsertComment', () => {
  it('bản tạm rồi bản server cùng clientCommentId hội tụ về MỘT dòng, đúng chỗ', () => {
    const temp: TaskCommentView = { ...makeComment({ id: tempCommentId('c-1') }), clientCommentId: 'c-1', localStatus: 'sending' };
    const older = makeComment({ id: 'old' });
    const withTemp = upsertComment(pages(older), temp);
    expect(withTemp.pages[0]?.items.map((item) => item.id)).toEqual([temp.id, 'old']);

    const server = makeComment({ clientCommentId: 'c-1', id: 'real-1' });
    const merged = upsertComment(withTemp, server);
    expect(merged.pages[0]?.items.map((item) => item.id)).toEqual(['real-1', 'old']);
    expect(merged.pages[0]?.items[0]?.localStatus).toBeUndefined();
  });

  it('bình luận của người khác tới qua socket được chèn ĐẦU; tới hai lần vẫn một dòng', () => {
    const incoming = makeComment({ id: 'x' });
    const once = upsertComment(pages(makeComment({ id: 'old' })), incoming);
    const twice = upsertComment(once, incoming);
    expect(twice.pages[0]?.items.map((item) => item.id)).toEqual(['x', 'old']);
  });

  it('chưa có cache thì tạo trang đầu chứa bình luận', () => {
    expect(upsertComment(undefined, makeComment({ id: 'a' })).pages[0]?.items).toHaveLength(1);
  });
});

describe('cache helpers', () => {
  it('hasServerComment chỉ đếm bản THẬT (không phải tmp_)', () => {
    const temp: TaskCommentView = { ...makeComment({ id: tempCommentId('c-9') }), clientCommentId: 'c-9' };
    expect(hasServerComment(pages(temp), 'c-9')).toBe(false);
    expect(hasServerComment(pages(makeComment({ clientCommentId: 'c-9', id: 'r' })), 'c-9')).toBe(true);
  });

  it('removeComment gỡ đúng bản; prependActivity chèn đầu bản MỚI', () => {
    expect(removeComment(pages(makeComment({ id: 'a' }), makeComment({ id: 'b' })), 'a')?.pages[0]?.items).toHaveLength(1);
    const base = { pageParams: [undefined], pages: [{ items: [makeActivity({ id: 'a1' })], nextCursor: null }] };
    expect(prependActivity(base, makeActivity({ id: 'a2' }))?.pages[0]?.items.map((item) => item.id)).toEqual(['a2', 'a1']);
  });

  it('prependActivity THAY TẠI CHỖ bản đã có cùng id (BE gộp tick checklist rồi phát lại cùng id, after.items mới)', () => {
    const old = makeActivity({ after: { items: [{ done: true, itemId: 'i1', text: 'A' }] }, id: 'cl1', type: 'CHECKLIST_DONE' });
    const other = makeActivity({ id: 'a0' });
    const base = { pageParams: [undefined], pages: [{ items: [other, old], nextCursor: null }] };
    const merged = makeActivity({
      after: { items: [{ done: true, itemId: 'i1', text: 'A' }, { done: true, itemId: 'i2', text: 'B' }] },
      id: 'cl1',
      type: 'CHECKLIST_DONE',
    });
    const next = prependActivity(base, merged);
    // Vị trí giữ nguyên (không dời lên đầu), nội dung là bản mới, không nhân đôi.
    expect(next?.pages[0]?.items.map((item) => item.id)).toEqual(['a0', 'cl1']);
    expect(next?.pages[0]?.items[1]).toBe(merged);
  });
});

describe('mergeFeed', () => {
  const activities = [makeActivity({ at: '2026-09-10T09:00:00.000Z', id: 'a1' })];
  const comments = [
    makeComment({ createdAt: '2026-09-10T10:00:00.000Z', id: 'c2' }),
    makeComment({ createdAt: '2026-09-10T08:00:00.000Z', id: 'c1' }),
  ];

  it('trộn theo thời gian MỚI → CŨ', () => {
    expect(mergeFeed(activities, comments, 'all').map((item) => item.id)).toEqual(['c_c2', 'a_a1', 'c_c1']);
  });

  it('lọc theo phân đoạn', () => {
    expect(mergeFeed(activities, comments, 'activity').map((item) => item.kind)).toEqual(['activity']);
    expect(mergeFeed(activities, comments, 'comments').map((item) => item.kind)).toEqual(['comment', 'comment']);
  });

  it('so thời gian bằng Date.parse: hai dạng ISO khác nhau vẫn đúng thứ tự', () => {
    const feed = mergeFeed(
      [makeActivity({ at: '2026-09-10T09:30:00+00:00', id: 'a' })],
      [makeComment({ createdAt: '2026-09-10T09:00:00.000Z', id: 'c' })],
      'all',
    );
    expect(feed.map((item) => item.id)).toEqual(['a_a', 'c_c']);
  });
});

describe('canEditComment (cửa sổ 15 phút)', () => {
  const created = '2026-09-10T08:00:00.000Z';
  const at = (minutes: number) => new Date(created).getTime() + minutes * 60_000;

  it('trong 15 phút sửa được, quá 16 phút thì không (PM2-23 phía client)', () => {
    expect(canEditComment({ createdAt: created }, at(14), 900)).toBe(true);
    expect(canEditComment({ createdAt: created }, at(16), 900)).toBe(false);
  });

  it('bản đang gửi/lỗi không sửa được', () => {
    expect(canEditComment({ createdAt: created, localStatus: 'sending' }, at(1), 900)).toBe(false);
  });
});
