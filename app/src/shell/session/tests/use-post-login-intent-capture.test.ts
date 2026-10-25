import { renderHook } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { useAuthStore } from '@/shell/store/slices/auth';

import { consumePostLoginIntent } from '../post-login-intent';
import {
  rememberDeepLinkIfAnonymous,
  rememberInitialDeepLink,
  usePostLoginIntentCapture,
} from '../use-post-login-intent-capture';

/**
 * Chỉ nhớ link khi phiên đã CHẮC CHẮN là `anonymous`. Đang `restoring` hay `authenticated` mà ghi
 * thì link nằm lại trên đĩa và lôi người đăng nhập LẦN SAU vào một màn họ không hề mở.
 */

beforeEach(async () => {
  jest.restoreAllMocks();
  useAuthStore.getState().clearAuth();
  await consumePostLoginIntent();
});

describe('rememberDeepLinkIfAnonymous', () => {
  it('anonymous + link ngắn hợp lệ ⇒ nhớ', async () => {
    await rememberDeepLinkIfAnonymous('superapp://live/123456');

    expect(await consumePostLoginIntent()).toBe('/live/123456');
  });

  it.each(['authenticated', 'restoring', 'idle'] as const)(
    'status %s ⇒ KHÔNG nhớ',
    async (status) => {
      useAuthStore.setState({ status });

      await rememberDeepLinkIfAnonymous('superapp://live/123456');

      expect(await consumePostLoginIntent()).toBeNull();
    },
  );

  it('link không thuộc nhóm cho phép (reset-password…) ⇒ KHÔNG nhớ', async () => {
    await rememberDeepLinkIfAnonymous('superapp://reset-password?token=abc');

    expect(await consumePostLoginIntent()).toBeNull();
  });

  it('url rỗng/null ⇒ bỏ qua', async () => {
    await rememberDeepLinkIfAnonymous(null);

    expect(await consumePostLoginIntent()).toBeNull();
  });
});

describe('link mở lạnh app', () => {
  it('đọc getInitialURL rồi nhớ', async () => {
    jest
      .spyOn(Linking, 'getInitialURL')
      .mockResolvedValue('https://app.vidu.vn/w/ws1/c/ch1?m=msg1');

    await rememberInitialDeepLink();

    expect(await consumePostLoginIntent()).toBe('/w/ws1/c/ch1?m=msg1');
  });

  it('getInitialURL ném lỗi ⇒ nuốt, không làm hỏng bước khôi phục phiên', async () => {
    jest.spyOn(Linking, 'getInitialURL').mockRejectedValue(new Error('native lỗi'));

    await expect(rememberInitialDeepLink()).resolves.toBeUndefined();
  });
});

describe('usePostLoginIntentCapture — link mở lúc app đang chạy', () => {
  it('nghe sự kiện `url`, nhớ khi anonymous, và huỷ đăng ký lúc unmount', async () => {
    const remove = jest.fn();
    let onUrl: (event: { url: string }) => void = () => undefined;
    jest.spyOn(Linking, 'addEventListener').mockImplementation((_event, handler) => {
      onUrl = handler as typeof onUrl;
      return { remove } as never;
    });

    const { unmount } = await renderHook(() => usePostLoginIntentCapture());
    onUrl({ url: 'superapp://live/654321' });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await consumePostLoginIntent()).toBe('/live/654321');
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
