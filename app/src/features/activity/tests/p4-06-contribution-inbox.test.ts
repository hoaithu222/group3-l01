import type { InboxItem } from '@/core/notifications';
import { hrefForTarget } from '@/core/notifications';

import { describeActivity } from '../utils/describe-item';
import { inboxItemTarget } from '../utils/inbox-target';

function make(overrides: Partial<InboxItem>): InboxItem {
  return {
    actor: null,
    actorId: null,
    context: { available: true, muted: false },
    createdAt: '2026-09-25T10:00:00.000Z',
    id: 'n1',
    kind: 'CONTRIBUTION_EXPORT_READY',
    muted: false,
    readAt: null,
    refs: { boardId: 'b1', exportId: 'e1', workspaceId: 'ws-1' } as never,
    scopeId: null,
    scopeType: 'WORKSPACE',
    type: 'contribution.export-ready',
    unavailable: false,
    workspaceId: 'ws-1',
    ...overrides,
  };
}

describe('hộp thư — báo cáo đóng góp (p4-06)', () => {
  it('câu mô tả: sẵn sàng / lỗi — không có tên người hay số liệu', () => {
    expect(describeActivity(make({})).title).toBe('Báo cáo đóng góp đã sẵn sàng');
    expect(describeActivity(make({ kind: 'CONTRIBUTION_EXPORT_FAILED', type: 'contribution.export-failed' })).title).toBe(
      'Không tạo được báo cáo đóng góp',
    );
  });

  it('đích: refs.exportId + boardId + workspaceId → màn Đóng góp của bảng kèm exportId', () => {
    const target = inboxItemTarget(make({}));

    expect(target).toMatchObject({ boardId: 'b1', exportId: 'e1', type: 'contribution.export-ready', workspaceId: 'ws-1' });
    expect(hrefForTarget(target)).toBe('/workspaces/ws-1/boards/b1/contribution?exportId=e1');
  });

  it('mục mất quyền (BE đã xoá refs): không có đích, mô tả trung tính', () => {
    const item = make({ refs: null, unavailable: true, workspaceId: null });

    expect(describeActivity(item).title).toBe('Nội dung không còn khả dụng');
    expect(hrefForTarget(inboxItemTarget(item))).toBeNull();
  });
});
