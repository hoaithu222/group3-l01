import { hrefForTarget, hrefOrActivity } from '../notification-route';

/**
 * Thông báo cấp NHÓM (`workspace.*`, `guest.expiring`) + `integration.error` + `wallet.*`: trước đây rơi về `null` nên chạm một mục hộp
 * thư chỉ ra toast "Không mở được thông báo này" (người dùng báo với `workspace.member-added` / `workspace.admin-change`).
 */
const OVERVIEW = { params: { wsId: 'ws-1' }, pathname: '/workspaces/[wsId]' };

describe('hrefForTarget — thông báo cấp nhóm làm việc', () => {
  it.each([
    'workspace.member-added',
    'workspace.join-approved',
    'workspace.invite-accepted',
    'workspace.admin-change',
    'guest.expiring',
  ])('%s → tổng quan nhóm', (type) => {
    expect(hrefForTarget({ type, workspaceId: 'ws-1' })).toEqual(OVERVIEW);
  });

  it('workspace.join-requested → hàng chờ duyệt của nhóm', () => {
    expect(hrefForTarget({ type: 'workspace.join-requested', workspaceId: 'ws-1' })).toEqual({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/members/requests',
    });
  });

  it('workspace.invited → "Lời mời của tôi" (không cần workspaceId: người nhận chưa là thành viên)', () => {
    expect(hrefForTarget({ type: 'workspace.invited' })).toBe('/workspaces/invitations');
  });

  it('workspace.join-rejected → danh sách nhóm (không còn nhóm nào để mở)', () => {
    expect(hrefForTarget({ type: 'workspace.join-rejected' })).toBe('/workspaces');
  });

  it('integration.error → màn tích hợp của nhóm; wallet.* → ví nhóm', () => {
    expect(hrefForTarget({ type: 'integration.error', workspaceId: 'ws-1' })).toBe('/workspaces/ws-1/integrations');
    expect(hrefForTarget({ type: 'wallet.settlement-pending', workspaceId: 'ws-1' })).toBe('/workspaces/ws-1/wallet');
  });

  it('thiếu workspaceId ở loại cần nhóm → null; hrefOrActivity rơi về hộp thư', () => {
    expect(hrefForTarget({ type: 'workspace.admin-change' })).toBeNull();
    expect(hrefForTarget({ type: 'wallet.expense-added' })).toBeNull();
    expect(hrefOrActivity({ type: 'guest.expiring' })).toBe('/activity');
  });
});
