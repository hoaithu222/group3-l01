import { parseFlashcardText } from '../utils/csv-import';
import { CSV_EXAMPLE_TEXT, csvOutcome, describeDelimiter } from '../utils/csv-import-summary';

/** Tóm tắt của tấm nhập CSV + ví dụ "Dùng ví dụ này": ví dụ phải THẬT SỰ parse ra thẻ (không phải chữ minh hoạ vô dụng). */
const OPTIONS = { capacity: 500, maxLength: 2000 };

describe('CSV_EXAMPLE_TEXT', () => {
  it('parse ra đúng 3 thẻ, bỏ dòng tiêu đề, giữ thuật ngữ có dấu phẩy trong ngoặc kép', () => {
    const result = parseFlashcardText(CSV_EXAMPLE_TEXT, OPTIONS);

    expect(result.hasHeader).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.cards.map((card) => [card.term, card.definition])).toEqual([
      ['apple', 'quả táo'],
      ['book', 'quyển sách'],
      ['hello, world', 'xin chào'],
    ]);
  });
});

describe('csvOutcome', () => {
  it('đếm thẻ hợp lệ, dòng bỏ qua và thẻ vượt sức chứa', () => {
    const result = parseFlashcardText('a\t1\nb\t2\nc\t3\n\tthiếu', { ...OPTIONS, capacity: 2 });
    expect(csvOutcome(result)).toEqual({ overflow: 1, skipped: 1, valid: 2 });
  });

  it('văn bản chỉ toàn dòng lỗi ⇒ 0 hợp lệ', () => {
    const result = parseFlashcardText('\tchỉ có định nghĩa', OPTIONS);
    expect(csvOutcome(result)).toEqual({ overflow: 0, skipped: 1, valid: 0 });
  });
});

describe('describeDelimiter', () => {
  it('gọi tên dấu phân cách bằng tiếng Việt (Tab không hiện thành ký tự vô hình)', () => {
    expect(describeDelimiter('\t')).toBe('Tab');
    expect(describeDelimiter(',')).toBe('dấu phẩy');
    expect(describeDelimiter(';')).toBe('dấu chấm phẩy');
  });
});
