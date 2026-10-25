import type { InboxItem } from '@/core/notifications';
import { hrefForTarget } from '@/core/notifications';

import { inboxItemTarget } from '../utils/inbox-target';

/**
 * p6-05: `print-order.*` mang `refs.orderId` (+ `code`) — chạm mục hộp thư mở đúng VÉ ĐƠN, cùng đường `hrefForTarget` với push nên hai đường vào không lệch nhau.
 * `print-order.new` (gửi cho chủ tiệm) không có màn ở app → mục hộp thư tự hiện đủ ngữ cảnh (đích `null`).
 */
function make(type: string, refs: Record<string, unknown>): InboxItem {
  return {
    actor: null,
    actorId: null,
    context: { available: true, muted: false },
    createdAt: '2026-09-27T08:00:00.000Z',
    id: 'n1',
    kind: 'DEFAULT',
    muted: false,
    readAt: null,
    refs,
    scopeId: null,
    scopeType: 'NONE',
    type,
    unavailable: false,
    workspaceId: null,
  } as unknown as InboxItem;
}

describe('hộp thư Hoạt động — đơn in', () => {
  it('refs.orderId đi vào target ⇒ mở vé đơn', () => {
    const ready = make('print-order.ready', { code: 'PO-7K2M9Q', orderId: 'ord-1' });

    expect(inboxItemTarget(ready).orderId).toBe('ord-1');
    expect(hrefForTarget(inboxItemTarget(ready))).toEqual({
      params: { orderId: 'ord-1' },
      pathname: '/me/o2o/print/[orderId]',
    });
  });

  it('chủ tiệm (print-order.new) hoặc thiếu orderId → không có đích riêng', () => {
    expect(
      hrefForTarget(inboxItemTarget(make('print-order.new', { orderId: 'ord-1' }))),
    ).toBeNull();
    expect(hrefForTarget(inboxItemTarget(make('print-order.ready', {})))).toBeNull();
  });
});
