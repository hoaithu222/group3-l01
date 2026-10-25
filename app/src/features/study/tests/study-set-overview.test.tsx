import { fireEvent, screen } from '@testing-library/react-native';

import { useFeature } from '@/shell/capabilities';

import { studyService } from '../api/study.service';
import { SetOverviewScreen } from '../screens/SetOverviewScreen';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** Màn tổng quan bộ học: MỘT nút chính "Học thẻ", thao tác quản lý ở thanh tiêu đề/menu ⋯, xoá luôn xác nhận. */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ setId: 's1', wsId: 'ws-1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => 'connected' }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
jest.mock('../api/study.service', () => ({
  studyService: {
    create: jest.fn(),
    duplicate: jest.fn(),
    get: jest.fn(),
    items: jest.fn(),
    list: jest.fn(),
    popularTags: jest.fn(),
    remove: jest.fn(),
    report: jest.fn(),
    workspaceAccess: jest.fn(),
  },
}));

const mocked = jest.mocked(studyService);
const mockedFeature = jest.mocked(useFeature);
const PAGE = { hasMore: false, limit: 30, nextCursor: null };

beforeEach(() => {
  jest.clearAllMocks();
  mockedFeature.mockReturnValue(true);
  mocked.get.mockResolvedValue(makeSet());
  mocked.items.mockResolvedValue({
    items: [makeItem({ id: 'i1', order: 1 }), makeChoiceItem({ id: 'i2', order: 2 })],
    setVersion: 3,
  });
  mocked.list.mockResolvedValue({ items: [], meta: PAGE });
  mocked.popularTags.mockResolvedValue([]);
  mocked.workspaceAccess.mockResolvedValue({
    id: 'ws-1',
    myRole: 'MEMBER',
    name: 'Nhóm Toán',
    status: 'ACTIVE',
  });
});

describe('SetOverviewScreen — hành động theo myPermissions của server', () => {
  const openMenu = async () =>
    fireEvent.press(await screen.findByLabelText('Thêm tuỳ chọn cho bộ học'));

  it('tác giả: MỘT nút chính "Học thẻ"; "Sửa nội dung" là icon ở thanh tiêu đề; Sửa thông tin/Xoá trong menu ⋯; không có Báo cáo', async () => {
    await renderWithProviders(<SetOverviewScreen />);

    expect(await screen.findByText('Bộ học thử')).toBeOnTheScreen();
    expect(screen.getByText('Học thẻ')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sửa nội dung bộ học')).toBeOnTheScreen();
    // Các cách luyện tập khác là HÀNG có mũi tên, không phải nút riêng.
    expect(screen.getByText('Ôn theo lịch')).toBeOnTheScreen();
    expect(screen.getByText('Thi thử')).toBeOnTheScreen();

    await openMenu();
    expect(await screen.findByText('Sửa thông tin')).toBeOnTheScreen();
    expect(screen.getByText('Xoá bộ học')).toBeOnTheScreen();
    expect(screen.queryByText('Báo cáo bộ học')).toBeNull();
  });

  it('"Xoá bộ học" nằm trong menu và LUÔN hỏi xác nhận: chưa xác nhận thì chưa gọi API', async () => {
    await renderWithProviders(<SetOverviewScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByText('Xoá bộ học'));

    expect(await screen.findByText('Xoá bộ học?')).toBeOnTheScreen();
    expect(mocked.remove).not.toHaveBeenCalled();
  });

  it('người đọc: menu chỉ có Sao chép + Báo cáo; KHÔNG Sửa/Xoá và không có icon sửa nội dung', async () => {
    mocked.get.mockResolvedValue(
      makeSet({
        myPermissions: {
          delete: false,
          duplicate: true,
          edit: false,
          hide: false,
          report: true,
          unhide: false,
        },
        ownerId: 'other',
      }),
    );
    await renderWithProviders(<SetOverviewScreen />);
    await openMenu();

    expect(await screen.findByText('Sao chép về của tôi')).toBeOnTheScreen();
    expect(screen.getByText('Báo cáo bộ học')).toBeOnTheScreen();
    expect(screen.queryByText('Sửa thông tin')).toBeNull();
    expect(screen.queryByText('Xoá bộ học')).toBeNull();
    expect(screen.queryByLabelText('Sửa nội dung bộ học')).toBeNull();
  });

  it('bộ bị ẩn: tác giả thấy banner "Đã bị ẩn do vi phạm" kèm lý do (ST-19) và không sửa được', async () => {
    mocked.get.mockResolvedValue(makeSet({ hiddenReason: 'Vi phạm bản quyền', status: 'HIDDEN' }));
    await renderWithProviders(<SetOverviewScreen />);

    expect(await screen.findByText('Đã bị ẩn do vi phạm')).toBeOnTheScreen();
    expect(screen.getByText('Vi phạm bản quyền')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Sửa nội dung bộ học')).toBeNull();
  });

  it('404 ⇒ "Bộ học không còn khả dụng"', async () => {
    mocked.get.mockRejectedValue(
      Object.assign(new Error('x'), { isAxiosError: true, response: { data: {}, status: 404 } }),
    );
    await renderWithProviders(<SetOverviewScreen />);

    expect(await screen.findByText('Bộ học không còn khả dụng')).toBeOnTheScreen();
  });

  it('mất mạng (không có phản hồi) ⇒ "ngoại tuyến" + Thử lại, KHÔNG phải "không còn khả dụng"', async () => {
    // Lần đầu mất mạng (axios không có `response`), lần sau (bấm "Thử lại") về bình thường như `beforeEach`.
    mocked.get.mockRejectedValueOnce(
      Object.assign(new Error('Network Error'), { isAxiosError: true }),
    );
    await renderWithProviders(<SetOverviewScreen />);

    expect(await screen.findByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
    expect(screen.queryByText('Bộ học không còn khả dụng')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Học thẻ')).toBeOnTheScreen();
  });
});
