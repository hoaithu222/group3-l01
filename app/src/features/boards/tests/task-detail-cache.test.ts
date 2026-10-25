import { isStartAfterDue } from '../utils/task-dates';
import {
  applyChecklistRemoved,
  applyChecklistResult,
  applyOptimisticPatch,
  cardOf,
  detailFromCard,
  mergeCardIntoDetail,
  needsDetailRefetch,
  withChecklist,
} from '../utils/task-detail-cache';
import { makeDetail, makeItem } from './detail-fixtures';

describe('mergeCardIntoDetail', () => {
  it('sự kiện CŨ hơn hoặc BẰNG version đã có bị bỏ (task:updated version cũ)', () => {
    const detail = makeDetail({ version: 5 });
    expect(mergeCardIntoDetail(detail, { ...cardOf(detail), title: 'cũ', version: 4 })).toBeNull();
    expect(mergeCardIntoDetail(detail, { ...cardOf(detail), title: 'bằng', version: 5 })).toBeNull();
  });

  it('version mới hơn: trộn trường thẻ mini nhưng GIỮ mô tả/checklist của chi tiết', () => {
    const detail = makeDetail({ description: 'mô tả', version: 5 });
    const merged = mergeCardIntoDetail(detail, { ...cardOf(detail), title: 'Tên mới', version: 6 });
    expect(merged).toMatchObject({ description: 'mô tả', title: 'Tên mới', version: 6 });
    expect(merged?.checklist).toHaveLength(4);
  });
});

describe('needsDetailRefetch', () => {
  it('trường chỉ có ở chi tiết ⇒ tải lại; trường thẻ mini thì không; thiếu `changed` thì tải lại cho chắc', () => {
    expect(needsDetailRefetch(['checklist', 'checklistDone', 'version'])).toBe(true);
    expect(needsDetailRefetch(['description'])).toBe(true);
    expect(needsDetailRefetch(['title', 'dueDate'])).toBe(false);
    expect(needsDetailRefetch(undefined)).toBe(true);
  });
});

describe('checklist trong cache chi tiết', () => {
  it('withChecklist tính lại đếm: tick mục thứ hai ⇒ 2/4 (PM2-02 phía client)', () => {
    const detail = makeDetail();
    const ticked = withChecklist(
      detail,
      detail.checklist.map((item) => (item.id === 'i2' ? { ...item, done: true } : item)),
    );
    expect(ticked).toMatchObject({ checklistDone: 2, checklistTotal: 4 });
  });

  it('applyChecklistResult ghi version mới nhưng đếm theo danh sách CỤC BỘ (hai phản hồi lệch nhịp không làm nhảy số)', () => {
    const detail = withChecklist(
      makeDetail({ version: 3 }),
      makeDetail().checklist.map((item) => (item.id === 'i2' ? { ...item, done: true } : item)),
    );
    // Phản hồi của lần tick i2 kể "chỉ 1 mục xong" (đếm của server lúc đó) — không được kéo số về 1/4.
    const next = applyChecklistResult(detail, {
      checklistDone: 1,
      checklistTotal: 4,
      item: makeItem({ done: true, id: 'i2' }),
      version: 4,
    });
    expect(next).toMatchObject({ checklistDone: 2, checklistTotal: 4, version: 4 });
  });

  it('thêm mục mới chưa có trong danh sách và xoá mục: đếm + version cập nhật', () => {
    const detail = makeDetail({ version: 3 });
    const added = applyChecklistResult(detail, {
      checklistDone: 1,
      checklistTotal: 5,
      item: makeItem({ id: 'i5' }),
      version: 4,
    });
    expect(added.checklist.map((item) => item.id)).toEqual(['i1', 'i2', 'i3', 'i4', 'i5']);
    expect(added.checklistTotal).toBe(5);

    const removed = applyChecklistRemoved(added, 'i1', { version: 5 });
    expect(removed).toMatchObject({ checklistDone: 0, checklistTotal: 4, version: 5 });
  });

  it('version không bao giờ lùi dù phản hồi tới muộn', () => {
    const detail = makeDetail({ version: 9 });
    const next = applyChecklistResult(detail, {
      checklistDone: 1,
      checklistTotal: 4,
      item: makeItem({ id: 'i1', done: true }),
      version: 6,
    });
    expect(next.version).toBe(9);
  });
});

describe('applyOptimisticPatch / detailFromCard', () => {
  it('đổi hạn tính lại isOverdue; cột DONE thì không quá hạn', () => {
    const detail = makeDetail();
    expect(applyOptimisticPatch(detail, { dueDate: '2020-01-01T00:00:00.000Z' }).isOverdue).toBe(true);
    const done = makeDetail({ columnKind: 'DONE' });
    expect(applyOptimisticPatch(done, { dueDate: '2020-01-01T00:00:00.000Z' }).isOverdue).toBe(false);
    expect(applyOptimisticPatch(detail, { dueDate: null })).toMatchObject({ dueDate: null, isOverdue: false });
  });

  it('bản giữ chỗ dựng từ thẻ mini KHÔNG có quyền nào (chưa biết thì không cho sửa)', () => {
    const placeholder = detailFromCard(cardOf(makeDetail()));
    expect(placeholder.myPermissions).toEqual({ attach: false, comment: false, delete: false, edit: false });
    expect(placeholder.checklist).toEqual([]);
  });
});

describe('isStartAfterDue (TASK_013 phía client)', () => {
  it('cùng ngày là hợp lệ; bắt đầu sau hạn là sai; thiếu một đầu thì bỏ qua', () => {
    expect(isStartAfterDue(new Date(2026, 8, 15), new Date(2026, 8, 15))).toBe(false);
    expect(isStartAfterDue(new Date(2026, 8, 16), new Date(2026, 8, 15))).toBe(true);
    expect(isStartAfterDue(null, new Date(2026, 8, 15))).toBe(false);
  });
});
