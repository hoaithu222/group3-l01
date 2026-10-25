import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { showToast } from '@/shared/utils/toast.utils';

import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import {
  apiError,
  channelPage,
  filePage,
  makeChannelHit,
  makeFileHit,
  makeMeetingHit,
  makePersonHit,
  meetingPage,
  peoplePage,
  renderWithProviders,
} from './fixtures';
import { mockedJoin, mockedSearch, resetScreenMocks, typeQuery } from './screen-harness';

/**
 * Mở kết quả TỆP / KÊNH / NGƯỜI / CUỘC HỌP (app.md p5-04 §4/§7): đúng route theo loại · "Tham gia" kênh công khai ngay trên hàng ·
 * người chỉ hiển thị khi là chính mình · giờ họp theo giờ máy. Kết quả tin, tìm gần đây, xem trước: `.open.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shell/capabilities', () => ({
  FeatureOffScreen: () => null,
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/workspace-search.service', () => ({
  workspaceSearchService: {
    getWorkspaceHead: jest.fn(),
    joinChannel: jest.fn(),
    listAuthors: jest.fn(),
    listScopes: jest.fn(),
    search: jest.fn(),
  },
}));

beforeEach(resetScreenMocks);

describe('WorkspaceSearchScreen — mở kết quả tệp/kênh/người/cuộc họp', () => {
  it('tệp của kho tài liệu → xem trước tài liệu; tệp của tin → tin gốc chứa nó', async () => {
    mockedSearch.mockResolvedValue(
      filePage([
        makeFileHit({
          assetId: 'a-1',
          name: 'giao-trinh.pdf',
          source: { kind: 'RESOURCE', resourceId: 'res-1' },
        }),
        makeFileHit({ assetId: 'a-2', name: 'bai-nop.docx' }),
      ]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('bài');
    await fireEvent.press(await screen.findByRole('tab', { name: 'Tệp' }, { timeout: 2000 }));

    await fireEvent.press(
      await screen.findByRole('button', { name: /giao-trinh\.pdf/ }, { timeout: 2000 }),
    );
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/workspaces/[wsId]/resources/preview/[resourceId]',
      params: { wsId: 'ws-1', resourceId: 'res-1' },
    });

    await fireEvent.press(screen.getByRole('button', { name: /bai-nop\.docx/ }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-1', m: 'm-1' },
    });
  });

  it('kênh đã tham gia → phòng chat; kênh công khai CHƯA vào có "Tham gia" ngay trên hàng, xong đổi sang đã tham gia', async () => {
    mockedSearch.mockResolvedValue(
      channelPage([
        makeChannelHit({ channelId: 'ch-in', joined: true, name: 'da-vao' }),
        makeChannelHit({ channelId: 'ch-out', joined: false, name: 'chua-vao' }),
      ]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('kênh');
    await fireEvent.press(await screen.findByRole('tab', { name: 'Kênh' }, { timeout: 2000 }));

    await fireEvent.press(
      await screen.findByRole('button', { name: /Kênh da-vao/ }, { timeout: 2000 }),
    );
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-in' },
    });

    const searchesBefore = mockedSearch.mock.calls.length;
    await fireEvent.press(screen.getByRole('button', { name: 'Tham gia' }));

    await waitFor(() => expect(mockedJoin).toHaveBeenCalledWith('ch-out'));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('success', 'Đã tham gia #chua-vao'));
    // Đổi ngay trong danh sách đang hiện (không tìm lại — tốn hạn mức 30 lần/phút).
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tham gia' })).toBeNull());
    expect(mockedSearch).toHaveBeenCalledTimes(searchesBefore);
  });

  it('"Tham gia" lỗi (kênh đầy…) → toast lỗi, hàng giữ nguyên', async () => {
    mockedJoin.mockRejectedValue(apiError(409, 'CH_006'));
    mockedSearch.mockResolvedValue(
      channelPage([makeChannelHit({ channelId: 'ch-out', joined: false, name: 'chua-vao' })]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('kênh');
    await fireEvent.press(await screen.findByRole('tab', { name: 'Kênh' }, { timeout: 2000 }));

    await fireEvent.press(
      await screen.findByRole('button', { name: 'Tham gia' }, { timeout: 2000 }),
    );

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', expect.any(String)));
    expect(screen.getByRole('button', { name: 'Tham gia' })).toBeOnTheScreen();
  });

  it('người: chạm mở tin nhắn riêng; CHÍNH MÌNH chỉ hiển thị (không mở nhắn với bản thân)', async () => {
    mockedSearch.mockResolvedValue(
      peoplePage([
        makePersonHit({ displayName: 'Nguyễn Văn An', userId: 'u-an' }),
        makePersonHit({ displayName: 'Tôi', presence: 'HIDDEN', role: 'OWNER', userId: 'u-me' }),
      ]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('an');
    await fireEvent.press(await screen.findByRole('tab', { name: 'Người' }, { timeout: 2000 }));

    // Trạng thái hiện diện bằng CHỮ, không chỉ chấm màu.
    expect(await screen.findByText('Đang hoạt động', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(screen.getByText('Chủ nhóm · Bạn')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Nguyễn Văn An'));

    expect(router.push).toHaveBeenLastCalledWith({
      pathname: '/messages/new',
      params: { avatarUrl: '', name: 'Nguyễn Văn An', userId: 'u-an' },
    });

    // Hàng của CHÍNH MÌNH không phải nút (không có vai `button`) — trình đọc màn hình không mời bấm vào thứ không làm gì.
    expect(screen.getByRole('button', { name: /Nguyễn Văn An/ })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Tôi/ })).toBeNull();
  });

  it('cuộc họp: giờ theo giờ máy + trạng thái bằng chữ + "Bạn được mời"; chạm mở chi tiết họp', async () => {
    mockedSearch.mockResolvedValue(
      meetingPage([
        makeMeetingHit({
          endAt: '2026-09-25T13:00:00.000Z',
          meetingId: 'mt-7',
          startAt: '2026-09-25T12:00:00.000Z',
        }),
      ]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('họp');
    await fireEvent.press(await screen.findByRole('tab', { name: 'Cuộc họp' }, { timeout: 2000 }));

    expect(await screen.findByText('Sắp tới', {}, { timeout: 2000 })).toBeOnTheScreen();
    expect(screen.getByText(/25\/09\/2026.* · Bạn được mời/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Họp đồ án tuần 3'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/meetings/[meetingId]',
      params: { meetingId: 'mt-7' },
    });
  });
});
