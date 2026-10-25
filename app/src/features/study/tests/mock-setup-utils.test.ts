import type { StudyItemType } from '../api/study.types';
import {
  buildCreatePayload,
  effectiveCount,
  gradableItems,
  paceLabel,
  paceSeconds,
  poolSize,
  topicCounts,
} from '../utils/mock-setup-utils';

/** Cấu hình thi thử: đếm câu chấm được / chủ đề từ mục của bộ, cắt số câu, và nội dung gửi BE — logic thuần. */
const item = (type: StudyItemType, tags: string[] = []) => ({ tags, type });
const items = [
  item('MULTIPLE_CHOICE', ['toan', 'de']),
  item('TRUE_FALSE', ['toan']),
  item('FILL_BLANK', ['ly']),
  item('FLASHCARD', ['toan', 'ly']),
  item('MULTI_SELECT'),
];

describe('câu chấm được', () => {
  it('loại FLASHCARD (đúng luật của BE)', () => {
    expect(gradableItems(items)).toHaveLength(4);
  });

  it('poolSize: không chọn chủ đề ⇒ mọi câu chấm được; chọn ⇒ câu có ÍT NHẤT một thẻ trùng', () => {
    expect(poolSize(items, [])).toBe(4);
    expect(poolSize(items, ['toan'])).toBe(2); // flashcard "toan" KHÔNG tính
    expect(poolSize(items, ['toan', 'ly'])).toBe(3);
    expect(poolSize(items, ['khong-co'])).toBe(0);
  });

  it('topicCounts: đếm câu chấm được theo chủ đề, nhiều câu trước, bằng nhau theo chữ cái', () => {
    expect(topicCounts(items)).toEqual([
      { count: 2, tag: 'toan' },
      { count: 1, tag: 'de' },
      { count: 1, tag: 'ly' },
    ]);
  });

  it('bộ không có câu chấm được ⇒ không chủ đề, pool 0', () => {
    const cards = [item('FLASHCARD', ['a'])];
    expect(topicCounts(cards)).toEqual([]);
    expect(poolSize(cards, [])).toBe(0);
  });
});

describe('effectiveCount / paceSeconds', () => {
  it('cắt về số câu có sẵn; chưa biết (null) thì tin số đã chọn', () => {
    expect(effectiveCount(20, 12)).toBe(12);
    expect(effectiveCount(10, 50)).toBe(10);
    expect(effectiveCount(20, null)).toBe(20);
    expect(effectiveCount(20, 0)).toBe(0);
  });

  it('thời gian trung bình mỗi câu (giây); không có câu ⇒ null (không chia cho 0)', () => {
    expect(paceSeconds(20, 20)).toBe(60);
    expect(paceSeconds(10, 40)).toBe(15);
    expect(paceSeconds(20, 0)).toBeNull();
  });

  it('paceLabel: dưới 90 giây theo giây, từ 90 giây theo phút (dấu phẩy)', () => {
    expect(paceLabel(60)).toEqual({ unit: 'giây / câu', value: '60' });
    expect(paceLabel(89)).toEqual({ unit: 'giây / câu', value: '89' });
    expect(paceLabel(90)).toEqual({ unit: 'phút / câu', value: '1,5' });
    expect(paceLabel(120)).toEqual({ unit: 'phút / câu', value: '2' });
  });
});

describe('buildCreatePayload', () => {
  it('cấu hình mặc định giữ đúng hình dạng cũ `{ count, durationSec }` (BE mặc định shuffle = true)', () => {
    expect(buildCreatePayload({ count: 40, minutes: 30, shuffle: true, tags: [] })).toEqual({
      count: 40,
      durationSec: 1800,
    });
  });

  it('tắt trộn ⇒ gửi `shuffle: false`; có chủ đề ⇒ gửi `tags`', () => {
    expect(buildCreatePayload({ count: 10, minutes: 10, shuffle: false, tags: ['toan'] })).toEqual({
      count: 10,
      durationSec: 600,
      shuffle: false,
      tags: ['toan'],
    });
  });

  it('không giữ tham chiếu tới mảng chủ đề của state', () => {
    const tags = ['a'];
    const payload = buildCreatePayload({ count: 10, minutes: 10, shuffle: true, tags });
    expect(payload.tags).toEqual(['a']);
    expect(payload.tags).not.toBe(tags);
  });
});
