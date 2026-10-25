import { computeDiff, countChanges, toItemInput } from '../utils/editor-diff';
import { createEditorDraft, newDraftItem } from '../utils/editor-draft';
import {
  addItem,
  changeItemType,
  moveItem,
  removeItem,
  toggleCorrect,
  updateItem,
} from '../utils/editor-ops';
import { mapBulkErrors } from '../utils/map-bulk-errors';
import { makeChoiceItem, makeItem } from './fixtures';

/** `editor-diff` (app.md p4-01 §8): thêm/sửa/xoá/đổi thứ tự → upsert/delete đúng; media không bị lặng lẽ xoá. */
function draft() {
  return createEditorDraft(3, [
    makeItem({ id: 'i1', order: 1 }),
    makeChoiceItem({ id: 'i2', order: 2 }),
    makeItem({ id: 'i3', order: 3, prompt: 'Thứ ba' }),
  ]);
}

describe('computeDiff', () => {
  it('chưa đổi gì ⇒ rỗng', () => {
    expect(computeDiff(draft())).toEqual({ delete: [], upsert: [] });
    expect(countChanges(draft())).toBe(0);
  });

  it('sửa nội dung một mục ⇒ chỉ mục đó vào upsert (kèm id), giữ nguyên media và id lựa chọn', () => {
    const changed = updateItem(draft(), 'i2', { prompt: 'Thủ đô nước ta là gì?' });
    const { delete: del, upsert } = computeDiff(changed);
    expect(del).toEqual([]);
    expect(upsert).toHaveLength(1);
    const input = upsert[0];
    expect(input).toMatchObject({
      clientItemKey: 'i2',
      id: 'i2',
      prompt: 'Thủ đô nước ta là gì?',
      type: 'MULTIPLE_CHOICE',
    });
    if (input?.type !== 'MULTIPLE_CHOICE') throw new Error('sai loại');
    // Đáp án đúng gửi theo INDEX; lựa chọn giữ `id` cũ và ảnh của lựa chọn (BE ghi ĐÈ mục, bỏ đi là xoá media).
    expect(input.correctOptionIndex).toBe(1);
    expect(input.options).toEqual([
      { id: 'o_aaaaaa', mediaAssetId: null, text: 'Hà Nội' },
      { id: 'o_bbbbbb', mediaAssetId: 'asset-1', text: 'Huế' },
    ]);
  });

  it('thêm mục mới cuối danh sách ⇒ upsert không có id, after = mục đứng ngay trước', () => {
    const fresh = newDraftItem('TRUE_FALSE');
    const changed = addItem(draft(), { ...fresh, prompt: 'Trái đất tròn' });
    const { upsert } = computeDiff(changed);
    expect(upsert).toHaveLength(1);
    expect(upsert[0]).toMatchObject({
      afterClientItemKey: 'i3',
      clientItemKey: fresh.clientItemKey,
      correct: true,
      type: 'TRUE_FALSE',
    });
    expect(upsert[0]).not.toHaveProperty('id');
  });

  it('chèn mục mới Ở GIỮA ⇒ mục kế tiếp KHÔNG bị tính là "đã dời" (chỉ mục mới vào upsert)', () => {
    const fresh = { ...newDraftItem('FLASHCARD'), answerText: 'x', prompt: 'giữa' };
    const changed = addItem(draft(), fresh, 'i1');
    const { upsert } = computeDiff(changed);
    expect(upsert.map((input) => input.clientItemKey)).toEqual([fresh.clientItemKey]);
    expect(upsert[0]?.afterClientItemKey).toBe('i1');
  });

  it('mục mới đầu danh sách ⇒ after = null; hai mục mới liên tiếp ⇒ mục sau neo vào mục trước', () => {
    const a = { ...newDraftItem('FLASHCARD'), answerText: 'a', prompt: 'a' };
    const b = { ...newDraftItem('FLASHCARD'), answerText: 'b', prompt: 'b' };
    const { upsert } = computeDiff(addItem(addItem(draft(), a, null), b, a.clientItemKey));
    expect(upsert.map((input) => [input.clientItemKey, input.afterClientItemKey])).toEqual([
      [a.clientItemKey, null],
      [b.clientItemKey, a.clientItemKey],
    ]);
  });

  it('xoá mục đã có ⇒ delete theo id; xoá mục vừa thêm (chưa lưu) ⇒ không sinh gì', () => {
    expect(computeDiff(removeItem(draft(), 'i2')).delete).toEqual(['i2']);
    const fresh = newDraftItem('FLASHCARD');
    expect(computeDiff(removeItem(addItem(draft(), fresh), fresh.clientItemKey))).toEqual({
      delete: [],
      upsert: [],
    });
  });

  it('đổi thứ tự (i3 lên trước i2) ⇒ mục bị dời vào upsert với neo mới; nội dung không đổi vẫn gửi để BE đặt lại chỗ', () => {
    const moved = moveItem(draft(), 'i3', 'up');
    const { upsert } = computeDiff(moved);
    expect(upsert.map((input) => input.clientItemKey)).toContain('i3');
    expect(upsert.find((input) => input.clientItemKey === 'i3')?.afterClientItemKey).toBe('i1');
  });

  it('đổi loại mục giữ câu hỏi/media; MULTI_SELECT gửi đủ chỉ số đáp án đúng', () => {
    const start = draft();
    const item = start.items.i2;
    if (!item) throw new Error('thiếu i2');
    const multi = toggleCorrect(changeItemType(item, 'MULTI_SELECT'), 'o_aaaaaa');
    const input = toItemInput(multi);
    if (input.type !== 'MULTI_SELECT') throw new Error('sai loại');
    expect(input.correctOptionIndexes).toEqual([0, 1]);
    expect(input.prompt).toBe('Thủ đô của Việt Nam?');
  });
});

describe('mapBulkErrors (STUDY_001)', () => {
  it('gắn lỗi theo clientItemKey; thiếu key thì tra ngược theo index trong upsert đã gửi', () => {
    const sent = [
      toItemInput({ ...newDraftItem('FLASHCARD'), clientItemKey: 'k-0' }),
      toItemInput({ ...newDraftItem('FLASHCARD'), clientItemKey: 'k-1' }),
    ];
    const mapped = mapBulkErrors(
      [
        { clientItemKey: 'k-0', code: 'REQUIRED', field: 'prompt', index: 0 },
        { code: 'TOO_LONG', field: 'answerText', index: 1 },
        { code: 'INVALID', field: 'x', index: 9 },
      ],
      sent,
    );
    expect(Object.keys(mapped)).toEqual(['k-0', 'k-1']);
    expect(mapped['k-1']?.fields[0]).toMatchObject({ code: 'TOO_LONG', field: 'answerText' });
  });
});
