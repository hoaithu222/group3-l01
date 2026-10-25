import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';

import { useConnectProvider } from '../hooks/useConnectProvider';

/**
 * Luồng OAuth qua trình duyệt hệ thống (p5-03 app.md §4/§8): mock `expo-web-browser` trả `success` với URL callback → đọc kết quả; người dùng đóng
 * trình duyệt → `null`. App không bao giờ thấy token — chỉ nhận `authorizeUrl` và URL callback.
 */
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `superapp://${path}` }));

const openAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

describe('useConnectProvider', () => {
  it('success → mở authorizeUrl với redirect superapp://integrations/callback và trả kết quả đã đọc', async () => {
    openAuth.mockResolvedValue({
      type: 'success',
      url: 'superapp://integrations/callback?status=ok&provider=github&id=650000000000000000000001&workspaceId=650000000000000000000002',
    });
    const { result } = await renderHook(() => useConnectProvider(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.connect(() =>
        Promise.resolve({ authorizeUrl: 'https://github.com/apps/x/installations/new?state=s' }),
      );
    });
    expect(openAuth).toHaveBeenCalledWith(
      'https://github.com/apps/x/installations/new?state=s',
      'superapp://integrations/callback',
    );
    expect(outcome).toMatchObject({
      status: 'ok',
      id: '650000000000000000000001',
      workspaceId: '650000000000000000000002',
    });
  });

  it('người dùng đóng trình duyệt → null, không làm gì', async () => {
    openAuth.mockResolvedValue({ type: 'cancel' });
    const { result } = await renderHook(() => useConnectProvider(), { wrapper });
    let outcome: unknown = 'chưa chạy';
    await act(async () => {
      outcome = await result.current.connect(() =>
        Promise.resolve({ authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth' }),
      );
    });
    expect(outcome).toBeNull();
    expect(result.current.pending).toBe(false);
  });
});
