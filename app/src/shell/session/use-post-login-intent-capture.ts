import { useEffect } from 'react';
import { Linking } from 'react-native';

import { useAuthStore } from '@/shell/store/slices/auth';

import { savePostLoginIntent, toPostLoginPath } from './post-login-intent';

/**
 * Nhớ link ngắn (`/live/{pin}`, `/m/…`, `/s/…`, `/w/…`) người dùng mở lúc CHƯA đăng nhập — xem
 * `post-login-intent.ts`. Chỉ ghi khi phiên đã CHẮC CHẮN là `anonymous`: đang `restoring` mà ghi
 * thì phiên khôi phục xong, link vẫn nằm đó và lôi người đăng nhập LẦN SAU vào một màn họ không
 * hề mở.
 */
export async function rememberDeepLinkIfAnonymous(url: string | null): Promise<void> {
  if (!url || useAuthStore.getState().status !== 'anonymous') return;
  const path = toPostLoginPath(url);
  if (path) await savePostLoginIntent(path);
}

/** Link mở ĐỘNG lúc app đang chạy (app ở nền/đang mở màn Đăng nhập, bấm link trong tin nhắn…). */
export function usePostLoginIntentCapture(): void {
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void rememberDeepLinkIfAnonymous(url);
    });
    return () => subscription.remove();
  }, []);
}

/** Link MỞ LẠNH app (`getInitialURL`) — gọi sau khi phiên đã chốt là `anonymous`. */
export async function rememberInitialDeepLink(): Promise<void> {
  try {
    await rememberDeepLinkIfAnonymous(await Linking.getInitialURL());
  } catch {
    // Không đọc được link khởi động là chuyện không đáng làm hỏng bước khôi phục phiên.
  }
}
