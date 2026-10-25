import {
  describeNavCell,
  describeSubmit,
  navCellState,
  navSummary,
  selectedCount,
} from '../utils/mock-nav-utils';

/** Trạng thái lưới câu (đã làm / bỏ trống / đánh dấu / chưa đồng bộ) và các câu chữ đi kèm — logic thuần. */
const questions = ['q1', 'q2', 'q3', 'q4'].map((itemId) => ({ itemId }));

describe('navCellState', () => {
  it('đã trả lời ⇒ answered; chưa ⇒ blank', () => {
    expect(navCellState(true)).toBe('answered');
    expect(navCellState(false)).toBe('blank');
  });
});

describe('describeNavCell', () => {
  it('nhãn trợ năng đọc đủ trạng thái, đúng thứ tự', () => {
    expect(describeNavCell(1, { done: false, flagged: false, pending: false })).toBe(
      'Câu 1, chưa trả lời',
    );
    expect(describeNavCell(7, { done: true, flagged: true, pending: true })).toBe(
      'Câu 7, đã trả lời, đánh dấu xem lại, chưa đồng bộ',
    );
    expect(describeNavCell(2, { done: true, flagged: false, pending: true })).toBe(
      'Câu 2, đã trả lời, chưa đồng bộ',
    );
  });
});

describe('navSummary', () => {
  it('đếm theo đề: đã làm + bỏ trống = tổng; đánh dấu và chưa đồng bộ đếm riêng', () => {
    const summary = navSummary(
      questions,
      new Set(['q1', 'q3']),
      new Set(['q2', 'q3']),
      new Set(['q1']),
    );
    expect(summary).toEqual({ answered: 2, blank: 2, flagged: 2, pending: 1 });
  });

  it('bỏ qua mã câu ngoài đề và chịu được tập đánh dấu/chờ gửi vắng mặt', () => {
    expect(navSummary(questions, new Set(['q1', 'khac']), undefined, undefined)).toEqual({
      answered: 1,
      blank: 3,
      flagged: 0,
      pending: 0,
    });
  });
});

describe('describeSubmit', () => {
  it('nêu số câu còn trống; hết trống thì khen; có câu đánh dấu thì nhắc thêm', () => {
    expect(describeSubmit(3, 0)).toBe('Còn 3 câu chưa trả lời.');
    expect(describeSubmit(0, 0)).toBe('Bạn đã trả lời hết các câu.');
    expect(describeSubmit(1, 2)).toBe('Còn 1 câu chưa trả lời. Có 2 câu đang đánh dấu xem lại.');
    expect(describeSubmit(0, 1)).toBe(
      'Bạn đã trả lời hết các câu. Có 1 câu đang đánh dấu xem lại.',
    );
  });
});

describe('selectedCount', () => {
  it('số đáp án đang chọn của câu nhiều lựa chọn; chưa trả lời ⇒ 0', () => {
    expect(selectedCount(undefined)).toBe(0);
    expect(selectedCount({ itemId: 'q1', optionIds: [] })).toBe(0);
    expect(selectedCount({ itemId: 'q1', optionIds: ['a', 'b'] })).toBe(2);
    expect(selectedCount({ itemId: 'q1', text: 'abc' })).toBe(0);
  });
});
