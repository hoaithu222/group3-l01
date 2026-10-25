import { DEFAULT_SEARCH_LIMITS, validateSearchText } from '../utils/search-query';

describe('validateSearchText — chặn từ khoá chắc chắn bị SRCH_001/002 trước khi gọi API', () => {
  it('rỗng / chỉ toàn khoảng trắng → empty', () => {
    expect(validateSearchText('').issue).toBe('empty');
    expect(validateSearchText('   ').issue).toBe('empty');
  });

  it('1 ký tự → too-short; 2 ký tự → hợp lệ (queryMin 2)', () => {
    expect(validateSearchText('a').issue).toBe('too-short');
    expect(validateSearchText('đ').issue).toBe('too-short');
    expect(validateSearchText('do').issue).toBeNull();
  });

  it('trần 100 ký tự: 100 hợp lệ, 101 → too-long', () => {
    expect(validateSearchText('a'.repeat(100)).issue).toBeNull();
    expect(validateSearchText('a'.repeat(101)).issue).toBe('too-long');
  });

  it('đếm theo code point: emoji ngoài BMP tính là 1 ký tự, không phải 2', () => {
    expect(validateSearchText('🙂🙂'.repeat(50)).issue).toBeNull(); // 100 code point = 200 code unit
    expect(validateSearchText('🙂').issue).toBe('too-short');
  });

  it('tối đa 8 từ (AND theo từ): 8 hợp lệ, 9 → too-many-terms', () => {
    expect(validateSearchText('a1 b2 c3 d4 e5 f6 g7 h8').issue).toBeNull();
    expect(validateSearchText('a1 b2 c3 d4 e5 f6 g7 h8 i9').issue).toBe('too-many-terms');
  });

  it('gom khoảng trắng thừa và chuẩn hoá NFC — chuỗi trả về là chuỗi THẬT SỰ gửi đi', () => {
    // "a" + dấu sắc RỜI (NFD) phải về "á" một ký tự (NFC) như BE.
    const check = validateSearchText('  do   a\u0301n  ');
    expect(check.text).toBe('do \u00e1n');
    expect(check.issue).toBeNull();
  });

  it('giới hạn lấy từ capabilities ghi đè được mặc định', () => {
    expect(DEFAULT_SEARCH_LIMITS).toEqual({ queryMin: 2, queryMax: 100, maxTerms: 8 });
    expect(validateSearchText('abc', { queryMin: 4, queryMax: 10, maxTerms: 2 }).issue).toBe('too-short');
    expect(validateSearchText('a b c', { queryMin: 2, queryMax: 10, maxTerms: 2 }).issue).toBe(
      'too-many-terms',
    );
  });
});
