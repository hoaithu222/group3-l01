import { hrefForTarget, hrefOrActivity } from '../notification-route';
import { parsePushPayload } from '../push-payload.types';
import { decidePushTap, resolvePushHref } from '../push-router';

/**
 * p4-06: `contribution.export-ready` / `contribution.export-failed` (BE `be/src/modules/contribution/notifications`): push `dataKeys` = `exportId`, `boardId`,
 * `workspaceId`; hộp thư mang cùng ba id ở `refs`. Cả hai mở màn "Đóng góp" của BẢNG kèm `?exportId=` để màn hiện trạng thái lượt xuất (Mở PDF / Thử lại).
 */
const BASE = '/workspaces/ws-1/boards/b-1/contribution';

describe('hrefForTarget — báo cáo đóng góp (p4-06)', () => {
  it.each(['contribution.export-ready', 'contribution.export-failed'])('%s → màn Đóng góp của bảng kèm exportId', (type) => {
    expect(hrefForTarget({ boardId: 'b-1', exportId: 'e-1', type, workspaceId: 'ws-1' })).toBe(`${BASE}?exportId=e-1`);
  });

  it('thiếu exportId vẫn mở màn Đóng góp (không kèm query)', () => {
    expect(hrefForTarget({ boardId: 'b-1', type: 'contribution.export-ready', workspaceId: 'ws-1' })).toBe(BASE);
  });

  it('exportId lạ được mã hoá — không chèn được `&`/`#` vào đường dẫn nội bộ', () => {
    expect(hrefForTarget({ boardId: 'b-1', exportId: 'e 1&x=2#', type: 'contribution.export-ready', workspaceId: 'ws-1' })).toBe(
      `${BASE}?exportId=e%201%26x%3D2%23`,
    );
  });

  it('thiếu boardId hoặc workspaceId → null, và hrefOrActivity rơi về hộp thư', () => {
    expect(hrefForTarget({ exportId: 'e-1', type: 'contribution.export-ready', workspaceId: 'ws-1' })).toBeNull();
    expect(hrefForTarget({ boardId: 'b-1', exportId: 'e-1', type: 'contribution.export-failed' })).toBeNull();
    expect(hrefOrActivity({ exportId: 'e-1', type: 'contribution.export-ready' })).toBe('/activity');
  });
});

describe('push — báo cáo đóng góp (p4-06)', () => {
  const data = (type: string, extra: Record<string, string> = {}) => ({
    boardId: 'b-1',
    exportId: 'e-9',
    sentAt: '2026-09-25T07:00:00.000Z',
    targetUserId: 'user-me',
    type,
    workspaceId: 'ws-1',
    ...extra,
  });

  it('parsePushPayload giữ exportId (khoá mới trong danh sách) và bỏ khoá lạ', () => {
    const payload = parsePushPayload(data('contribution.export-ready', { evil: 'x' }));

    expect(payload).toMatchObject({ boardId: 'b-1', exportId: 'e-9', workspaceId: 'ws-1' });
    expect(payload).not.toHaveProperty('evil');
  });

  it('chạm push → mở đúng màn Đóng góp kèm exportId của lượt đó', () => {
    const payload = parsePushPayload(data('contribution.export-failed'));

    expect(resolvePushHref(payload as NonNullable<typeof payload>)).toBe(`${BASE}?exportId=e-9`);
    expect(decidePushTap(payload, { authenticated: true, userId: 'user-me' })).toEqual({
      href: `${BASE}?exportId=e-9`,
      kind: 'navigate',
    });
  });

  it('push của người cũ (máy vừa đổi tài khoản) bị bỏ — không mở màn báo cáo của người khác', () => {
    const payload = parsePushPayload(data('contribution.export-ready'));

    expect(decidePushTap(payload, { authenticated: true, userId: 'someone-else' })).toEqual({
      kind: 'ignored',
      reason: 'other-user',
    });
  });
});
