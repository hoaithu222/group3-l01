import type { InboxItem } from '@/core/notifications';

import { describeActivity, UNAVAILABLE_TITLE } from '../utils/describe-item';
import { needsWorkspaceLookup } from '../utils/describe-workspace';
import { inboxItemTarget } from '../utils/inbox-target';

/**
 * Hộp thư: `workspace.member-added` / `workspace.admin-change` (và các loại nhóm khác) từng rơi về "Bạn có thông báo mới" + avatar "?".
 * BE KHÔNG điền `actor` cho mục nhóm (chỉ tin nhắn có) và không đặt `scopeName` cho phạm vi WORKSPACE, nên tên nhóm đến từ
 * `refs.workspaceName` hoặc tra theo id.
 */
function make(overrides: Partial<InboxItem>): InboxItem {
  return {
    actor: null,
    actorId: 'u-admin',
    context: { available: true, muted: false },
    createdAt: '2026-09-26T08:00:00.000Z',
    id: 'n1',
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs: { workspaceId: 'ws-1' },
    scopeId: 'ws-1',
    scopeType: 'WORKSPACE',
    type: 'workspace.member-added',
    unavailable: false,
    workspaceId: 'ws-1',
    ...overrides,
  };
}

const title = (item: InboxItem, names?: ReadonlyMap<string, string>) =>
  describeActivity(item, { workspaceNames: names }).title;

describe('workspace.member-added', () => {
  it('có tên nhóm trong refs (BE gửi) → "Bạn được thêm vào nhóm X"', () => {
    expect(title(make({ refs: { workspaceId: 'ws-1', workspaceName: 'Đồ án' } }))).toBe(
      'Bạn được thêm vào nhóm Đồ án',
    );
  });

  it('có cả người thêm → "{who} đã thêm bạn vào nhóm X"', () => {
    const item = make({
      actor: { avatarUrl: null, name: 'Minh', userId: 'u-admin' },
      refs: { workspaceId: 'ws-1', workspaceName: 'Đồ án' },
    });
    expect(title(item)).toBe('Minh đã thêm bạn vào nhóm Đồ án');
  });

  it('không có tên nhóm → bỏ đoạn tên, không in "undefined"', () => {
    expect(title(make({}))).toBe('Bạn được thêm vào một nhóm làm việc');
  });

  it('⛔ mục mất quyền không lộ tên nhóm cũ', () => {
    const item = make({
      context: { available: false, muted: false },
      refs: null,
      unavailable: true,
    });
    expect(describeActivity(item, { workspaceNames: new Map([['ws-1', 'Đồ án']]) })).toEqual({
      title: UNAVAILABLE_TITLE,
    });
  });
});

