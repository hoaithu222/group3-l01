import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { act } from 'react';

import { useAuthStore } from '@/shell/store/slices/auth';

import { __resetHandledPushResponsesForTests, usePushTapRouting } from '../usePushTapRouting';

/**
 * `app.md` §4 "Tap" + PUSH-12: chạm thông báo → mở đúng màn, cả lúc mở nguội; máy vừa đổi tài khoản thì bỏ;
 * chưa đăng nhập xong thì đợi; không điều hướng lặp.
 */

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useRootNavigationState: jest.fn(),
}));

const mockedPush = jest.mocked(router.push);
const mockedNavState = jest.mocked(useRootNavigationState);
const mockedLastResponse = jest.mocked(Notifications.useLastNotificationResponse);
const mockedClear = jest.mocked(Notifications.clearLastNotificationResponse);

function response(data: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return {
    actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
    notification: { request: { content: { data }, identifier: 'push-1', trigger: null } },
    ...overrides,
  };
}

const CONVERSATION_PUSH = {
  scopeId: 'conv-1',
  scopeType: 'CONVERSATION',
  targetUserId: 'user-me',
  type: 'message.new',
};

function signIn(userId = 'user-me') {
  useAuthStore.setState({ status: 'authenticated', token: 'jwt', user: { id: userId } as never });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetHandledPushResponsesForTests();
  mockedNavState.mockReturnValue({ key: 'root' } as never);
  mockedLastResponse.mockReturnValue(null);
  useAuthStore.setState({ status: 'anonymous', token: null, user: null });
});

afterAll(() => {
  useAuthStore.setState({ status: 'anonymous', token: null, user: null });
});

describe('usePushTapRouting', () => {
  it('chạm push tin nhắn khi đã đăng nhập → mở hội thoại, và xoá lượt chạm đã xử lý', async () => {
    signIn();
    mockedLastResponse.mockReturnValue(response(CONVERSATION_PUSH) as never);

    await renderHook(() => usePushTapRouting());

    expect(mockedPush).toHaveBeenCalledWith({
      params: { conversationId: 'conv-1' },
      pathname: '/messages/[conversationId]',
    });
    expect(mockedClear).toHaveBeenCalledTimes(1);
  });

  it('không có lượt chạm nào → không làm gì', async () => {
    signIn();
    await renderHook(() => usePushTapRouting());
    expect(mockedPush).not.toHaveBeenCalled();
    expect(mockedClear).not.toHaveBeenCalled();
  });

  it('NT-07: targetUserId là người khác → KHÔNG điều hướng (vẫn xoá lượt chạm)', async () => {
    signIn('user-new');
    mockedLastResponse.mockReturnValue(response(CONVERSATION_PUSH) as never);

    await renderHook(() => usePushTapRouting());

    expect(mockedPush).not.toHaveBeenCalled();
    expect(mockedClear).toHaveBeenCalledTimes(1);
  });

  it('mở nguội: phiên đang khôi phục → GIỮ lượt chạm, điều hướng khi đăng nhập xong', async () => {
    useAuthStore.setState({ status: 'restoring', token: null, user: null });
    mockedLastResponse.mockReturnValue(response(CONVERSATION_PUSH) as never);

    await renderHook(() => usePushTapRouting());
    expect(mockedPush).not.toHaveBeenCalled();
    expect(mockedClear).not.toHaveBeenCalled();

    await act(async () => signIn());
    expect(mockedPush).toHaveBeenCalledTimes(1);
  });

  it('chưa đăng nhập hẳn (anonymous) → bỏ lượt chạm, không nhảy tới màn cũ sau đăng nhập', async () => {
    mockedLastResponse.mockReturnValue(response(CONVERSATION_PUSH) as never);

    await renderHook(() => usePushTapRouting());

    expect(mockedPush).not.toHaveBeenCalled();
    expect(mockedClear).toHaveBeenCalledTimes(1);
  });

  it('navigator gốc chưa dựng → đợi (router.push trước lúc đó bị nuốt)', async () => {
    signIn();
    mockedNavState.mockReturnValue(undefined as never);
    mockedLastResponse.mockReturnValue(response(CONVERSATION_PUSH) as never);

    const view = await renderHook(() => usePushTapRouting());
    expect(mockedPush).not.toHaveBeenCalled();

    mockedNavState.mockReturnValue({ key: 'root' } as never);
    await view.rerender({});
    expect(mockedPush).toHaveBeenCalledTimes(1);
  });

  it('không điều hướng lặp khi hook chạy lại với cùng lượt chạm (đổi user, refresh token…)', async () => {
    signIn();
    mockedLastResponse.mockReturnValue(response(CONVERSATION_PUSH) as never);

    const view = await renderHook(() => usePushTapRouting());
    await act(async () => signIn('user-me'));
    await view.rerender({});

    expect(mockedPush).toHaveBeenCalledTimes(1);
  });

  it('chỉ xử lý lượt chạm vào thân thông báo, không phải nút hành động/vuốt bỏ', async () => {
    signIn();
    mockedLastResponse.mockReturnValue(
      response(CONVERSATION_PUSH, { actionIdentifier: 'expo.modules.notifications.actions.DISMISS' }) as never,
    );

    await renderHook(() => usePushTapRouting());
    expect(mockedPush).not.toHaveBeenCalled();
  });

  it('payload không nhận diện được (push thử từ console) → bỏ, không ném', async () => {
    signIn();
    mockedLastResponse.mockReturnValue(response({ hello: 'world' }) as never);

    await renderHook(() => usePushTapRouting());
    expect(mockedPush).not.toHaveBeenCalled();
  });
});
