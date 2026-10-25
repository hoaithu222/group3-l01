import { hasBoardPermission } from '../utils/board-permissions';
import { endOfDayIso, startOfDayIso } from '../utils/task-dates';
import { resolveTaskAccess } from '../utils/task-permissions';
import { makeDetail } from './detail-fixtures';

const LIVE = { archived: false, offline: false, placeholder: false };

describe('resolveTaskAccess', () => {
  it('người có quyền, online: sửa · bình luận · đính kèm · xoá đều bật', () => {
    expect(resolveTaskAccess(makeDetail(), LIVE)).toMatchObject({
      canAttach: true,
      canComment: true,
      canDelete: true,
      canEdit: true,
      deleted: false,
      readOnlyReason: null,
    });
  });

  it('offline: ẩn hết thao tác ghi và nói rõ lý do (composer "Kết nối lại để gửi")', () => {
    expect(resolveTaskAccess(makeDetail(), { ...LIVE, offline: true })).toMatchObject({
      canAttach: false,
      canComment: false,
      canDelete: false,
      canEdit: false,
      readOnlyReason: 'offline',
    });
  });

  it('bảng/nhóm đã lưu trữ chỉ xem dù BE có gửi quyền (README §6)', () => {
    expect(resolveTaskAccess(makeDetail(), { ...LIVE, archived: true })).toMatchObject({
      canComment: false,
      canEdit: false,
      readOnlyReason: 'archived',
    });
  });

  it('bản giữ chỗ (chưa có quyền thật) khoá mọi thứ', () => {
    expect(resolveTaskAccess(makeDetail(), { ...LIVE, placeholder: true })).toMatchObject({
      canEdit: false,
      readOnlyReason: 'loading',
    });
  });

  it('thẻ đã xoá: chỉ khôi phục được nếu có quyền; không sửa/bình luận', () => {
    const deleted = makeDetail({ deletedAt: '2026-09-18T00:00:00.000Z' });
    expect(resolveTaskAccess(deleted, LIVE)).toMatchObject({
      canComment: false,
      canEdit: false,
      canRestore: true,
      deleted: true,
      readOnlyReason: 'deleted',
    });
    const other = makeDetail({
      deletedAt: '2026-09-18T00:00:00.000Z',
      myPermissions: { attach: true, comment: true, delete: false, edit: true },
    });
    expect(resolveTaskAccess(other, LIVE).canRestore).toBe(false);
    // `restore` tường minh thắng `delete` khi BE có gửi.
    const explicit = makeDetail({
      deletedAt: '2026-09-18T00:00:00.000Z',
      myPermissions: { attach: false, comment: false, delete: false, edit: false, restore: true },
    });
    expect(resolveTaskAccess(explicit, LIVE).canRestore).toBe(true);
  });

  it('người chỉ có quyền xem: readOnlyReason = permission', () => {
    const viewer = makeDetail({ myPermissions: { attach: false, comment: false, delete: false, edit: false } });
    expect(resolveTaskAccess(viewer, LIVE).readOnlyReason).toBe('permission');
  });
});

describe('hasBoardPermission (TASK_UPDATE cho "Giao cho tôi")', () => {
  it('đọc cả khoá thật của BE lẫn dạng README', () => {
    expect(hasBoardPermission(['workspace.task.update'], 'TASK_UPDATE')).toBe(true);
    expect(hasBoardPermission(['TASK_UPDATE'], 'TASK_UPDATE')).toBe(true);
    expect(hasBoardPermission(['workspace.task.status'], 'TASK_UPDATE')).toBe(false);
    expect(hasBoardPermission(undefined, 'TASK_UPDATE')).toBe(false);
  });
});

describe('ngày bắt đầu / hạn chót gửi BE', () => {
  it('hạn = CUỐI ngày giờ máy, bắt đầu = ĐẦU ngày giờ máy — cùng một ngày lịch', () => {
    const day = new Date(2026, 8, 15, 10, 30);
    const start = new Date(startOfDayIso(day));
    const end = new Date(endOfDayIso(day));
    expect([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()]).toEqual([2026, 8, 15, 0]);
    expect([end.getFullYear(), end.getMonth(), end.getDate(), end.getHours(), end.getMinutes()]).toEqual([
      2026, 8, 15, 23, 59,
    ]);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });
});