describe('workspace.admin-change — theo refs.action', () => {
  const admin = (refs: Record<string, unknown>) =>
    make({ refs: { workspaceId: 'ws-1', ...refs }, type: 'workspace.admin-change' });
  const names = new Map([['ws-1', 'Đồ án']]);

  it('role-changed kèm vai trò → nêu vai trò bằng tiếng Việt, tên nhóm tra theo id', () => {
    expect(title(admin({ action: 'role-changed', role: 'ADMIN' }), names)).toBe(
      'Vai trò của bạn trong nhóm Đồ án đã đổi thành Quản trị viên',
    );
    expect(title(admin({ action: 'role-changed', role: 'MEMBER' }), names)).toBe(
      'Vai trò của bạn trong nhóm Đồ án đã đổi thành Thành viên',
    );
  });

  it('role-changed thiếu/lạ vai trò → câu trung tính, chưa biết tên nhóm → "một nhóm làm việc"', () => {
    expect(title(admin({ action: 'role-changed', role: 'ZZZ' }))).toBe(
      'Vai trò của bạn trong một nhóm làm việc đã thay đổi',
    );
  });

  it.each([
    ['removed', 'Bạn đã bị xoá khỏi nhóm Đồ án'],
    ['banned', 'Bạn đã bị chặn khỏi nhóm Đồ án'],
    ['left', 'Bạn đã rời nhóm Đồ án'],
    ['pending', 'Tư cách thành viên của bạn trong nhóm Đồ án đang chờ duyệt'],
    ['active', 'Bạn đã là thành viên của nhóm Đồ án'],
    ['archived', 'Nhóm Đồ án đã được quản trị hệ thống lưu trữ'],
    ['avatar-removed', 'Ảnh đại diện của nhóm Đồ án đã bị quản trị hệ thống gỡ'],
    ['cover-removed', 'Ảnh bìa của nhóm Đồ án đã bị quản trị hệ thống gỡ'],
  ])('action=%s', (action, expected) => {
    expect(title(admin({ action }), names)).toBe(expected);
  });

  it('gỡ ảnh đại diện/ảnh bìa (báo chủ nhóm) khi chưa biết tên nhóm → "một nhóm làm việc", không rơi về câu thành viên', () => {
    expect(title(admin({ action: 'avatar-removed' }))).toBe(
      'Ảnh đại diện của một nhóm làm việc đã bị quản trị hệ thống gỡ',
    );
    expect(title(admin({ action: 'cover-removed' }))).toBe(
      'Ảnh bìa của một nhóm làm việc đã bị quản trị hệ thống gỡ',
    );
    // BE gửi `refs.action` đúng chữ thường; viết hoa (dữ liệu cũ/khác nguồn) vẫn nhận ra.
    expect(title(admin({ action: 'COVER-REMOVED' }), names)).toBe(
      'Ảnh bìa của nhóm Đồ án đã bị quản trị hệ thống gỡ',
    );
    expect(needsWorkspaceLookup(admin({ action: 'avatar-removed' }))).toBe(true);
  });

  it('action lạ hoặc thiếu → vẫn nói đây là chuyện của nhóm, KHÔNG rơi về câu chung', () => {
    expect(title(admin({ action: 'gi-do-moi' }), names)).toBe(
      'Tư cách thành viên của bạn trong nhóm Đồ án có thay đổi',
    );
    expect(title(admin({}), names)).not.toBe('Bạn có thông báo mới');
  });

  it('cần tra tên nhóm khi refs không có tên; có tên hoặc mất quyền thì không', () => {
    const named = make({ refs: { workspaceId: 'ws-1', workspaceName: 'X' } });
    const gone = make({ context: { available: false, muted: false }, unavailable: true });
    expect(needsWorkspaceLookup(admin({ action: 'role-changed' }))).toBe(true);
    expect(needsWorkspaceLookup(named)).toBe(false);
    expect(needsWorkspaceLookup(gone)).toBe(false);
    expect(needsWorkspaceLookup(make({ type: 'task.assigned' }))).toBe(false);
  });
});

describe('các loại nhóm khác', () => {
  const refs = { workspaceId: 'ws-1', workspaceName: 'Đồ án' };

  it.each([
    ['workspace.invited', 'Bạn được mời tham gia nhóm Đồ án'],
    ['workspace.join-requested', 'Có yêu cầu tham gia nhóm Đồ án đang chờ bạn duyệt'],
    ['workspace.join-approved', 'Yêu cầu tham gia nhóm Đồ án đã được duyệt'],
    ['workspace.join-rejected', 'Yêu cầu tham gia nhóm Đồ án đã bị từ chối'],
    ['workspace.invite-accepted', 'Có người đã tham gia nhóm Đồ án'],
    ['guest.expiring', 'Quyền khách của bạn trong nhóm Đồ án sắp hết hạn'],
  ])('%s', (type, expected) => {
    expect(title(make({ refs, type }))).toBe(expected);
  });

  it('mục nhóm mở được tổng quan nhóm: `inboxItemTarget` mang workspaceId', () => {
    expect(inboxItemTarget(make({ type: 'workspace.admin-change' })).workspaceId).toBe('ws-1');
  });
});
