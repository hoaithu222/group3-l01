import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { IntegrationCallbackScreen } from '../screens/IntegrationCallbackScreen';
import { parseCallback } from '../utils/callback-url';

/**
 * Deep link `superapp://integrations/callback` (p5-03 app.md §3/§8): lỗi `INT_003` hiện đúng thông điệp; thành công → mở màn cấu hình bằng đường dẫn
 * TYPED (không bao giờ điều hướng theo chuỗi từ link); tham số sai dạng bị bỏ.
 */
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

const WS = '650000000000000000000002';
const ID = '650000000000000000000001';

async function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 812, width: 375, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  await render(<IntegrationCallbackScreen />, { wrapper: Wrapper });
}

beforeEach(() => jest.clearAllMocks());

describe('IntegrationCallbackScreen', () => {
  it('status=error&code=INT_003 → "Phiên kết nối đã hết hạn", không điều hướng', async () => {
    mockParams = { status: 'error', code: 'INT_003', provider: 'github' };
    await renderScreen();
    expect(
      await screen.findByText('Phiên kết nối đã hết hạn, vui lòng thử lại.'),
    ).toBeOnTheScreen();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('status=ok → mở màn cấu hình của đúng kết nối', async () => {
    mockParams = { status: 'ok', provider: 'github', id: ID, workspaceId: WS };
    await renderScreen();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith({
        params: { integrationId: ID, wsId: WS },
        pathname: '/workspaces/[wsId]/integrations/[integrationId]',
      }),
    );
  });

  it('Google Calendar ok → về màn Lịch cá nhân', async () => {
    mockParams = { status: 'ok', provider: 'google-calendar', id: ID };
    await renderScreen();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/me/integrations'));
  });
});

describe('parseCallback', () => {
  it('bỏ giá trị sai dạng (id lạ, mã lạ, trạng thái lạ → error)', () => {
    expect(
      parseCallback(
        'superapp://integrations/callback?status=ok&id=../../x&workspaceId=abc&code=<script>',
      ),
    ).toEqual({
      status: 'ok',
      provider: null,
      id: null,
      code: null,
      workspaceId: null,
    });
    expect(parseCallback({ status: 'hack' }).status).toBe('error');
  });
});
