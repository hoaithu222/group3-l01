import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { memberAddService, workspaceAccessService, type MemberLookupItem } from '../api';
import { AddMemberByContactScreen } from '../screens/AddMemberByContactScreen';
import { apiError, renderWithProviders } from './test-utils';

/**
 * "Thêm thành viên bằng SĐT/email" — khoá hợp đồng với BE: chỉ tra khi ô đã là email đầy đủ/SĐT hợp lệ (giá trị gửi lên đã chuẩn
 * hoá), kết quả CHỈ có gợi ý che, thêm xong báo đúng, và câu lỗi riêng cho từng mã (`INV_004` ở đây nghĩa người được thêm bị chặn).
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ wsId: 'ws-1' }),
}));
const mockConnection = jest.fn(() => 'online');
jest.mock('@/core/socket', () => ({ useConnectionState: () => mockConnection() }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
// Bỏ trễ 600 ms: test tất định, không dùng đồng hồ giả (React Query notify qua setTimeout).
jest.mock('../hooks/useDebouncedValue', () => ({ useDebouncedValue: (value: unknown) => value }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return {
    ...actual,
    memberAddService: { lookup: jest.fn(), add: jest.fn() },
    workspaceAccessService: { get: jest.fn() },
  };
});

const mockedLookup = jest.mocked(memberAddService.lookup);
const mockedAdd = jest.mocked(memberAddService.add);
const mockedAccess = jest.mocked(workspaceAccessService.get);

const PLACEHOLDER = 'ban@congty.vn hoặc 0912 345 678';
const LAN: MemberLookupItem = {
  avatarUrl: null,
  hint: '+84 ****** 678',
  matchedBy: 'EMAIL',
  name: 'Lan Nguyễn',
  state: 'AVAILABLE',
  userId: 'u1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConnection.mockReturnValue('online');
  mockedAccess.mockResolvedValue({ myRole: 'OWNER', myPermissions: { canInvite: true } });
});

const type = (value: string) => fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), value);

describe('AddMemberByContactScreen — khi nào mới tra', () => {
  it('ô trống → giải thích cách tìm, KHÔNG gọi API', async () => {
    await renderWithProviders(<AddMemberByContactScreen />);

    expect(await screen.findByText(/nhập ĐÚNG và ĐỦ email hoặc số điện thoại/)).toBeOnTheScreen();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it.each([['0912'], ['lan@'], ['Nguyễn Văn A']])('%j (chưa đủ) → nhắc nhập đầy đủ, KHÔNG gọi API', async (partial) => {
    await renderWithProviders(<AddMemberByContactScreen />);

    await type(partial);

    expect(await screen.findByText('Nhập đầy đủ email hoặc số điện thoại để tìm.')).toBeOnTheScreen();
    expect(mockedLookup).not.toHaveBeenCalled();
  });

  it('email đầy đủ → gọi với email ĐÃ chuẩn hoá (chữ thường, cắt khoảng trắng)', async () => {
    mockedLookup.mockResolvedValue([]);
    await renderWithProviders(<AddMemberByContactScreen />);

    await type('  Lan@Congty.VN ');

    await waitFor(() => expect(mockedLookup).toHaveBeenCalledWith('ws-1', 'lan@congty.vn'));
  });

  it('SĐT các kiểu gõ → gọi với E.164', async () => {
    mockedLookup.mockResolvedValue([]);
    await renderWithProviders(<AddMemberByContactScreen />);

    await type('0912 345 678');

    await waitFor(() => expect(mockedLookup).toHaveBeenCalledWith('ws-1', '+84912345678'));
  });
});

describe('AddMemberByContactScreen — kết quả và thêm', () => {
  it('hiện tên + dòng khớp với liên hệ CÒN LẠI đã che; SĐT/email đầy đủ không lên màn hình', async () => {
    mockedLookup.mockResolvedValue([LAN]);
    await renderWithProviders(<AddMemberByContactScreen />);

    await type('lan@congty.vn');

    expect(await screen.findByText('Lan Nguyễn')).toBeOnTheScreen();
    expect(screen.getByText('Khớp email · SĐT +84 ****** 678')).toBeOnTheScreen();
    expect(screen.queryByText(/912345678/)).toBeNull();
  });

  it('khớp bằng SĐT → dòng "Khớp số điện thoại · Email l***@x.vn"', async () => {
    mockedLookup.mockResolvedValue([{ ...LAN, hint: 'l***@x.vn', matchedBy: 'PHONE' }]);
    await renderWithProviders(<AddMemberByContactScreen />);

    await type('0912345678');

    expect(await screen.findByText('Khớp số điện thoại · Email l***@x.vn')).toBeOnTheScreen();
  });

  it('bấm "Thêm" → thêm đúng userId, báo thành công', async () => {
    mockedLookup.mockResolvedValue([LAN]);
    mockedAdd.mockResolvedValue({ state: 'ADDED', userId: 'u1' });
    await renderWithProviders(<AddMemberByContactScreen />);
    await type('lan@congty.vn');

    await fireEvent.press(await screen.findByLabelText('Thêm Lan Nguyễn vào nhóm'));

    await waitFor(() => expect(mockedAdd).toHaveBeenCalledWith('ws-1', 'u1'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã thêm Lan Nguyễn vào nhóm.'));
  });

  it('đã là thành viên → nhãn chữ, KHÔNG có nút Thêm; đang bị chặn khỏi nhóm → nhãn chữ', async () => {
    mockedLookup.mockResolvedValue([
      { ...LAN, state: 'ALREADY_MEMBER' },
      { ...LAN, name: 'Bình Trần', state: 'BANNED', userId: 'u2' },
    ]);
    await renderWithProviders(<AddMemberByContactScreen />);

    await type('0912345678');

    expect(await screen.findByText('Đã trong nhóm')).toBeOnTheScreen();
    expect(screen.getByText('Đang bị chặn khỏi nhóm')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Thêm .* vào nhóm$/)).toBeNull();
  });

  it('mất mạng → khoá nút Thêm', async () => {
    mockConnection.mockReturnValue('offline');
    mockedLookup.mockResolvedValue([LAN]);
    await renderWithProviders(<AddMemberByContactScreen />);
    await type('lan@congty.vn');

    const button = await screen.findByLabelText('Thêm Lan Nguyễn vào nhóm');

    expect(button.props.accessibilityState?.disabled).toBe(true);
  });
});

describe('AddMemberByContactScreen — không có kết quả và lỗi', () => {
  it('không có ai + là email + được mời qua email → gợi ý "Mời qua email"', async () => {
    mockedLookup.mockResolvedValue([]);
    await renderWithProviders(<AddMemberByContactScreen />);
    await type('chua.co@congty.vn');

    expect(await screen.findByText('Không tìm thấy tài khoản')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByText('Mời qua email'));

    expect(router.push).toHaveBeenCalledWith({ params: { wsId: 'ws-1' }, pathname: '/workspaces/[wsId]/members/invite-email' });
  });

  it('không có ai + là SĐT → không có gợi ý mời qua email (SĐT không gửi được lời mời)', async () => {
    mockedLookup.mockResolvedValue([]);
    await renderWithProviders(<AddMemberByContactScreen />);
    await type('0912345678');

    expect(await screen.findByText('Không tìm thấy tài khoản')).toBeOnTheScreen();
    expect(screen.queryByText('Mời qua email')).toBeNull();
  });

  it.each([
    ['INV_004', 403, 'Người này đang bị chặn khỏi nhóm. Hãy bỏ chặn trước khi thêm.'],
    ['BLOCK_003', 403, 'Không thể thêm người này.'],
    ['WS_006', 409, 'Người này đã tham gia số nhóm tối đa.'],
    ['WS_002', 409, 'Nhóm đã được lưu trữ, không thể thêm thành viên.'],
  ])('thêm lỗi %s → câu riêng của màn này (không dùng câu chung "Bạn không thể tham gia nhóm này")', async (code, status, message) => {
    mockedLookup.mockResolvedValue([LAN]);
    mockedAdd.mockRejectedValue(apiError(status, code));
    await renderWithProviders(<AddMemberByContactScreen />);
    await type('lan@congty.vn');

    await fireEvent.press(await screen.findByLabelText('Thêm Lan Nguyễn vào nhóm'));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', message));
  });

  it('tra bị 429 → báo ngay trong màn, không toast', async () => {
    mockedLookup.mockRejectedValue(apiError(429, 'RATE_003'));
    await renderWithProviders(<AddMemberByContactScreen />);

    await type('lan@congty.vn');

    expect(await screen.findByText('Bạn tra cứu quá nhiều lần. Hãy thử lại sau ít phút.')).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
  });
});
