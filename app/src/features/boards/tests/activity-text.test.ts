import { activityAction, activitySentence } from '../utils/activity-text';
import { makeActivity } from './detail-fixtures';

/** Đúng danh sách `TASK_ACTIVITY_TYPES` của BE (`be/src/core/constants/project.ts`). */
const ALL_TYPES = [
  'CREATED',
  'RENAMED',
  'DESCRIPTION',
  'MOVED',
  'ASSIGNED',
  'UNASSIGNED',
  'LABELS',
  'START_CHANGED',
  'DUE_CHANGED',
  'POINTS',
  'CHECKLIST_ADDED',
  'CHECKLIST_DONE',
  'CHECKLIST_UNDONE',
  'CHECKLIST_EDITED',
  'CHECKLIST_REMOVED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_REMOVED',
  'COMMENT_DELETED_BY_ADMIN',
  'DELETED',
  'RESTORED',
];

describe('activity-text', () => {
  it('mọi type của BE đều có câu (kể cả khi before/after rỗng) và câu bắt đầu bằng tên người làm', () => {
    for (const type of ALL_TYPES) {
      const sentence = activitySentence(makeActivity({ id: type, type }));
      expect(sentence.startsWith('Lan đã ')).toBe(true);
      expect(sentence.length).toBeGreaterThan('Lan đã '.length + 2);
    }
  });

  it('DUE_CHANGED: dời sang ngày dd/MM/yyyy; lần đầu đặt; bỏ hạn', () => {
    const moved = makeActivity({
      after: { dueDate: '2026-09-15T16:59:59.000Z' },
      before: { dueDate: '2026-09-10T16:59:59.000Z' },
      id: 'a',
      type: 'DUE_CHANGED',
    });
    expect(activitySentence(moved)).toMatch(/^Lan đã dời hạn chót sang \d{2}\/\d{2}\/2026$/);
    expect(activityAction(makeActivity({ after: { dueDate: '2026-09-15T05:00:00.000Z' }, id: 'b', type: 'DUE_CHANGED' }))).toMatch(
      /^đã đặt hạn chót là /,
    );
    expect(activityAction(makeActivity({ after: null, before: { dueDate: '2026-09-15T05:00:00.000Z' }, id: 'c', type: 'DUE_CHANGED' }))).toBe(
      'đã bỏ hạn chót',
    );
  });

  it('ASSIGNED: tên trong bản ghi, tra theo id, và "nhận làm" khi tự giao cho mình', () => {
    const named = makeActivity({ after: { name: 'Minh', userId: 'u-minh' }, id: 'a', type: 'ASSIGNED' });
    expect(activitySentence(named)).toBe('Lan đã giao thẻ cho Minh');

    const byId = makeActivity({ after: { userId: 'u-minh' }, id: 'b', type: 'ASSIGNED' });
    expect(activitySentence(byId, (id) => (id === 'u-minh' ? 'Minh' : undefined))).toBe('Lan đã giao thẻ cho Minh');

    const self = makeActivity({ after: { userId: 'u-lan' }, id: 'c', type: 'ASSIGNED' });
    expect(activityAction(self)).toBe('đã nhận làm thẻ này');
  });

  it('CHECKLIST_DONE gộp nhiều mục: nói số lượng thay vì liệt kê', () => {
    const grouped = makeActivity({
      after: { items: [{ done: true, text: 'A' }, { done: true, text: 'B' }, { done: true, text: 'C' }] },
      id: 'a',
      type: 'CHECKLIST_DONE',
    });
    expect(activityAction(grouped)).toBe('đã hoàn thành 3 việc nhỏ');
    expect(activityAction(makeActivity({ after: { text: 'Vẽ sơ đồ' }, id: 'b', type: 'CHECKLIST_DONE' }))).toBe(
      'đã hoàn thành việc nhỏ "Vẽ sơ đồ"',
    );
  });

  it('CHECKLIST_DONE/UNDONE dạng BE (after.items có itemId+done): chỉ đếm mục có done KHỚP type', () => {
    const items = [
      { done: true, itemId: 'i1', text: 'A' },
      { done: true, itemId: 'i2', text: 'B' },
      { done: false, itemId: 'i3', text: 'C' },
    ];
    expect(activityAction(makeActivity({ after: { items }, id: 'a', type: 'CHECKLIST_DONE' }))).toBe('đã hoàn thành 2 việc nhỏ');
    expect(activityAction(makeActivity({ after: { items }, id: 'b', type: 'CHECKLIST_UNDONE' }))).toBe('đã bỏ hoàn thành việc nhỏ "C"');
    // Bấm rồi bấm lại về trạng thái cũ, type của lần cuối = DONE nhưng chỉ còn 1 mục thật sự xong.
    const flipped = [{ done: true, itemId: 'i1', text: 'A' }, { done: false, itemId: 'i2', text: 'B' }];
    expect(activityAction(makeActivity({ after: { items: flipped }, id: 'c', type: 'CHECKLIST_DONE' }))).toBe('đã hoàn thành việc nhỏ "A"');
  });

  it('MOVED: BE chỉ ghi columnId/columnKind ⇒ tra tên cột; thiếu thì câu chung', () => {
    const moved = makeActivity({
      after: { columnId: 'c_doing', columnKind: 'IN_PROGRESS' },
      before: { columnId: 'c_todo', columnKind: 'TODO' },
      id: 'a',
      type: 'MOVED',
    });
    const titles: Record<string, string> = { c_doing: 'Đang làm', c_todo: 'Cần làm' };
    const resolveColumn = (id: string) => titles[id];
    expect(activityAction(moved, undefined, resolveColumn)).toBe('đã chuyển thẻ từ "Cần làm" sang "Đang làm"');
    expect(activityAction(moved, undefined, (id) => (id === 'c_doing' ? 'Đang làm' : undefined))).toBe('đã chuyển thẻ sang cột "Đang làm"');
    expect(activityAction(moved)).toBe('đã chuyển thẻ sang cột khác');
  });

  it('hoạt động của hệ thống (không actor) và type lạ (BE thêm sau) không làm vỡ câu', () => {
    // `RESCHEDULED` không còn là type lạ từ p4-04 (có câu riêng, xem `gantt-status.test.ts`) — dùng một tên chưa tồn tại.
    const system = makeActivity({ actor: null, id: 'a', type: 'LOAI_CHUA_CO' });
    expect(activitySentence(system)).toBe('Hệ thống đã cập nhật thẻ');
  });

  it('RENAMED giữ cả tên cũ và mới; POINTS đổi từ → sang', () => {
    const renamed = makeActivity({ after: { title: 'B' }, before: { title: 'A' }, id: 'a', type: 'RENAMED' });
    expect(activityAction(renamed)).toBe('đã đổi tên thẻ từ "A" thành "B"');
    const points = makeActivity({ after: { storyPoints: 5 }, before: { storyPoints: 3 }, id: 'b', type: 'POINTS' });
    expect(activityAction(points)).toBe('đã đổi điểm từ 3 sang 5');
  });
});
