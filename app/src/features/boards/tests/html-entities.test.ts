import type { TaskCommentDto, TaskDetailDto } from '../api/task-detail.types';
import { decodeComment, decodeHtmlEntities, decodeTaskDetail } from '../utils/html-entities';

/**
 * BE `sanitizeInput` escape `<`, `>`, `&` trong mô tả/bình luận khi lưu (be.md p3-03 §14 mục 14) — app giải mã
 * ĐÚNG MỘT LẦN ở biên nhận dữ liệu để code/so sánh hiển thị đúng và sửa-rồi-lưu không escape chồng.
 */
describe('decodeHtmlEntities', () => {
  it('giải mã đúng các thực thể sanitizer sinh ra (code, so sánh, trích dẫn markdown)', () => {
    expect(
      decodeHtmlEntities('```ts\nif (a &lt; b &amp;&amp; c &gt; d) {}\n```\n&gt; trích dẫn'),
    ).toBe('```ts\nif (a < b && c > d) {}\n```\n> trích dẫn');
    expect(decodeHtmlEntities('Tom &amp; Jerry &quot;hay&quot; &#39;nhất&#39;')).toBe(
      'Tom & Jerry "hay" \'nhất\'',
    );
  });

  it('MỘT lượt duy nhất: người dùng thật sự gõ "&lt;" (lưu thành &amp;lt;) chỉ về "&lt;", không thành "<"', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });

  it('chữ thường không thực thể và marker nhắc tên giữ nguyên', () => {
    const text = 'Xin chào @{u:6a6a6a6a6a6a6a6a6a6a6a6a}, 5 > 3 là đúng';
    expect(decodeHtmlEntities(text)).toBe(text);
    expect(decodeHtmlEntities('&unknown; &amp')).toBe('&unknown; &amp');
  });
});

describe('decodeTaskDetail / decodeComment', () => {
  it('chỉ đổi description/content; null và tombstone rỗng giữ nguyên tham chiếu', () => {
    const empty = { description: null } as unknown as TaskDetailDto;
    expect(decodeTaskDetail(empty)).toBe(empty);
    const detail = { description: 'a &lt; b', title: 'X' } as unknown as TaskDetailDto;
    expect(decodeTaskDetail(detail)).toMatchObject({ description: 'a < b', title: 'X' });

    const tombstone = { content: '' } as unknown as TaskCommentDto;
    expect(decodeComment(tombstone)).toBe(tombstone);
    expect(decodeComment({ content: '&gt; quote', id: 'c' })).toEqual({
      content: '> quote',
      id: 'c',
    });
  });
});
