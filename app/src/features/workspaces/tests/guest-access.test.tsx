import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { showToast } from '@/shared/utils/toast.utils';

import type { WorkspaceDetail, WorkspaceOverview } from '../api';
import { GuestAccessBanner } from '../components/GuestAccessBanner';
import { useWorkspaceSocket } from '../hooks/useWorkspaceSocket';
import { useGuestAccess, useIsGuest } from '../hooks/useIsGuest';
import { workspaceKeys } from '../queries/workspaces.keys';
import { useWorkspaceOverview } from '../queries/workspaces.queries';
import { guestRevokeMessage } from '../utils/guest-revoke.utils';

/**
 * Vỏ KHÁCH ở hub nhóm (app.md p3-04 §3, §8). Hub (`WorkspaceOverviewScreen`) do điều phối
 * viên tích hợp — ở đây khoá HAI thứ hub dựa vào: `useIsGuest`/`useGuestAccess` (ẩn Thành
 * viên · Việc · Tài liệu · Mời khi `myRole: GUEST`) + `GuestAccessBanner` (tự chứa), và
 * `permission:revoked` khi khách hết hạn (điều hướng + toast).
 */

/** Socket giả: gom handler theo tên sự kiện để test "bắn" `permission:revoked` không cần server. */
const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('@/core/socket', () => {
  const { SocketEvent } = jest.requireActual('@/core/socket/socket.events');
  return {
    SocketEvent,
    useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
      mockHandlers.set(event, handler);
    },
  };
});
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../queries/workspaces.queries', () => ({ useWorkspaceOverview: jest.fn() }));

const mockedOverview = jest.mocked(useWorkspaceOverview);

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const DAY = 24 * 60 * 60 * 1000;

function mockOverview(workspace: Partial<WorkspaceDetail> | undefined): void {
  mockedOverview.mockReturnValue({
    data: workspace ? ({ workspace } as WorkspaceOverview) : undefined,
    isLoading: false,
  } as ReturnType<typeof useWorkspaceOverview>);
}

describe('useIsGuest / useGuestAccess', () => {
  it('myRole GUEST → isGuest + hạn của CHÍNH MÌNH (không suy vai trò từ nguồn nào khác)', async () => {
    const expiresAt = new Date(Date.now() + 12 * DAY).toISOString();
    mockOverview({ myRole: 'GUEST', myExpiresAt: expiresAt });

    const { result } = await renderHook(() => useGuestAccess('ws-1'));

    expect(result.current).toMatchObject({ isGuest: true, expiresAt });
  });

  it.each(['OWNER', 'ADMIN', 'MEMBER'] as const)('%s → KHÔNG phải khách, không có hạn', async (myRole) => {
    mockOverview({ myRole, myExpiresAt: '2030-01-01T00:00:00.000Z' });

    const { result } = await renderHook(() => useGuestAccess('ws-1'));

    expect(result.current).toMatchObject({ isGuest: false, expiresAt: null });
  });

  it('chưa tải xong → isGuest=false (không giấu nhầm mục của thành viên thường)', async () => {
    mockOverview(undefined);

    const { result } = await renderHook(() => useIsGuest('ws-1'));

    expect(result.current).toBe(false);
  });
});

describe('GuestAccessBanner', () => {
  async function renderBanner() {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <GuestAccessBanner wsId="ws-1" />
      </SafeAreaProvider>,
    );
  }

  it('khách còn 12 ngày → "Khách · còn 12 ngày" kèm NGÀY hết hạn cụ thể', async () => {
    mockOverview({ myRole: 'GUEST', myExpiresAt: new Date(Date.now() + 12 * DAY).toISOString() });

    await renderBanner();

    expect(screen.getByText('Khách · còn 12 ngày')).toBeOnTheScreen();
    expect(screen.getByText(/Bạn chỉ thấy các kênh được chỉ định/)).toBeOnTheScreen();
    expect(screen.getByText(/Quyền khách hết hạn \d{2}\/\d{2}\/\d{4}/)).toBeOnTheScreen();
  });

  it('còn < 48 giờ → đổi sang giờ ("còn 30 giờ") — nhấn bằng CHỮ, không chỉ màu', async () => {
    mockOverview({ myRole: 'GUEST', myExpiresAt: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString() });

    await renderBanner();

    expect(screen.getByText('Khách · còn 30 giờ')).toBeOnTheScreen();
  });

  it('không phải khách → không vẽ gì', async () => {
    mockOverview({ myRole: 'MEMBER' });

    await renderBanner();

    expect(screen.queryByText(/Khách/)).toBeNull();
  });
});

