import type { FillMatchMode, StudyItemDto } from '../api/study.types';
import { gradeQuickAnswer, normalizeFillText } from '../utils/quick-quiz-grader';
import { makeItem } from './fixtures';

/** Chấm câu điền chỗ trống theo `matchMode` — khớp `normalizeAnswer`/`gradeAnswer` của BE (tiếng Việt có dấu, khoảng trắng thừa, hoa/thường, nhiều đáp án). */
const fill = (acceptedAnswers: string[], matchMode: FillMatchMode): StudyItemDto =>
  makeItem({ acceptedAnswers, matchMode, type: 'FILL_BLANK' });
const ok = (item: StudyItemDto, text: string): boolean => gradeQuickAnswer(item, { text }).correct;

describe('IGNORE_ACCENTS — bỏ dấu tiếng Việt, hoa/thường, khoảng trắng', () => {
  const item = fill(['Hà Nội'], 'IGNORE_ACCENTS');

  it('"ha noi" khớp "Hà Nội"; hoa/thường và khoảng trắng thừa vô hại', () => {
    expect(ok(item, 'ha noi')).toBe(true);
    expect(ok(item, '  HA   NOI ')).toBe(true);
    expect(ok(item, 'Hà Nội')).toBe(true);
    expect(ok(item, 'hà nội')).toBe(true);
  });

  it('chữ đ / Đ cũng bỏ dấu (không nằm trong dải dấu tổ hợp của NFD)', () => {
    expect(ok(fill(['Đà Nẵng'], 'IGNORE_ACCENTS'), 'da nang')).toBe(true);
    expect(ok(fill(['đồng'], 'IGNORE_ACCENTS'), 'DONG')).toBe(true);
  });

  it('khác chữ cái vẫn sai', () => {
    expect(ok(item, 'ha nam')).toBe(false);
    expect(ok(item, 'hanoi')).toBe(false);
  });
});

describe('EXACT — phân biệt hoa/thường VÀ dấu, chỉ gộp khoảng trắng', () => {
  const item = fill(['Hà Nội'], 'EXACT');

  it('chỉ khớp đúng chữ; sai dấu hoặc hoa/thường ⇒ sai', () => {
    expect(ok(item, 'Hà Nội')).toBe(true);
    expect(ok(item, 'ha noi')).toBe(false);
    expect(ok(item, 'hà nội')).toBe(false);
    expect(ok(item, 'HÀ NỘI')).toBe(false);
  });

  it('khoảng trắng thừa (đầu, cuối, giữa, tab) không làm sai', () => {
    expect(ok(item, '  Hà   Nội  ')).toBe(true);
    expect(ok(item, 'Hà\tNội')).toBe(true);
    expect(ok(item, 'Hà Nội')).toBe(true);
  });
});

describe('IGNORE_CASE — không phân biệt hoa/thường nhưng PHÂN BIỆT dấu', () => {
  const item = fill(['Hà Nội'], 'IGNORE_CASE');

  it('"HÀ NỘI" khớp; "ha noi" (mất dấu) thì không', () => {
    expect(ok(item, 'HÀ NỘI')).toBe(true);
    expect(ok(item, 'hà nội')).toBe(true);
    expect(ok(item, 'ha noi')).toBe(false);
  });
});

describe('dạng dựng sẵn (NFC) và tổ hợp (NFD) là MỘT — kể cả chế độ EXACT', () => {
  const composed = 'Hà Nội'.normalize('NFC');
  const decomposed = composed.normalize('NFD');

  it('bộ gõ sinh dấu tổ hợp vẫn được chấm đúng', () => {
    expect(composed).not.toBe(decomposed);
    expect(ok(fill([composed], 'EXACT'), decomposed)).toBe(true);
    expect(ok(fill([decomposed], 'IGNORE_CASE'), composed)).toBe(true);
    expect(ok(fill([composed], 'IGNORE_ACCENTS'), decomposed)).toBe(true);
  });
});

describe('nhiều đáp án chấp nhận', () => {
  const item = fill(['Hà Nội', 'Thăng Long', 'Đông Đô'], 'IGNORE_ACCENTS');

  it('khớp BẤT KỲ đáp án nào trong danh sách', () => {
    expect(ok(item, 'thang long')).toBe(true);
    expect(ok(item, 'dong do')).toBe(true);
    expect(ok(item, 'hue')).toBe(false);
  });

  it('chuỗi rỗng, chỉ khoảng trắng hoặc thiếu `text` luôn sai', () => {
    expect(ok(item, '')).toBe(false);
    expect(ok(item, '   ')).toBe(false);
    expect(gradeQuickAnswer(item, {})).toEqual({ correct: false });
  });
});

it('emoji (kể cả ghép ZWJ) so khớp theo chuỗi, không vỡ chuẩn hoá', () => {
  const family = '👨‍👩‍👧';
  expect(ok(fill([family], 'EXACT'), family)).toBe(true);
  expect(ok(fill(['👍'], 'IGNORE_ACCENTS'), '👍')).toBe(true);
  expect(ok(fill(['👍'], 'EXACT'), '👎')).toBe(false);
});

describe('normalizeFillText', () => {
  it('gộp khoảng trắng và trim ở mọi chế độ', () => {
    expect(normalizeFillText('  a   b  ', 'EXACT')).toBe('a b');
    expect(normalizeFillText('  A   B  ', 'IGNORE_CASE')).toBe('a b');
    expect(normalizeFillText('  Á   B  ', 'IGNORE_ACCENTS')).toBe('a b');
  });
});
