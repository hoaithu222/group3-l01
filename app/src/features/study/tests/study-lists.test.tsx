import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import { studyService } from '../api/study.service';
import type { StudySetSummaryDto } from '../api/study.types';
import { StudyHomeScreen } from '../screens/StudyHomeScreen';
import { WorkspaceStudyScreen } from '../screens/WorkspaceStudyScreen';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** Các màn của Học (app.md p4-01 §8): học thẻ, tạo bộ (PUBLIC cần xác nhận), quyền theo `myPermissions`, ẩn theo cờ/GUEST. */
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

function summary(overrides: Partial<StudySetSummaryDto> = {}): StudySetSummaryDto {
  const {
    myPermissions: _perms,
    hiddenAt: _at,
    hiddenReason: _reason,
    itemTypesMask: _mask,
    ...rest
  } = makeSet();
  return { ...rest, ...overrides };
}

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

describe('danh sách bộ học', () => {
  it('StudyHome: rỗng ⇒ "Chưa có bộ học" + Tạo; có dữ liệu ⇒ thẻ bộ với phạm vi bằng chữ; chạm mở tổng quan', async () => {
    await renderWithProviders(<StudyHomeScreen />);
    expect(await screen.findByText('Chưa có bộ học')).toBeOnTheScreen();
    expect(screen.getAllByText('Tạo bộ học').length).toBeGreaterThan(0);

    mocked.list.mockResolvedValue({ items: [summary({ itemCount: 12 })], meta: PAGE });
    await renderWithProviders(<StudyHomeScreen />);
    await fireEvent.press(await screen.findByLabelText(/^Bộ học thử, 12 mục, Riêng tư/));
    expect(router.push).toHaveBeenCalledWith({
      params: { setId: 's1' },
      pathname: '/study/sets/[setId]',
    });
  });

  it('StudyHome: "Tạo bộ học" chỉ có MỘT lối tại mỗi thời điểm — rỗng ⇒ nút trong trạng thái rỗng (không có "+" trên thanh tiêu đề)', async () => {
    await renderWithProviders(<StudyHomeScreen />);

    expect(await screen.findByText('Chưa có bộ học')).toBeOnTheScreen();
    // Nút trong trạng thái rỗng có nhãn = chữ; nếu "+" trên thanh tiêu đề cũng còn thì sẽ có HAI nút cùng tên.
    expect(screen.getAllByRole('button', { name: 'Tạo bộ học' })).toHaveLength(1);
    expect(screen.getAllByText('Tạo bộ học')).toHaveLength(1);
  });

  it('StudyHome: có bộ ⇒ lối tạo là nút "+" trên thanh tiêu đề, danh sách không còn nút "Tạo bộ học" nào khác', async () => {
    mocked.list.mockResolvedValue({ items: [summary({ itemCount: 12 })], meta: PAGE });
    await renderWithProviders(<StudyHomeScreen />);

    await fireEvent.press(await screen.findByLabelText('Tạo bộ học'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/study/new' });
    expect(screen.queryByText('Tạo bộ học')).toBeNull();
  });

  it('StudyHome: "Lịch sử thi thử" chỉ có ở menu ⋯; "Thi đấu trực tiếp" là ô lối tắt trong lưới VÀ còn trong menu', async () => {
    mocked.list.mockResolvedValue({ items: [summary()], meta: PAGE });
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);

    // Lưới lối tắt (chỉ ở "Của tôi"): đúng MỘT ô "Thi đấu trực tiếp", và không có nút "Lịch sử thi thử" nào dưới ô tìm.
    expect(screen.getAllByText('Thi đấu trực tiếp')).toHaveLength(1);
    expect(screen.queryByText('Lịch sử thi thử')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Thêm tuỳ chọn cho màn Học'));
    expect(await screen.findByText('Lịch sử thi thử')).toBeOnTheScreen();
    expect(screen.getAllByText('Thi đấu trực tiếp')).toHaveLength(2);
    await fireEvent.press(screen.getByText('Lịch sử thi thử'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/study/history' }));
  });

  it('StudyHome: cờ live-quiz tắt ⇒ không có "Thi đấu trực tiếp" ở lưới lẫn menu (không vẽ lối chắc chắn lỗi)', async () => {
    mockedFeature.mockReturnValue(false);
    mocked.list.mockResolvedValue({ items: [summary()], meta: PAGE });
    await renderWithProviders(<StudyHomeScreen />);
    await screen.findAllByLabelText(/^Bộ học thử/);
    expect(screen.queryByText('Thi đấu trực tiếp')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Thêm tuỳ chọn cho màn Học'));
    expect(await screen.findByText('Lịch sử thi thử')).toBeOnTheScreen();
    expect(screen.queryByText('Thi đấu trực tiếp')).toBeNull();
  });

  it('WorkspaceStudy: khách (GUEST) ⇒ "Không truy cập được", không gọi danh sách', async () => {
    mocked.workspaceAccess.mockResolvedValue({
      id: 'ws-1',
      myRole: 'GUEST',
      name: 'Nhóm',
      status: 'ACTIVE',
    });
    await renderWithProviders(<WorkspaceStudyScreen />);

    expect(await screen.findByText('Không truy cập được')).toBeOnTheScreen();
    expect(mocked.list).not.toHaveBeenCalled();
  });

  it('WorkspaceStudy: mất mạng ⇒ "ngoại tuyến" + Thử lại (không phải "Không truy cập được")', async () => {
    mocked.workspaceAccess.mockRejectedValue(
      Object.assign(new Error('Network Error'), { isAxiosError: true }),
    );
    await renderWithProviders(<WorkspaceStudyScreen />);

    expect(await screen.findByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
    expect(screen.queryByText('Không truy cập được')).toBeNull();
  });

  it('WorkspaceStudy: thành viên nhóm ACTIVE ⇒ nút tạo bộ cho nhóm và tải bộ WORKSPACE của nhóm', async () => {
    await renderWithProviders(<WorkspaceStudyScreen />);

    expect(await screen.findByLabelText('Tạo bộ học cho nhóm')).toBeOnTheScreen();
    await waitFor(() =>
      expect(mocked.list).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'workspace', workspaceId: 'ws-1' }),
        undefined,
      ),
    );
  });

  it('WorkspaceStudy: nhóm ARCHIVED ⇒ chỉ xem, không có nút tạo', async () => {
    mocked.workspaceAccess.mockResolvedValue({
      id: 'ws-1',
      myRole: 'MEMBER',
      name: 'Nhóm Toán',
      status: 'ARCHIVED',
    });
    await renderWithProviders(<WorkspaceStudyScreen />);

    expect(await screen.findByText('Học · Nhóm Toán')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Tạo bộ học cho nhóm')).toBeNull();
  });
});
