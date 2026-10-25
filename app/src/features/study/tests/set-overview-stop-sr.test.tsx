import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useToastStore } from '@/shared/ui/feedback/toast-store';

import { srService } from '../api/sr.service';
import { studyService } from '../api/study.service';
import { SetOverviewScreen } from '../screens/SetOverviewScreen';
import { makeChoiceItem, makeItem, makeSet } from './fixtures';
import { apiError, renderWithProviders } from './render-helpers';

/**
 * p4-02 app.md §3 SetOverview: menu ⋯ có "Ngừng ôn bộ này" → hộp thoại xác nhận → `DELETE /sr/enrollments/:setId`. BE idempotent nên mục hiện với
 * mọi bộ có mục (chưa có trường "đã đăng ký"); bộ rỗng không có gì để ôn thì ẩn.
 */
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
  studyService: { get: jest.fn(), items: jest.fn(), workspaceAccess: jest.fn() },
}));
jest.mock('../api/sr.service', () => ({
  ...jest.requireActual('../api/sr.service'),
  srService: { enroll: jest.fn(), unenroll: jest.fn() },
}));

const study = jest.mocked(studyService);
const sr = jest.mocked(srService);

beforeEach(() => {
  jest.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  study.get.mockResolvedValue(makeSet());
  study.items.mockResolvedValue({
    items: [makeItem({ id: 'i1', order: 1 }), makeChoiceItem({ id: 'i2', order: 2 })],
    setVersion: 3,
  });
  sr.unenroll.mockResolvedValue(undefined);
});

const openMenu = async () =>
  fireEvent.press(await screen.findByLabelText('Thêm tuỳ chọn cho bộ học'));

describe('SetOverviewScreen — "Ngừng ôn bộ này"', () => {
  it('menu ⋯ → hộp thoại nói đúng hậu quả; chưa xác nhận thì CHƯA gọi API', async () => {
    await renderWithProviders(<SetOverviewScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByText('Ngừng ôn bộ này'));

    expect(await screen.findByText('Ngừng ôn bộ này?')).toBeOnTheScreen();
    // BE chỉ ngừng đưa thẻ MỚI — câu không được hứa bộ biến mất khỏi lịch ôn.
    expect(screen.getByText(/Thẻ bạn đã học vẫn đến hạn theo lịch/)).toBeOnTheScreen();
    expect(sr.unenroll).not.toHaveBeenCalled();
  });

  it('xác nhận → DELETE đúng bộ, toast thành công, đóng hộp thoại', async () => {
    await renderWithProviders(<SetOverviewScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByText('Ngừng ôn bộ này'));
    await fireEvent.press(await screen.findByText('Ngừng ôn'));

    await waitFor(() => expect(sr.unenroll).toHaveBeenCalledWith('s1'));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.map((t) => t.message)).toContain(
        'Đã ngừng ôn bộ này.',
      ),
    );
    await waitFor(() => expect(screen.queryByText('Ngừng ôn bộ này?')).toBeNull());
  });

  it('"Huỷ" đóng hộp thoại và không gọi API', async () => {
    await renderWithProviders(<SetOverviewScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByText('Ngừng ôn bộ này'));
    await fireEvent.press(await screen.findByText('Huỷ'));

    await waitFor(() => expect(screen.queryByText('Ngừng ôn bộ này?')).toBeNull());
    expect(sr.unenroll).not.toHaveBeenCalled();
  });

  it('lỗi → hộp thoại còn nguyên để thử lại, KHÔNG toast "đã ngừng"', async () => {
    sr.unenroll.mockRejectedValue(apiError(500, 'SYS_001'));
    await renderWithProviders(<SetOverviewScreen />);
    await openMenu();
    await fireEvent.press(await screen.findByText('Ngừng ôn bộ này'));
    await fireEvent.press(await screen.findByText('Ngừng ôn'));

    await waitFor(() => expect(sr.unenroll).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Ngừng ôn bộ này?')).toBeOnTheScreen();
    expect(useToastStore.getState().toasts.map((t) => t.message)).not.toContain(
      'Đã ngừng ôn bộ này.',
    );
  });

  it('bộ chưa có mục → không có mục "Ngừng ôn bộ này" trong menu', async () => {
    study.get.mockResolvedValue(makeSet({ itemCount: 0 }));
    await renderWithProviders(<SetOverviewScreen />);
    await openMenu();

    expect(await screen.findByText('Sửa thông tin')).toBeOnTheScreen();
    expect(screen.queryByText('Ngừng ôn bộ này')).toBeNull();
  });
});
