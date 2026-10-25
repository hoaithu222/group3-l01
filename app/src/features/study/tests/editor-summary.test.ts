import { createEditorDraft, newDraftItem, type DraftItem } from '../utils/editor-draft';
import {
  countNeedsFix,
  describeBreakdown,
  describeSummary,
  summarizeDraft,
} from '../utils/editor-summary';
import { ITEM_TYPE_HINT, ITEM_TYPE_SHORT, ITEM_TYPE_TONE } from '../utils/editor-type-meta';
import { STUDY_ITEM_TYPES } from '../api/study.types';
import { makeChoiceItem, makeItem } from './fixtures';

/** Thanh tóm tắt của trình soạn ("12 mục · 3 dạng"): đếm theo dạng, dòng phụ, và số mục "Cần sửa". */
function itemsOf(...types: DraftItem['type'][]) {
  const items: Record<string, DraftItem> = {};
  const order: string[] = [];
  types.forEach((type) => {
    const item = newDraftItem(type);
    items[item.clientItemKey] = item;
    order.push(item.clientItemKey);
  });
  return { items, order };
}

describe('summarizeDraft', () => {
  it('bộ rỗng ⇒ "Chưa có mục nào", không có dòng phụ', () => {
    const summary = summarizeDraft({}, []);
    expect(summary).toEqual({ byType: [], total: 0, typeCount: 0 });
    expect(describeSummary(summary)).toBe('Chưa có mục nào');
    expect(describeBreakdown(summary)).toBe('');
  });

  it('đếm theo dạng, giữ thứ tự cố định của STUDY_ITEM_TYPES (không theo thứ tự thêm)', () => {
    const { items, order } = itemsOf('TRUE_FALSE', 'FLASHCARD', 'FLASHCARD', 'MULTIPLE_CHOICE');
    const summary = summarizeDraft(items, order);

    expect(summary.total).toBe(4);
    expect(summary.typeCount).toBe(3);
    expect(summary.byType.map((entry) => entry.type)).toEqual([
      'FLASHCARD',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
    ]);
    expect(describeSummary(summary)).toBe('4 mục · 3 dạng');
    expect(describeBreakdown(summary)).toBe('2 thẻ ghi nhớ · 1 trắc nghiệm · 1 đúng / sai');
  });

  it('chỉ một dạng ⇒ không lặp lại ở dòng phụ; khoá thừa trong `order` bị bỏ qua', () => {
    const { items, order } = itemsOf('FLASHCARD', 'FLASHCARD');
    const summary = summarizeDraft(items, [...order, 'khong-ton-tai']);

    expect(describeSummary(summary)).toBe('2 mục · 1 dạng');
    expect(describeBreakdown(summary)).toBe('');
  });
});

describe('countNeedsFix', () => {
  const order = ['a', 'b', 'c'];

  it('đếm mục có lỗi cục bộ HOẶC lỗi server, mỗi mục một lần', () => {
    const problems = { a: [{ field: 'prompt', message: 'x' }], b: [] };
    const serverErrors = { a: { fields: [] }, c: { fields: [] } };
    expect(countNeedsFix(order, problems, serverErrors)).toBe(2);
  });

  it('lỗi của mục đã xoá (không còn trong order) không làm báo oan', () => {
    const problems = { daXoa: [{ field: 'prompt', message: 'x' }] };
    expect(countNeedsFix(order, problems, {})).toBe(0);
  });
});

describe('editor-type-meta', () => {
  it('đủ tông, mô tả và tên ngắn cho MỌI dạng mục (thêm dạng mới ở API mà quên bảng này là tsc/test đỏ)', () => {
    STUDY_ITEM_TYPES.forEach((type) => {
      expect(ITEM_TYPE_TONE[type]).toBeTruthy();
      expect(ITEM_TYPE_HINT[type].length).toBeGreaterThan(0);
      expect(ITEM_TYPE_SHORT[type]).toBe(ITEM_TYPE_SHORT[type].toLowerCase());
    });
  });

  it('tông không trùng nhau giữa các dạng (mắt phân biệt được bằng màu, dù màu không phải kênh duy nhất)', () => {
    const tones = STUDY_ITEM_TYPES.map((type) => ITEM_TYPE_TONE[type]);
    expect(new Set(tones).size).toBe(tones.length);
  });

  it('createEditorDraft dùng được với dữ liệu server để đếm (đường thật của màn)', () => {
    const draft = createEditorDraft(1, [makeItem({ id: 'i1' }), makeChoiceItem({ id: 'i2' })]);
    expect(describeSummary(summarizeDraft(draft.items, draft.order))).toBe('2 mục · 2 dạng');
  });
});
