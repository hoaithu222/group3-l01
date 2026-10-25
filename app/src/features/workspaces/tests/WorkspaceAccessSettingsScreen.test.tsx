import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { workspaceAccessApi, type WorkspaceDetail } from '../api';
import { useWorkspace } from '../queries/workspaces.queries';
import { WorkspaceAccessSettingsScreen } from '../screens/WorkspaceAccessSettingsScreen';
import { renderWithProviders } from './test-utils';

/**
 * Thiết lập QUYỀN TRUY CẬP của CHỦ NHÓM (app.md p3-04 §3, §8): chỉ gửi trường ĐÃ ĐỔI kèm
 * `expectedVersion`; `guestPolicy` gửi CẢ KHỐI; 409 giữ nguyên form; không phải OWNER thì không có công tắc.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'online' }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('../queries/workspaces.queries', () => ({ useWorkspace: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, workspaceAccessApi: { cancelJoinRequest: jest.fn(), updateSettings: jest.fn() } };
});

const mockedUpdate = jest.mocked(workspaceAccessApi.updateSettings);
const mockedUseWorkspace = jest.mocked(useWorkspace);

const DETAIL = { id: 'ws-1', myRole: 'OWNER', version: 3, joinPolicy: 'OPEN', guestPolicy: null } as WorkspaceDetail;

function mockDetail(patch: Partial<WorkspaceDetail> = {}): void {
  mockedUseWorkspace.mockReturnValue({
    data: { ...DETAIL, ...patch },
    error: null,
    isError: false,
    isLoading: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useWorkspace>);
}

beforeEach(() => jest.clearAllMocks());

describe('WorkspaceAccessSettingsScreen', () => {
  it('CHỦ NHÓM bật "Duyệt thành viên mới" → chỉ gửi trường ĐÃ ĐỔI + expectedVersion', async () => {
    mockDetail();
    mockedUpdate.mockResolvedValue({ joinPolicy: 'APPROVAL', version: 4 });
    await renderWithProviders(<WorkspaceAccessSettingsScreen />);

    await fireEvent.press(screen.getByText('Duyệt thành viên mới'));
    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('ws-1', { expectedVersion: 3, joinPolicy: 'APPROVAL' }));
    expect(showToast).toHaveBeenCalledWith('success', 'Đã lưu thiết lập truy cập.');
  });

  it('bật "Cho phép mời khách" → hiện trần số khách/ngày; gửi CẢ KHỐI guestPolicy với mặc định vừa phải', async () => {
    mockDetail();
    mockedUpdate.mockResolvedValue({});
    await renderWithProviders(<WorkspaceAccessSettingsScreen />);
    expect(screen.queryByText('Số khách tối đa')).toBeNull();

    await fireEvent.press(screen.getByText('Cho phép mời khách'));
    expect(screen.getByText('Số khách tối đa')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('ws-1', {
        expectedVersion: 3,
        guestPolicy: { enabled: true, maxGuests: 5, maxDays: 30, memberCanInvite: false },
      }),
    );
  });

  it('chưa đổi gì → nút Lưu khoá, không gọi API', async () => {
    mockDetail();
    await renderWithProviders(<WorkspaceAccessSettingsScreen />);

    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('409 RES_003 (version lệch) → toast lỗi, giữ nguyên form để người dùng thử lại', async () => {
    mockDetail();
    mockedUpdate.mockRejectedValue(
      Object.assign(new Error('409'), {
        isAxiosError: true,
        response: { status: 409, data: { error: { code: 'RES_003', message: 'RES_003' } }, headers: {} },
      }),
    );
    await renderWithProviders(<WorkspaceAccessSettingsScreen />);

    await fireEvent.press(screen.getByText('Duyệt thành viên mới'));
    await fireEvent.press(screen.getByText('Lưu thay đổi'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Dữ liệu đã thay đổi, vui lòng tải lại rồi thử lại'),
    );
  });

  it('ADMIN (không phải OWNER) → chỉ thấy thông báo, không có công tắc', async () => {
    mockDetail({ myRole: 'ADMIN' });
    await renderWithProviders(<WorkspaceAccessSettingsScreen />);

    expect(screen.getByText('Bạn không đổi được thiết lập này')).toBeOnTheScreen();
    expect(screen.queryByText('Duyệt thành viên mới')).toBeNull();
  });
});
