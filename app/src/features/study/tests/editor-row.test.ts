import { createEditorDraft, newDraftItem } from '../utils/editor-draft';
import { updateItem } from '../utils/editor-ops';
import {
  changedItems,
  isItemBlank,
  itemDetail,
  itemMediaFlags,
  rowBadges,
} from '../utils/editor-row';
import { validateDraftItem } from '../utils/item-validation';
import { FALLBACK_STUDY_LIMITS, type StudyLimits } from '../constants/study.constants';
import { makeChoiceItem, makeItem } from './fixtures';

/** Hàng danh sách mục: nhãn "Mới/Đã sửa", huy hiệu vấn đề, dòng phụ, cờ media, và "mục trống" (xoá không cần hỏi). */
const LIMITS: StudyLimits = { ...FALLBACK_STUDY_LIMITS };

function draft() {
  return createEditorDraft(3, [
    makeItem({ id: 'i1', order: 1 }),
    makeChoiceItem({ id: 'i2', order: 2 }),
  ]);
}

describe('changedItems', () => {
  it('chưa đổi gì ⇒ rỗng', () => {
    expect(changedItems(draft())).toEqual({});
  });

  it('sửa nội dung ⇒ "edited"; mục thêm mới ⇒ "new"; mục khác giữ nguyên', () => {
    const base = draft();
    const fresh = newDraftItem('FLASHCARD');
    const changed = updateItem(base, 'i2', { prompt: 'Thủ đô nước ta?' });
    const withNew = {
      ...changed,
      items: { ...changed.items, [fresh.clientItemKey]: fresh },
      order: [...changed.order, fresh.clientItemKey],
    };

    expect(changedItems(withNew)).toEqual({ i2: 'edited', [fresh.clientItemKey]: 'new' });
  });

  it('chỉ ĐỔI CHỖ (nội dung y nguyên) không phải "đã sửa"', () => {
    const base = draft();
    const swapped = { ...base, order: ['i2', 'i1'] };
    expect(changedItems(swapped)).toEqual({});
  });
});

describe('rowBadges', () => {
  it('không vấn đề, không đổi ⇒ không huy hiệu', () => {
    expect(rowBadges({ problems: [], serverError: false })).toEqual([]);
  });

  it('chỉ thiếu đáp án (câu hỏi đã ổn) ⇒ "Thiếu đáp án"; thêm lỗi khác ⇒ "Cần sửa"', () => {
    const noAnswer = validateDraftItem({ ...newDraftItem('FLASHCARD'), prompt: 'Hello' }, LIMITS);
    expect(rowBadges({ problems: noAnswer, serverError: false }).map((b) => b.label)).toEqual([
      'Thiếu đáp án',
    ]);

    const blank = validateDraftItem(newDraftItem('FLASHCARD'), LIMITS);
    expect(rowBadges({ problems: blank, serverError: false }).map((b) => b.label)).toEqual([
      'Cần sửa',
    ]);
  });

  it('server báo lỗi ⇒ "Cần sửa" dù kiểm cục bộ sạch; kèm nhãn thay đổi phía sau', () => {
    const badges = rowBadges({ change: 'edited', problems: [], serverError: true });
    expect(badges.map((b) => b.label)).toEqual(['Cần sửa', 'Đã sửa']);
    expect(rowBadges({ change: 'new', problems: [], serverError: false })[0]?.label).toBe('Mới');
  });
});

describe('itemDetail', () => {
  it('mô tả đáp án theo từng dạng', () => {
    expect(itemDetail({ ...newDraftItem('FLASHCARD'), answerText: 'môi trường' })).toBe(
      '→ môi trường',
    );
    expect(itemDetail(newDraftItem('FLASHCARD'))).toBe('Chưa có định nghĩa');
    expect(itemDetail({ ...newDraftItem('TRUE_FALSE'), correct: false })).toBe('Đáp án: Sai');
    expect(
      itemDetail({ ...newDraftItem('FILL_BLANK'), acceptedAnswers: ['Hà Nội', ' ', 'Ha Noi'] }),
    ).toBe('Đáp án: Hà Nội / Ha Noi');
    expect(itemDetail(newDraftItem('FILL_BLANK'))).toBe('Chưa có đáp án');
  });

  it('trắc nghiệm: số lựa chọn + số đáp án đúng (hoặc nhắc chưa chọn)', () => {
    const choice = newDraftItem('MULTI_SELECT');
    expect(itemDetail(choice)).toBe('2 lựa chọn · chưa chọn đáp án đúng');
    const first = choice.options[0];
    expect(itemDetail({ ...choice, correctKeys: first ? [first.key] : [] })).toBe(
      '2 lựa chọn · 1 đúng',
    );
  });
});

describe('itemMediaFlags / isItemBlank', () => {
  it('ảnh của lựa chọn cũng tính là "có ảnh"', () => {
    const item = draft().items.i2;
    expect(item && itemMediaFlags(item)).toEqual({ audio: false, image: true });
    expect(itemMediaFlags({ ...newDraftItem('FLASHCARD'), audioAssetId: 'a1' })).toEqual({
      audio: true,
      image: false,
    });
  });

  it('mục vừa thêm (chưa gõ gì) là trống; có một chữ/đáp án/ảnh là không', () => {
    expect(isItemBlank(newDraftItem('MULTIPLE_CHOICE'))).toBe(true);
    expect(isItemBlank({ ...newDraftItem('FLASHCARD'), prompt: '   ' })).toBe(true);
    expect(isItemBlank({ ...newDraftItem('FLASHCARD'), prompt: 'a' })).toBe(false);
    expect(isItemBlank({ ...newDraftItem('FILL_BLANK'), acceptedAnswers: ['x'] })).toBe(false);
    expect(isItemBlank({ ...newDraftItem('FLASHCARD'), frontMediaAssetId: 'img' })).toBe(false);
  });
});
