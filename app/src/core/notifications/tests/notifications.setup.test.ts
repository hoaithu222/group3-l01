import * as Notifications from 'expo-notifications';

import { useInAppBannerStore } from '../in-app-banner.store';
import { useAuthStore } from '@/shell/store/slices/auth';

import { initNotifications, isViewingScope } from '../notifications.setup';

/**
 * Handler foreground thật (module `AppProviders` gọi `initNotifications()`): đọc `useAuthStore` + registry room
 * của socket. `isRoomJoined` được mock để không dựng socket.
 */

const mockedIsRoomJoined = jest.fn<boolean, [string, string]>();
jest.mock('@/core/socket', () => ({
  isRoomJoined: (kind: string, id: string) => mockedIsRoomJoined(kind, id),
}));

// Âm báo native — không phát trong Jest; chỉ cần biết có được gọi hay không (p1-07: tôn trọng `sound`).
const mockedPlaySound = jest.fn();
jest.mock('../play-message-sound', () => ({ playMessageSound: () => mockedPlaySound() }));

type Handler = NonNullable<Parameters<typeof Notifications.setNotificationHandler>[0]>;

function notification(data: Record<string, string>, extra: { body?: string; title?: string } = {}) {
  return {
    request: { content: { data, ...extra }, identifier: 'n-1', trigger: null },
  } as never;
}

const CONVERSATION_PUSH = {
  scopeId: 'conv-1',
  scopeType: 'CONVERSATION',
  targetUserId: 'user-me',
  type: 'message.new',
};

let handler: Handler;

beforeAll(() => {
  initNotifications();
  const installed = jest.mocked(Notifications.setNotificationHandler).mock.calls[0]?.[0];
  if (!installed) throw new Error('handler chưa được cài');
  handler = installed;
});

beforeEach(() => {
  mockedPlaySound.mockReset();
  useInAppBannerStore.getState().dismiss();
  mockedIsRoomJoined.mockReset().mockReturnValue(false);
  useAuthStore.setState({
    status: 'authenticated',
    token: 'jwt',
    user: { id: 'user-me' } as never,
  });
});

afterAll(() => {
  useAuthStore.setState({ status: 'anonymous', token: null, user: null });
});

describe('isViewingScope', () => {
  it('map CHANNEL → room "ch", CONVERSATION → room "conv"', () => {
    mockedIsRoomJoined.mockReturnValue(true);
    expect(isViewingScope('CHANNEL', 'c1')).toBe(true);
    expect(mockedIsRoomJoined).toHaveBeenLastCalledWith('ch', 'c1');
    expect(isViewingScope('CONVERSATION', 'v1')).toBe(true);
    expect(mockedIsRoomJoined).toHaveBeenLastCalledWith('conv', 'v1');
  });

  it('scope không có room chat (MEETING, CALL…) → không bao giờ "đang xem"', () => {
    mockedIsRoomJoined.mockReturnValue(true);
    expect(isViewingScope('MEETING', 'm1')).toBe(false);
  });
});

describe('initNotifications', () => {
  it('cài handler đúng một lần dù gọi nhiều lần (Fast Refresh nạp lại module)', () => {
    const before = jest.mocked(Notifications.setNotificationHandler).mock.calls.length;
    initNotifications();
    initNotifications();
    expect(jest.mocked(Notifications.setNotificationHandler).mock.calls).toHaveLength(before);
  });
});

describe('handleNotification (foreground)', () => {
  it('tin nhắn gửi cho mình, KHÔNG đang xem → banner TRONG APP (p1-07), không để hệ điều hành vẽ bản thứ hai', async () => {
    const behavior = await handler.handleNotification(
      notification(CONVERSATION_PUSH, { body: 'Bạn có tin nhắn mới', title: 'Super App' }),
    );

    expect(behavior.shouldShowBanner).toBe(false);
    expect(behavior.shouldShowList).toBe(false);
    expect(useInAppBannerStore.getState().banner).toMatchObject({
      body: 'Bạn có tin nhắn mới',
      id: 'n-1',
      title: 'Super App',
    });
    expect(mockedPlaySound).toHaveBeenCalledTimes(1);
  });

  it('loại KHÔNG phải tin nhắn (nhắc họp) → vẫn banner hệ thống, không banner trong app', async () => {
    const behavior = await handler.handleNotification(
      notification({ meetingId: 'mt-1', targetUserId: 'user-me', type: 'meeting.reminder' }),
    );

    expect(behavior.shouldShowBanner).toBe(true);
    expect(useInAppBannerStore.getState().banner).toBeNull();
    expect(mockedPlaySound).not.toHaveBeenCalled();
  });

  it('đang xem đúng hội thoại → không banner nào (tin đã hiện ngay trên màn hình)', async () => {
    mockedIsRoomJoined.mockReturnValue(true);
    await handler.handleNotification(notification(CONVERSATION_PUSH));
    expect(useInAppBannerStore.getState().banner).toBeNull();
    expect(mockedPlaySound).not.toHaveBeenCalled();
  });

  it('đang xem đúng hội thoại → ẩn banner', async () => {
    mockedIsRoomJoined.mockReturnValue(true);
    const behavior = await handler.handleNotification(notification(CONVERSATION_PUSH));
    expect(behavior.shouldShowBanner).toBe(false);
    expect(mockedIsRoomJoined).toHaveBeenCalledWith('conv', 'conv-1');
  });

  it('push của người khác (máy vừa đổi tài khoản) → ẩn', async () => {
    const behavior = await handler.handleNotification(
      notification({ ...CONVERSATION_PUSH, targetUserId: 'someone-else' }),
    );
    expect(behavior.shouldShowBanner).toBe(false);
  });

  it('đăng xuất giữa chừng (không còn user) → ẩn, không hiện nhầm', async () => {
    useAuthStore.setState({ status: 'anonymous', token: null, user: null });
    const behavior = await handler.handleNotification(notification(CONVERSATION_PUSH));
    expect(behavior.shouldShowBanner).toBe(false);
  });

  it('push không phải của BE này (không có payload) → ẩn', async () => {
    const behavior = await handler.handleNotification(notification({}));
    expect(behavior.shouldShowBanner).toBe(false);
  });
});
