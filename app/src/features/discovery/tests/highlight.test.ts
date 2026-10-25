import { splitByHighlights } from '../utils/highlight';

const joined = (segments: { text: string }[]) => segments.map((s) => s.text).join('');

/**
 * `highlights` của BE tính theo UTF-16 CODE UNIT của `snippet` (be.md p1-09 §2) — dùng thẳng với `slice`. Ba nhóm ca hay
 * vỡ: chữ có dấu, emoji ngoài BMP (2 code unit), và dữ liệu bẩn từ server.
 */
describe('splitByHighlights', () => {
  it('cắt đúng đoạn khớp theo code unit — chữ có dấu tiếng Việt (dựng sẵn)', () => {
    const text = 'Họp đồ án nhóm';
    const segments = splitByHighlights(text, [{ start: 4, end: 9 }]);

    expect(segments).toEqual([
      { text: 'Họp ', highlighted: false },
      { text: 'đồ án', highlighted: true },
      { text: ' nhóm', highlighted: false },
    ]);
  });

  it('theo CODE UNIT chứ không phải grapheme: "e" + dấu rời (NFD) chiếm 2 đơn vị', () => {
    const text = 'cafe\u0301 ngon'; // "café" dạng tổ hợp: 4 grapheme nhưng 5 code unit
    const segments = splitByHighlights(text, [{ start: 0, end: 5 }]);

    expect(segments[0]).toEqual({ text: 'cafe\u0301', highlighted: true });
    expect(joined(segments)).toBe(text);
  });

  it('emoji ngoài BMP: đoạn khớp ôm trọn cả cặp surrogate', () => {
    const text = 'vui 🙂 lắm'; // "🙂" ở vị trí 4–5 (2 code unit)
    const segments = splitByHighlights(text, [{ start: 4, end: 6 }]);

    expect(segments).toEqual([
      { text: 'vui ', highlighted: false },
      { text: '🙂', highlighted: true },
      { text: ' lắm', highlighted: false },
    ]);
  });

  it('biên rơi GIỮA cặp surrogate thì nới cho tròn cặp — không bao giờ sinh ký tự lỗi', () => {
    const text = 'vui 🙂 lắm';

    const endInside = splitByHighlights(text, [{ start: 0, end: 5 }]);
    expect(endInside[0]?.text).toBe('vui 🙂');

    const startInside = splitByHighlights(text, [{ start: 5, end: 7 }]);
    expect(startInside.find((s) => s.highlighted)?.text).toBe('🙂 ');

    for (const segment of [...endInside, ...startInside]) {
      expect(segment.text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/);
    }
  });

  it('dấu "…" đầu/cuối snippet (đã cắt) không làm lệch vị trí', () => {
    const text = '…bàn về đồ án cuối kỳ…';
    const start = text.indexOf('đồ án');
    const segments = splitByHighlights(text, [{ start, end: start + 5 }]);

    expect(segments.find((s) => s.highlighted)?.text).toBe('đồ án');
    expect(joined(segments)).toBe(text);
  });

  it('sắp xếp, gộp đoạn chồng/liền nhau', () => {
    const segments = splitByHighlights('abcdefghij', [
      { start: 6, end: 8 },
      { start: 1, end: 3 },
      { start: 2, end: 4 },
    ]);

    expect(segments.filter((s) => s.highlighted).map((s) => s.text)).toEqual(['bcd', 'gh']);
    expect(joined(segments)).toBe('abcdefghij');
  });

  it('dữ liệu bẩn: kẹp vào độ dài, bỏ đoạn rỗng/không nguyên/NaN, không ném lỗi', () => {
    const text = 'abc';
    const segments = splitByHighlights(text, [
      { start: -5, end: 1 },
      { start: 2, end: 99 },
      { start: 1, end: 1 },
      { start: Number.NaN, end: 2 },
      { start: 0.5, end: 2 },
    ]);

    expect(segments.filter((s) => s.highlighted).map((s) => s.text)).toEqual(['a', 'c']);
    expect(joined(segments)).toBe(text);
  });

  it('không có highlight → MỘT đoạn thường; chuỗi rỗng → không có đoạn nào', () => {
    expect(splitByHighlights('abc', [])).toEqual([{ text: 'abc', highlighted: false }]);
    expect(splitByHighlights('', [{ start: 0, end: 1 }])).toEqual([]);
  });
});
