import { buildTaskListParams } from '../api/tasks.service';
import { hasActiveFilter, matchesFilter, normalizeFilter } from '../utils/board-filter';
import { READ_ONLY_PERMISSIONS, resolveBoardPermissions } from '../utils/board-permissions';
import {
  addDraft,
  draftsDiffer,
  moveDraft,
  removeDraft,
  toDrafts,
  toInputs,
  updateDraft,
  validateDrafts,
} from '../utils/columns-draft';
import { checklistLabel, dueLabel, percentDone, splitAssignees } from '../utils/task-format';
import { makeTask } from './fixtures';

const LIMITS = { columnTitleMax: 40, columnsMax: 12 };

describe('resolveBoardPermissions', () => {
  it('đọc khoá THẬT của BE (`workspace.board.edit`, `workspace.task.status`…) và cả cách viết của README §6', () => {
    const real = resolveBoardPermissions([
      'workspace.board.read',
      'workspace.board.edit',
      'workspace.task.create',
      'workspace.task.status',
      'workspace.task.delete',
    ]);
    const readme = resolveBoardPermissions(['BOARD_EDIT', 'TASK_CREATE', 'TASK_UPDATE_STATUS', 'TASK_DELETE']);
    expect(real).toEqual({ canCreateTask: true, canDeleteAnyTask: true, canEdit: true, canMoveTask: true });
    expect(readme).toEqual(real);
  });

  it('MEMBER: kéo/tạo thẻ nhưng KHÔNG sửa bảng', () => {
    const member = resolveBoardPermissions(['workspace.board.read', 'workspace.task.create', 'workspace.task.status', 'workspace.task.update']);
    expect(member.canEdit).toBe(false);
    expect(member.canMoveTask).toBe(true);
  });

  it('chưa có dữ liệu hoặc bảng/nhóm lưu trữ ⇒ chỉ đọc, dù BE có gửi quyền', () => {
    expect(resolveBoardPermissions(undefined)).toEqual(READ_ONLY_PERMISSIONS);
    expect(resolveBoardPermissions(['BOARD_EDIT', 'TASK_CREATE'], { archived: true })).toEqual(READ_ONLY_PERMISSIONS);
  });
});

describe('bộ lọc', () => {
  it('normalizeFilter: bỏ `false`, chuỗi rỗng và `q` < 2 ký tự để hai bộ lọc cùng nghĩa ra cùng khoá', () => {
    expect(normalizeFilter({ assigneeId: '', overdue: false, q: ' a ' })).toEqual({});
    expect(normalizeFilter({ overdue: true, q: '  đồ án ' })).toEqual({ overdue: true, q: 'đồ án' });
  });

  it('hasActiveFilter', () => {
    expect(hasActiveFilter({})).toBe(false);
    expect(hasActiveFilter({ q: 'a' })).toBe(false);
    expect(hasActiveFilter({ q: 'ab' })).toBe(true);
    expect(hasActiveFilter({ labelId: 'l1' })).toBe(true);
  });

  it('matchesFilter: "me" đối chiếu với người dùng hiện tại; chưa biết tôi là ai ⇒ không khớp', () => {
    const task = makeTask({ assignees: [{ avatarUrl: null, id: 'u1', name: 'An' }], id: 't' });
    expect(matchesFilter(task, { assigneeId: 'me' }, 'u1')).toBe(true);
    expect(matchesFilter(task, { assigneeId: 'me' }, 'u2')).toBe(false);
    expect(matchesFilter(task, { assigneeId: 'me' }, undefined)).toBe(false);
    expect(matchesFilter(task, { assigneeId: 'u1' }, undefined)).toBe(true);
  });

  it('buildTaskListParams: KHÔNG bao giờ gửi overdue=false (BE coerce "false" thành true) và bỏ q ngắn', () => {
    expect(buildTaskListParams({ overdue: false, q: 'a' })).toEqual({});
    expect(buildTaskListParams({ assigneeId: 'me', labelId: 'l1', overdue: true, q: 'ab' })).toEqual({
      assigneeId: 'me',
      labelId: 'l1',
      overdue: true,
      q: 'ab',
    });
    expect(buildTaskListParams({}, { columnId: 'c1', limitPerColumn: 200 })).toEqual({ columnId: 'c1', limitPerColumn: 200 });
  });
});

