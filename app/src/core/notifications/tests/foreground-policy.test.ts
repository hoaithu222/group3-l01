import { decideForeground, toNotificationBehavior } from '../foreground-policy';
import { parsePushPayload } from '../push-payload.types';

/**
 * `app.md` §8: đang subscribe `conv:X` + active → không banner; khác scope → banner;
 * `targetUserId` lệch → không hiển thị.
 */

const ME = 'user-me';

function payload(overrides: Record<string, string> = {}) {
  return parsePushPayload({
    messageId: 'msg-1',
    scopeId: 'conv-1',
    scopeType: 'CONVERSATION',
    targetUserId: ME,
    type: 'message.new',
    ...overrides,
  });
}

const notViewing = () => false;

describe('decideForeground', () => {
  it('hiện banner khi push gửi cho mình và không đang xem scope đó', () => {
    expect(decideForeground(payload(), { currentUserId: ME, isViewing: notViewing })).toEqual({
      show: true,
    });
  });

  it('ẩn khi đang xem đúng scope (đã join room)', () => {
    const isViewing = jest.fn((scopeType: string, scopeId: string) => {
      return scopeType === 'CONVERSATION' && scopeId === 'conv-1';
    });
    expect(decideForeground(payload(), { currentUserId: ME, isViewing })).toEqual({
      reason: 'viewing-scope',
      show: false,
    });
    expect(isViewing).toHaveBeenCalledWith('CONVERSATION', 'conv-1');
  });

  it('vẫn hiện khi đang xem scope KHÁC', () => {
    const isViewing = (_type: string, id: string) => id === 'conv-2';
    expect(decideForeground(payload(), { currentUserId: ME, isViewing })).toEqual({ show: true });
  });

  it('ẩn khi targetUserId khác người đang đăng nhập (NT-07, máy vừa đổi tài khoản)', () => {
    expect(
      decideForeground(payload({ targetUserId: 'someone-else' }), {
        currentUserId: ME,
        isViewing: notViewing,
      }),
    ).toEqual({ reason: 'other-user', show: false });
  });

  it('ẩn khi chưa biết người đang đăng nhập — hiện nhầm tệ hơn bỏ lỡ một banner', () => {
    for (const currentUserId of [undefined, null]) {
      expect(decideForeground(payload(), { currentUserId, isViewing: notViewing })).toEqual({
        reason: 'other-user',
        show: false,
      });
    }
  });

  it('ẩn payload không nhận diện được (thiếu targetUserId)', () => {
    expect(decideForeground(null, { currentUserId: ME, isViewing: notViewing })).toEqual({
      reason: 'unrecognized',
      show: false,
    });
  });

  it.each(['call.incoming', 'call.cancelled', 'call.answered-elsewhere'])(
    'ẩn %s — data-only, UI do p2-02 vẽ',
    (type) => {
      expect(
        decideForeground(payload({ type }), { currentUserId: ME, isViewing: notViewing }),
      ).toEqual({ reason: 'data-only', show: false });
    },
  );

  it('meeting.reminder vẫn hiện dù đang xem đúng hội thoại của cuộc họp', () => {
    expect(
      decideForeground(payload({ type: 'meeting.reminder' }), {
        currentUserId: ME,
        isViewing: () => true,
      }),
    ).toEqual({ show: true });
  });

  it('thread.reply vẫn hiện ở client — BE mới biết đang xem đúng luồng nào', () => {
    expect(
      decideForeground(payload({ type: 'thread.reply' }), {
        currentUserId: ME,
        isViewing: () => true,
      }),
    ).toEqual({ show: true });
  });
});

describe('toNotificationBehavior', () => {
  it('ẩn ⇒ không banner, không list, không âm, không huy hiệu', () => {
    expect(toNotificationBehavior({ reason: 'other-user', show: false })).toEqual({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: false,
    });
  });

  it('hiện ⇒ banner + list + âm, nhưng KHÔNG đặt huy hiệu (unread summary của app nắm)', () => {
    expect(toNotificationBehavior({ show: true })).toEqual({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    });
  });
});
