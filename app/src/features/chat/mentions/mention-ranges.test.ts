import type { MentionRange } from '../api/chat.types';
import { countDistinctMentions, markInvalidRanges, segmentByRanges } from './mention-range-helpers';
import { applyTextChange, insertMention, sanitizeRanges } from './mention-ranges';

const chip = (start: number, label: string, userId = `u-${label}`): MentionRange => ({
  start,
  end: start + label.length + 1,
  type: 'USER',
  userId,
  label,
});

describe('applyTextChange — range bám chữ khi gõ', () => {
  const text = 'Chào @Minh và bạn';
  const ranges = [chip(5, 'Minh')];

  it('gõ THÊM trước chip → chip dịch theo', () => {
    const result = applyTextChange(text, `Xin ${text}`, ranges);
    expect(result.ranges).toEqual([chip(9, 'Minh')]);
  });

  it('gõ thêm SAU chip (kể cả sát mép) → chip đứng yên, chữ mới là chữ thường', () => {
    expect(applyTextChange(text, text.replace('Minh', 'Minhx'), ranges).ranges).toEqual(ranges);
    const atEnd = applyTextChange('@Minh', '@Minh!', [chip(0, 'Minh')]);
    expect(atEnd.ranges).toEqual([chip(0, 'Minh')]);
    expect(atEnd.text).toBe('@Minh!');
  });

  it('sửa chữ GIỮA chip → chip thành chữ thường (bỏ range, giữ chữ)', () => {
    const result = applyTextChange(text, 'Chào @Mxinh và bạn', ranges);
    expect(result.ranges).toEqual([]);
    expect(result.text).toBe('Chào @Mxinh và bạn');
  });

  it('BACKSPACE ngay sau chip → xoá NGUYÊN chip, không để lại "@Min" hỏng (MSG-37)', () => {
    const result = applyTextChange('Chào @Minh', 'Chào @Min', [chip(5, 'Minh')]);
    expect(result.text).toBe('Chào ');
    expect(result.ranges).toEqual([]);
  });

  it('xoá nguyên chip bằng vùng chọn → range biến mất, chip khác dịch đúng', () => {
    const two = 'a @Minh @An b';
    const both = [chip(2, 'Minh'), chip(8, 'An')];
    const result = applyTextChange(two, 'a  @An b', both);
    expect(result.ranges).toEqual([chip(3, 'An')]);
  });

  it('backspace ở chip THỨ HAI không đụng chip thứ nhất', () => {
    const two = '@Minh @An';
    const result = applyTextChange(two, '@Minh @A', [chip(0, 'Minh'), chip(6, 'An')]);
    expect(result.text).toBe('@Minh ');
    expect(result.ranges).toEqual([chip(0, 'Minh')]);
  });

  it('không đổi gì → trả nguyên tham chiếu', () => {
    expect(applyTextChange(text, text, ranges).ranges).toBe(ranges);
  });
});

describe('insertMention', () => {
  it('thay "@mi" bằng chip + dấu cách, con trỏ ra SAU dấu cách', () => {
    const result = insertMention(
      'Chào @mi',
      [],
      { start: 5, end: 8 },
      { type: 'USER', userId: 'u1', label: 'Minh' },
    );
    expect(result.text).toBe('Chào @Minh ');
    expect(result.ranges).toEqual([
      { start: 5, end: 10, type: 'USER', userId: 'u1', label: 'Minh' },
    ]);
    expect(result.cursor).toBe(11);
  });

  it('chèn giữa câu: chip sau dịch đúng, dấu cách có sẵn không bị nhân đôi', () => {
    const before = '@a x @Bình';
    const result = insertMention(
      before,
      [chip(5, 'Bình')],
      { start: 0, end: 2 },
      { type: 'USER', userId: 'u2', label: 'An' },
    );
    expect(result.text).toBe('@An x @Bình');
    expect(result.ranges.map((r) => r.label)).toEqual(['An', 'Bình']);
    expect(result.ranges[1]).toMatchObject({ start: 6, end: 11 });
    expect(result.cursor).toBe(4);
  });

  it('@Tất cả là chip loại ALL không có userId', () => {
    const result = insertMention('@', [], { start: 0, end: 1 }, { type: 'ALL', label: 'Tất cả' });
    expect(result.ranges[0]).toEqual({ start: 0, end: 7, type: 'ALL', label: 'Tất cả' });
  });
});

describe('tiện ích range', () => {
  it('sanitize bỏ range không còn khớp chữ hoặc chồng nhau', () => {
    expect(sanitizeRanges('@Minh', [chip(0, 'An')])).toEqual([]);
    expect(
      sanitizeRanges('@Minh ', [chip(0, 'Minh'), { ...chip(0, 'Minh'), userId: 'khac' }]),
    ).toHaveLength(1);
  });

  it('đếm theo đích DISTINCT, không theo số chip (BE giới hạn mentionsMax theo đích)', () => {
    expect(
      countDistinctMentions([chip(0, 'Minh', 'u1'), chip(6, 'Minh', 'u1'), chip(12, 'An', 'u2')]),
    ).toBe(2);
  });

  it('markInvalid chỉ tô chip có userId bị server từ chối', () => {
    const marked = markInvalidRanges([chip(0, 'Minh', 'u1'), chip(6, 'An', 'u2')], ['u2']);
    expect(marked.map((r) => r.invalid)).toEqual([false, true]);
  });

  it('segmentByRanges chia chữ thường/chip để dựng lớp tô nền', () => {
    const segments = segmentByRanges('Hi @Minh nhé', [chip(3, 'Minh')]);
    expect(segments.map((s) => [s.text, Boolean(s.range)])).toEqual([
      ['Hi ', false],
      ['@Minh', true],
      [' nhé', false],
    ]);
  });
});