describe('columns-draft', () => {
  const base = toDrafts([
    { id: 'c_1', kind: 'TODO', title: 'A', wipLimit: null },
    { id: 'c_2', kind: 'DONE', title: 'B', wipLimit: 3 },
  ]);

  it('hợp lệ ⇒ null; toInputs giữ id cột cũ và bỏ id cột mới', () => {
    expect(validateDrafts(base, LIMITS)).toBeNull();
    const withNew = addDraft(base);
    const inputs = toInputs(updateDraft(withNew, withNew[2]?.key ?? '', { title: ' Mới ' }));
    expect(inputs[0]).toEqual({ id: 'c_1', kind: 'TODO', title: 'A', wipLimit: null });
    expect(inputs[1]).toMatchObject({ id: 'c_2', wipLimit: 3 });
    expect(inputs[2]).toEqual({ kind: 'IN_PROGRESS', title: 'Mới', wipLimit: null });
  });

  it('bắt các lỗi giống BE: <2 cột, >max, tên rỗng, WIP sai, không đúng một DONE', () => {
    expect(validateDrafts(base.slice(0, 1), LIMITS)).toMatch(/ít nhất 2 cột/);
    expect(validateDrafts(base, { ...LIMITS, columnsMax: 1 })).toMatch(/tối đa 1 cột/);
    expect(validateDrafts(updateDraft(base, base[0]?.key ?? '', { title: '  ' }), LIMITS)).toMatch(/không được để trống/);
    expect(validateDrafts(updateDraft(base, base[0]?.key ?? '', { wipLimit: '0' }), LIMITS)).toMatch(/từ 1 đến 500/);
    expect(validateDrafts(updateDraft(base, base[1]?.key ?? '', { kind: 'REVIEW' }), LIMITS)).toMatch(/đúng một cột/);
    expect(validateDrafts(updateDraft(base, base[0]?.key ?? '', { kind: 'DONE' }), LIMITS)).toMatch(/đúng một cột/);
  });

  it('moveDraft đổi chỗ, ở mép thì giữ nguyên; removeDraft gỡ theo key', () => {
    const [a, b] = base;
    expect(moveDraft(base, a?.key ?? '', 1).map((d) => d.title)).toEqual(['B', 'A']);
    expect(moveDraft(base, a?.key ?? '', -1).map((d) => d.title)).toEqual(['A', 'B']);
    expect(removeDraft(base, b?.key ?? '').map((d) => d.title)).toEqual(['A']);
  });

  it('draftsDiffer: nháp y hệt cột đang lưu ⇒ false (khoá "Lưu cột"); đổi tên/loại/WIP/thứ tự/thêm/xoá ⇒ true', () => {
    const saved = [
      { id: 'c_1', kind: 'TODO' as const, title: 'A', wipLimit: null },
      { id: 'c_2', kind: 'DONE' as const, title: 'B', wipLimit: 3 },
    ];
    const [a, b] = base;
    expect(draftsDiffer(base, saved)).toBe(false);
    expect(draftsDiffer(updateDraft(base, a?.key ?? '', { title: 'A2' }), saved)).toBe(true);
    // Khoảng trắng đầu/cuối không phải thay đổi: `toInputs` cắt trước khi gửi.
    expect(draftsDiffer(updateDraft(base, a?.key ?? '', { title: ' A ' }), saved)).toBe(false);
    expect(draftsDiffer(updateDraft(base, b?.key ?? '', { wipLimit: '' }), saved)).toBe(true);
    expect(draftsDiffer(updateDraft(base, a?.key ?? '', { kind: 'REVIEW' }), saved)).toBe(true);
    expect(draftsDiffer(moveDraft(base, a?.key ?? '', 1), saved)).toBe(true);
    expect(draftsDiffer(addDraft(base), saved)).toBe(true);
    expect(draftsDiffer(removeDraft(base, b?.key ?? ''), saved)).toBe(true);
  });
});

describe('task-format', () => {
  it('splitAssignees / checklistLabel / dueLabel / percentDone', () => {
    const people = ['A', 'B', 'C', 'D'].map((name, i) => ({ avatarUrl: null, id: `u${i}`, name }));
    expect(splitAssignees(people)).toMatchObject({ overflow: 1 });
    expect(splitAssignees(people).visible).toHaveLength(3);
    expect(checklistLabel({ checklistDone: 0, checklistTotal: 0 })).toBeNull();
    expect(checklistLabel({ checklistDone: 2, checklistTotal: 4 })).toBe('2/4');
    expect(dueLabel({ dueDate: null, isOverdue: false })).toBeNull();
    expect(dueLabel({ dueDate: '2026-09-01T00:00:00.000Z', isOverdue: true })).toMatch(/^Quá hạn · /);
    expect(percentDone({ doneCount: 0, taskCount: 0 })).toBe(0);
    expect(percentDone({ doneCount: 1, taskCount: 3 })).toBe(33);
  });
});
