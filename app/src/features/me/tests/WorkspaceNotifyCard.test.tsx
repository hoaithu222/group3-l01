import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { notificationPreferencesService } from '@/core/notifications';

import { WorkspaceNotifyCard } from '../components/WorkspaceNotifyCard';
import { useNotificationWorkspaces } from '../hooks/useNotificationWorkspaces';

/**
 * p1-07 `app.md` §3: `NotifyModeSheet` dùng cho nhóm làm việc — "Theo mặc định (…)" hiện giá trị kế thừa THỰC TẾ,
 * đổi chế độ gửi `PUT /workspaces/:id/notification-preferences` đúng enum (`INHERIT`/`MENTIONS_AND_THREADS`).
 */

jest.mock('../hooks/useNotificationWorkspaces', () => ({ useNotificationWorkspaces: jest.fn() }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const getSpy = jest.spyOn(notificationPreferencesService, 'getWorkspace');
const putSpy = jest.spyOn(notificationPreferencesService, 'updateWorkspace');

const PREF = {
  channelMode: 'INHERIT' as const,
  effective: { channelMode: 'MENTIONS_AND_THREADS' as const, groupMode: 'ALL' as const },
  groupMode: 'INHERIT' as const,
  workspaceId: 'ws-1',
};

function workspacesAre(result: object) {
  jest.mocked(useNotificationWorkspaces).mockReturnValue(result as never);
}

async function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<WorkspaceNotifyCard disabled={false} />, { wrapper: Wrapper });
}

beforeEach(() => {
  getSpy.mockReset().mockResolvedValue(PREF);
  putSpy.mockReset().mockResolvedValue({ ...PREF, groupMode: 'MENTIONS_AND_THREADS' });
  workspacesAre({
    data: [{ id: 'ws-1', name: 'Đồ án' }],
    isError: false,
    isLoading: false,
    isSuccess: true,
  });
});

describe('WorkspaceNotifyCard', () => {
  it('không có nhóm làm việc nào, hoặc lỗi tải → ẩn cả khối (không thẻ rỗng)', async () => {
    workspacesAre({ data: [], isError: false, isLoading: false, isSuccess: true });
    const empty = await renderCard();
    expect(screen.queryByText('Theo nhóm làm việc')).toBeNull();
    await empty.unmount();

    workspacesAre({ data: undefined, isError: true, isLoading: false, isSuccess: false });
    await renderCard();
    expect(screen.queryByText('Theo nhóm làm việc')).toBeNull();
  });

  it('mở nhóm → hai dòng Nhóm chat / Kênh, mỗi dòng ghi giá trị KẾ THỪA thực tế', async () => {
    await renderCard();
    await userEvent.press(screen.getByText('Đồ án'));

    expect(await screen.findByText('Theo mặc định (Mọi tin)')).toBeOnTheScreen(); // Nhóm chat
    expect(screen.getByText('Theo mặc định (Chỉ nhắc tên & luồng)')).toBeOnTheScreen(); // Kênh
  });

  it('đổi "Nhóm chat" sang Chỉ nhắc tên → PUT { groupMode: MENTIONS_AND_THREADS }', async () => {
    await renderCard();
    await userEvent.press(screen.getByText('Đồ án'));
    await userEvent.press(await screen.findByText('Nhóm chat'));
    await userEvent.press(await screen.findByText('Chỉ nhắc tên & luồng'));

    await waitFor(() => expect(putSpy).toHaveBeenCalledWith('ws-1', { groupMode: 'MENTIONS_AND_THREADS' }));
  });

  it('chọn "Theo mặc định" → PUT INHERIT (quay về cài đặt tài khoản)', async () => {
    getSpy.mockResolvedValue({ ...PREF, channelMode: 'MUTED' });
    await renderCard();
    await userEvent.press(screen.getByText('Đồ án'));
    await userEvent.press(await screen.findByText('Kênh'));
    await userEvent.press(await screen.findByText(/^Theo mặc định/));

    await waitFor(() => expect(putSpy).toHaveBeenCalledWith('ws-1', { channelMode: 'INHERIT' }));
  });
});