describe('guestRevokeMessage', () => {
  const NOW = new Date('2026-09-19T10:00:00.000Z').getTime();
  const PAST = '2026-09-19T09:59:30.000Z';

  it('reason EXPIRED của một khách → "Quyền khách đã hết hạn."', () => {
    expect(guestRevokeMessage('EXPIRED', { wasGuest: true, expiresAt: null }, NOW)).toBe('Quyền khách đã hết hạn.');
  });

  it('BE dùng REMOVED nhưng hạn đã qua → vẫn nhận ra là hết hạn', () => {
    expect(guestRevokeMessage('REMOVED', { wasGuest: true, expiresAt: PAST }, NOW)).toBe('Quyền khách đã hết hạn.');
  });

  it('khách bị quản trị loại GIỮA hạn → KHÔNG nói "hết hạn" (nói sai tệ hơn im lặng)', () => {
    const future = new Date(NOW + 10 * DAY).toISOString();
    expect(guestRevokeMessage('REMOVED', { wasGuest: true, expiresAt: future }, NOW)).toBeNull();
    expect(guestRevokeMessage('BANNED', { wasGuest: true, expiresAt: PAST }, NOW)).toBeNull();
  });

  it('không phải khách / chưa biết → không nói gì', () => {
    expect(guestRevokeMessage('EXPIRED', { wasGuest: false, expiresAt: PAST }, NOW)).toBeNull();
    expect(guestRevokeMessage('EXPIRED', null, NOW)).toBeNull();
  });
});

describe('useWorkspaceSocket — permission:revoked của khách (RB-04 phía app)', () => {
  const revoked = (reason: string, scopeId = 'ws-1') => ({
    v: 1,
    scopeType: 'WORKSPACE',
    scopeId,
    version: 5,
    reason,
    cascade: true,
  });

  async function mountSocket(cached: Partial<WorkspaceDetail> | null, activeId = 'ws-1') {
    const queryClient = new QueryClient();
    if (cached) queryClient.setQueryData(workspaceKeys.detail('ws-1'), cached);
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    }
    await renderHook(() => useWorkspaceSocket(activeId), { wrapper: Wrapper });
    return queryClient;
  }

  beforeEach(() => {
    mockHandlers.clear();
    jest.clearAllMocks();
  });

  it('khách đang ở trong nhóm hết hạn → về danh sách nhóm + toast "Quyền khách đã hết hạn."', async () => {
    const queryClient = await mountSocket({ myRole: 'GUEST', myExpiresAt: '2026-01-01T00:00:00.000Z' });

    mockHandlers.get('permission:revoked')?.(revoked('REMOVED'));

    expect(router.replace).toHaveBeenCalledWith('/workspaces');
    expect(showToast).toHaveBeenCalledWith('info', 'Quyền khách đã hết hạn.');
    // Cache chi tiết nhóm bị xoá (đọc vai trò TRƯỚC khi xoá — nếu đảo thứ tự thì không còn gì để nhận ra khách).
    expect(queryClient.getQueryData(workspaceKeys.detail('ws-1'))).toBeUndefined();
  });

  it('thành viên thường bị loại → vẫn điều hướng như cũ, KHÔNG toast "hết hạn"', async () => {
    await mountSocket({ myRole: 'MEMBER' });

    mockHandlers.get('permission:revoked')?.(revoked('REMOVED'));

    expect(router.replace).toHaveBeenCalledWith('/workspaces');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('khách hết hạn ở nhóm KHÁC (đang xem nhóm khác) → không điều hướng, không toast', async () => {
    await mountSocket({ myRole: 'GUEST', myExpiresAt: '2026-01-01T00:00:00.000Z' }, 'ws-khac');

    mockHandlers.get('permission:revoked')?.(revoked('EXPIRED'));

    expect(router.replace).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
