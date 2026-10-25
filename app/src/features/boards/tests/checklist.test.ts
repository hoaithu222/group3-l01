import {
  applyChecklistMove,
  checklistPercent,
  checklistProgressLabel,
  planChecklistMove,
  sortChecklist,
} from '../utils/checklist';
import { makeItem } from './detail-fixtures';

const ITEMS = [makeItem({ id: 'i3' }), makeItem({ id: 'i1' }), makeItem({ id: 'i2' }), makeItem({ id: 'i4' })];

describe('checklist', () => {
  it('tiến độ: 2/4 = "2/4 · 50 %", chưa có mục thì 0 (không NaN)', () => {
    expect(checklistProgressLabel(2, 4)).toBe('2/4 · 50 %');
    expect(checklistPercent(1, 3)).toBe(33);
    expect(checklistPercent(0, 0)).toBe(0);
    expect(checklistPercent(5, 4)).toBe(100);
  });

  it('sortChecklist sắp theo order (số thực), không sửa mảng gốc', () => {
    const sorted = sortChecklist(ITEMS);
    expect(sorted.map((item) => item.id)).toEqual(['i1', 'i2', 'i3', 'i4']);
    expect(ITEMS[0]?.id).toBe('i3');
  });

  it('planChecklistMove: lên/xuống một bậc, null ở biên, "lên đầu" = null', () => {
    const sorted = sortChecklist(ITEMS);
    expect(planChecklistMove(sorted, 'i1', 'up')).toBeNull();
    expect(planChecklistMove(sorted, 'i4', 'down')).toBeNull();
    // i2 lên một bậc → thành đầu danh sách: BE nhận `moveAfterItemId: null`.
    expect(planChecklistMove(sorted, 'i2', 'up')).toEqual({ moveAfterItemId: null });
    // i3 lên một bậc → đứng sau i1.
    expect(planChecklistMove(sorted, 'i3', 'up')).toEqual({ moveAfterItemId: 'i1' });
    // i1 xuống một bậc → đứng sau i2.
    expect(planChecklistMove(sorted, 'i1', 'down')).toEqual({ moveAfterItemId: 'i2' });
    expect(planChecklistMove(sorted, 'không-có', 'up')).toBeNull();
  });

  it('applyChecklistMove: order mới nằm GIỮA hai hàng xóm (cùng công thức BE) và thứ tự đúng', () => {
    const sorted = sortChecklist(ITEMS);
    const moved = applyChecklistMove(sorted, 'i4', 'i1');
    expect(moved.map((item) => item.id)).toEqual(['i1', 'i4', 'i2', 'i3']);
    expect(moved.find((item) => item.id === 'i4')?.order).toBe(1.5);

    const toTop = applyChecklistMove(sorted, 'i3', null);
    expect(toTop.map((item) => item.id)).toEqual(['i3', 'i1', 'i2', 'i4']);
    expect(toTop[0]?.order).toBeLessThan(1);
  });

  it('applyChecklistMove: mục đích không tồn tại thì giữ nguyên thứ tự', () => {
    const sorted = sortChecklist(ITEMS);
    expect(applyChecklistMove(sorted, 'i2', 'không-có').map((item) => item.id)).toEqual(['i1', 'i2', 'i3', 'i4']);
  });
});
