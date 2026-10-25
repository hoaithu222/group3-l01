import { createPollFormSchema, EMPTY_POLL_FORM, toCreatePollInput, type PollFormValues } from '../schemas/poll.schemas';
import { DEFAULT_CHAT_EXT_LIMITS } from '../utils/chat-ext-limits';

const NOW = new Date(2026, 8, 27, 10, 0, 0).getTime();
const schema = createPollFormSchema(DEFAULT_CHAT_EXT_LIMITS.poll, () => NOW);

const valid = (overrides: Partial<PollFormValues> = {}): PollFormValues => ({
  ...EMPTY_POLL_FORM,
  question: 'Đi ăn ở đâu?',
  options: [{ text: 'Phở' }, { text: 'Bún' }],
  ...overrides,
});

/** Đường dẫn lỗi → câu lỗi (phẳng để so sánh). */
const errorsOf = (values: PollFormValues): Record<string, string> => {
  const result = schema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]));
};

describe('createPollFormSchema — kiểm ở client (app.md §8: <2 lựa chọn/trùng → không gửi)', () => {
  it('hợp lệ: không lỗi', () => {
    expect(errorsOf(valid())).toEqual({});
  });

  it('câu hỏi trống/chỉ khoảng trắng → lỗi ở ô câu hỏi; quá dài (theo grapheme) → lỗi', () => {
    expect(errorsOf(valid({ question: '   ' })).question).toBe('Hãy nhập câu hỏi');
    expect(errorsOf(valid({ question: 'a'.repeat(301) })).question).toBe('Câu hỏi tối đa 300 ký tự');
    expect(errorsOf(valid({ question: 'a'.repeat(300) })).question).toBeUndefined();
  });

  it('lựa chọn để trống → lỗi đúng dòng đó', () => {
    expect(errorsOf(valid({ options: [{ text: 'Phở' }, { text: '  ' }] }))['options.1.text']).toBe('Hãy nhập lựa chọn');
  });

  it('lựa chọn TRÙNG sau khi bỏ dấu + chữ thường ("Có" ≡ "co") → lỗi ở dòng trùng (dòng sau)', () => {
    const errors = errorsOf(valid({ options: [{ text: 'Có' }, { text: 'Bún' }, { text: ' co ' }] }));
    expect(errors['options.2.text']).toBe('Lựa chọn này bị trùng');
    expect(errors['options.0.text']).toBeUndefined();
  });

  it('lựa chọn quá dài → lỗi đúng dòng', () => {
    expect(errorsOf(valid({ options: [{ text: 'Phở' }, { text: 'x'.repeat(101) }] }))['options.1.text']).toBe('Lựa chọn tối đa 100 ký tự');
  });

  it('quá số lựa chọn tối đa (theo limits) → schema từ chối', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ text: `Lựa chọn ${i}` }));
    expect(schema.safeParse(valid({ options: many })).success).toBe(false);
  });
});

describe('hạn chốt — theo limits.poll và giờ máy chủ', () => {
  const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0);
  const withDeadline = (date: Date, time: string) => valid({ deadlineDate: date, deadlineOn: true, deadlineTime: time });

  it('bật mà thiếu ngày / thiếu giờ → lỗi ở ô tương ứng', () => {
    expect(errorsOf(valid({ deadlineOn: true })).deadlineDate).toBe('Chọn ngày kết thúc');
    expect(errorsOf(withDeadline(at(28, 0), '')).deadlineTime).toBe('Chọn giờ kết thúc');
  });

  it('quá khứ / chưa đủ 1 phút → lỗi ở ô giờ; hợp lệ (ngày mai 09:00) → không lỗi', () => {
    expect(errorsOf(withDeadline(at(27, 0), '09:00')).deadlineTime).toMatch(/^Hạn kết thúc phải sau ít nhất 1 phút/);
    expect(errorsOf(withDeadline(at(28, 0), '09:00')).deadlineTime).toBeUndefined();
  });

  it('xa quá 30 ngày → "chỉ trong vòng 30 ngày tới"', () => {
    expect(errorsOf(withDeadline(new Date(2026, 10, 15), '09:00')).deadlineTime).toBe('Hạn kết thúc chỉ trong vòng 30 ngày tới');
  });

  it('tắt hạn chốt thì bỏ qua ngày/giờ dù đang có giá trị', () => {
    expect(errorsOf(valid({ deadlineDate: at(1, 0), deadlineOn: false, deadlineTime: '' }))).toEqual({});
  });
});

describe('toCreatePollInput', () => {
  it('không hạn: không có closesAt; có tên + lựa chọn đã cắt khoảng trắng', () => {
    const input = toCreatePollInput(valid({ anonymous: true, multi: true }), 'cid-1');
    expect(input).toEqual({ anonymous: true, clientMessageId: 'cid-1', multi: true, options: ['Phở', 'Bún'], question: 'Đi ăn ở đâu?' });
  });

  it('có hạn: closesAt là ISO UTC của mốc THEO GIỜ MÁY', () => {
    const input = toCreatePollInput(valid({ deadlineDate: new Date(2026, 8, 28), deadlineOn: true, deadlineTime: '09:00' }), 'cid-2');
    expect(input.closesAt).toBe(new Date(2026, 8, 28, 9, 0).toISOString());
  });
});
