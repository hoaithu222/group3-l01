import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { grantsService } from '../api';
import { PrivateGrantsList } from '../components/PrivateGrantsList';

/**
 * Cấp quyền kênh riêng tư THEO VAI TRÒ (app.md p3-04 §3, §8):
 *  · RoleGrantSection: bật vai trò → hộp thoại xác nhận nêu "Khoảng N người … toàn bộ lịch sử";
 *  · PR-05: gỡ grant TRỰC TIẾP mà `effectiveSources` còn ROLE → hộp thoại giải thích.
 */

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
// Không thuộc phạm vi test này (tải người để thêm) — chỉ cần không kéo theo request.
jest.mock('../components/AddGrantSheet', () => ({ AddGrantSheet: () => null }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    grantsService: {
      access: jest.fn(),
      add: jest.fn(),
      addRole: jest.fn(),
      countRoleMembers: jest.fn(),
      list: jest.fn(),
      patch: jest.fn(),
      removeRole: jest.fn(),
      revoke: jest.fn(),
    },
  };
});

const mocked = jest.mocked(grantsService);

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const BINH = {
  userId: 'u-binh',
  name: 'Bình',
  level: 'MEMBER' as const,
  source: 'DIRECT' as const,
  roleRef: null,
  grantedBy: 'u-manager',
  createdAt: '2026-09-01T00:00:00.000Z',
};

async function renderList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  await render(<PrivateGrantsList canManage chId="ch-1" wsId="ws-1" />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.list.mockResolvedValue({ users: [BINH], roles: [] });
  mocked.revoke.mockResolvedValue(undefined);
  mocked.addRole.mockResolvedValue({ roleRef: 'ADMIN', level: 'MEMBER', grantedBy: 'u-manager', createdAt: '' });
  mocked.removeRole.mockResolvedValue(undefined);
  // ADMIN phủ OWNER + ADMIN: 1 + 4 = 5 người.
  mocked.countRoleMembers.mockImplementation(async (_ws, role) => (role === 'OWNER' ? 1 : role === 'ADMIN' ? 4 : 20));
});

describe('RoleGrantSection', () => {
  it('bật "Quản trị viên" → hộp thoại nêu Khoảng N người + toàn bộ lịch sử; xác nhận mới gọi API', async () => {
    await renderList();
    await screen.findByText('Bình');

    await fireEvent.press(screen.getByText('Quản trị viên'));

    expect(await screen.findByText('Cấp cho Quản trị viên?')).toBeOnTheScreen();
    expect(await screen.findByText(/Khoảng 5 người sẽ xem được toàn bộ lịch sử kênh/)).toBeOnTheScreen();
    // ⛔ Bật công tắc CHƯA được gọi API — phải qua nút xác nhận.
    expect(mocked.addRole).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Cấp quyền'));

    await waitFor(() => expect(mocked.addRole).toHaveBeenCalledWith('ch-1', 'ADMIN'));
  });

  it('vai trò MEMBER đếm cả chủ nhóm + quản trị viên + thành viên (không gồm khách)', async () => {
    await renderList();
    await screen.findByText('Bình');

    await fireEvent.press(screen.getByText('Toàn bộ thành viên'));

    // 1 + 4 + 20
    expect(await screen.findByText(/Khoảng 25 người/)).toBeOnTheScreen();
    expect(screen.getByText('Chủ nhóm, quản trị viên và thành viên — không gồm khách.')).toBeOnTheScreen();
  });

  it('vai trò đang được cấp: công tắc bật; tắt → cảnh báo mất quyền rồi gọi removeRole', async () => {
    mocked.list.mockResolvedValue({
      users: [BINH],
      roles: [{ roleRef: 'ADMIN', level: 'MEMBER', grantedBy: 'u-manager', createdAt: '' }],
    });
    await renderList();
    await screen.findByText('Bình');

    await fireEvent.press(screen.getByText('Quản trị viên'));

    expect(await screen.findByText('Gỡ quyền của Quản trị viên?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Gỡ quyền'));

    await waitFor(() => expect(mocked.removeRole).toHaveBeenCalledWith('ch-1', 'ADMIN'));
  });
});

describe('PR-05 — gỡ grant trực tiếp khi còn quyền qua vai trò', () => {
  async function revokeBinh() {
    await renderList();
    await fireEvent.press(await screen.findByLabelText('Thu hồi quyền của Bình'));
    // Thu hồi phải GÕ LẠI TÊN để xác nhận (khuôn có sẵn của GrantRow).
    await fireEvent.changeText(screen.getByPlaceholderText('Bình'), 'Bình');
    await fireEvent.press(screen.getByText('Thu hồi'));
  }

  it('effectiveSources còn ROLE:ADMIN → hộp thoại giải thích người đó VẪN xem được', async () => {
    mocked.access.mockResolvedValue({ read: true, write: true, manage: false, effectiveSources: ['ROLE:ADMIN'] });

    await revokeBinh();

    await waitFor(() => expect(mocked.revoke).toHaveBeenCalledWith('ch-1', 'u-binh'));
    expect(await screen.findByText('Bình vẫn xem được kênh này')).toBeOnTheScreen();
    expect(screen.getByText(/được cấp qua vai trò quản trị viên nên người này vẫn xem được kênh/)).toBeOnTheScreen();
    expect(mocked.access).toHaveBeenCalledWith('ch-1', 'u-binh');
  });

  it('không còn nguồn ROLE (mất quyền thật) → KHÔNG hiện hộp thoại giải thích', async () => {
    mocked.access.mockResolvedValue({ read: false, write: false, manage: false, effectiveSources: [] });

    await revokeBinh();

    await waitFor(() => expect(mocked.access).toHaveBeenCalled());
    expect(screen.queryByText('Bình vẫn xem được kênh này')).toBeNull();
  });

  it('hỏi nguồn quyền lỗi → nuốt lỗi (gỡ đã thành công), không hiện gì thêm', async () => {
    mocked.access.mockRejectedValue(new Error('mạng'));

    await revokeBinh();

    await waitFor(() => expect(mocked.access).toHaveBeenCalled());
    expect(screen.queryByText('Bình vẫn xem được kênh này')).toBeNull();
  });
});
