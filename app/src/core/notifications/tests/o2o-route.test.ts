import { hrefForTarget, hrefOrActivity } from '../notification-route';
import { parsePushPayload } from '../push-payload.types';
import { resolvePushHref } from '../push-router';

/**
 * p6-05 (`app.md` §1 "thông báo `PRINT_ORDER_*` → `o2o/print/[orderId]`"): thông báo `print-order.*` của BE
 * (`be/src/modules/o2o/services/o2o-notifications.ts`, `dataKeys: ["orderId", "code"]`) mở VÉ ĐƠN của khách. Chủ tiệm (`print-order.new`) làm việc ở admin nên
 * không có màn ở app → hộp thư.
 */
const TICKET = '/me/o2o/print/[orderId]';

describe('hrefForTarget — print-order.*', () => {
  it.each([
    'print-order.accepted',
    'print-order.rejected',
    'print-order.ready',
    'print-order.picked-up',
    'print-order.cancelled',
    'print-order.expiring',
    'print-order.expired',
  ])('%s + orderId → vé đơn', (type) => {
    expect(hrefForTarget({ orderId: 'ord-1', type })).toEqual({
      params: { orderId: 'ord-1' },
      pathname: TICKET,
    });
  });

  it('thiếu orderId → null (rơi về hộp thư /activity)', () => {
    expect(hrefForTarget({ type: 'print-order.ready' })).toBeNull();
    expect(hrefOrActivity({ type: 'print-order.ready' })).toBe('/activity');
  });

  it('`print-order.new` (gửi cho CHỦ TIỆM) không mở vé đơn của khách — về hộp thư', () => {
    expect(hrefForTarget({ orderId: 'ord-1', type: 'print-order.new' })).toBeNull();
    expect(hrefOrActivity({ orderId: 'ord-1', type: 'print-order.new' })).toBe('/activity');
  });
});

describe('đường push: `orderId` đi từ data của FCM tới màn vé', () => {
  it('payload hợp lệ giữ khoá `orderId` (danh sách khoá cho phép) và được đổi thành đường dẫn vé', () => {
    const payload = parsePushPayload({
      code: 'PO-7K2M9Q',
      orderId: 'ord-1',
      targetUserId: 'u1',
      type: 'print-order.ready',
    });

    expect(payload).toMatchObject({ orderId: 'ord-1', type: 'print-order.ready' });
    expect(payload && resolvePushHref(payload)).toEqual({
      params: { orderId: 'ord-1' },
      pathname: TICKET,
    });
  });
});
