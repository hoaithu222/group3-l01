import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { reviewsService } from '../api/reviews.service';
import { useBoard } from '../queries/boards.queries';
import { ReviewSettingsScreen } from '../screens/ReviewSettingsScreen';
import { apiError, makeReviewConfig, RUBRIC_4_3_3 } from './review-fixtures';

/**
 * p4-05 app.md §8 "ReviewSettings": MEMBER chỉ đọc; `RubricBuilder` thêm / xoá / Lên-Xuống; `RES_003` → banner, GIỮ chữ đang sửa, tải lại
 * `version`; `REVIEW_004` → lỗi ngay dưới danh sách tiêu chí; payload giữ `id` tiêu chí cũ, tiêu chí mới không có `id`.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ boardId: 'b1', wsId: 'w1' }) }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/reviews.service', () => ({ reviewsService: { getConfig: jest.fn(), putConfig: jest.fn() } }));
jest.mock('../queries/boards.queries', () => ({ useBoard: jest.fn() }));

const getConfig = reviewsService.getConfig as jest.MockedFunction<typeof reviewsService.getConfig>;
const putConfig = reviewsService.putConfig as jest.MockedFunction<typeof reviewsService.putConfig>;
const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };
const CONFIG = makeReviewConfig({ rubric: RUBRIC_4_3_3.slice(0, 2) });

function mockBoard(myPermissions: string[]) {
  (useBoard as jest.Mock).mockReturnValue({
    data: { archivedAt: null, columns: [], id: 'b1', myPermissions, name: 'Đồ án', version: 3 },
    error: null,
    isPending: false,
    refetch: jest.fn(),
  });
}

async function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  const screen = await render(<ReviewSettingsScreen />, { wrapper: Wrapper });
  await screen.findByText('Tiêu chí đánh giá');
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  getConfig.mockResolvedValue(CONFIG);
});

describe('ReviewSettingsScreen', () => {
  it('MEMBER: bản chỉ đọc — trạng thái, tiêu chí, tổng điểm; không có ô sửa hay nút Lưu', async () => {
    mockBoard(['TASK_CREATE']);
    const screen = await renderScreen();

    expect(screen.getByText('Đang bật')).toBeOnTheScreen();
    expect(screen.getByText('Nội dung')).toBeOnTheScreen();
    expect(screen.getByText('7')).toBeOnTheScreen();
    expect(screen.queryByText('Lưu cấu hình')).toBeNull();
    expect(screen.queryByLabelText('Tên tiêu chí 1')).toBeNull();
  });

  it('RubricBuilder: thêm / Lên-Xuống / xoá; Lưu gửi id cũ, tiêu chí mới không id, expectedVersion = version', async () => {
    mockBoard(['BOARD_EDIT']);
    putConfig.mockResolvedValue(CONFIG);
    const screen = await renderScreen();
    const user = userEvent.setup();

    expect(screen.getByText('Nhóm có 4 người chấm được (không tính người làm thẻ và khách).')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu cấu hình' })).toBeDisabled();

    await user.press(screen.getByText('Thêm tiêu chí'));
    await user.type(screen.getByLabelText('Tên tiêu chí 3'), 'Sáng tạo');
    expect(screen.getByText('Tổng điểm tối đa: 17')).toBeOnTheScreen();

    await user.press(screen.getByLabelText('Đưa tiêu chí 1 xuống'));
    expect(screen.getByLabelText('Tên tiêu chí 1')).toHaveDisplayValue('Trình bày');
    await user.press(screen.getByLabelText('Xoá tiêu chí 2'));
    expect(screen.queryByLabelText('Tên tiêu chí 3')).toBeNull();

    await user.press(screen.getByText('Lưu cấu hình'));
    await waitFor(() => expect(putConfig).toHaveBeenCalledTimes(1));
    expect(putConfig).toHaveBeenCalledWith('b1', {
      autoCompleteOnApproval: false,
      enabled: true,
      expectedVersion: 3,
      requiredReviews: 2,
      rubric: [
        { id: 'r_bbbbbb', label: 'Trình bày', maxScore: 3 },
        { label: 'Sáng tạo', maxScore: 10 },
      ],
    });
  });

  it('lỗi kiểm ở client (tên trống) → câu lỗi, không gọi API', async () => {
    mockBoard(['BOARD_EDIT']);
    const screen = await renderScreen();
    const user = userEvent.setup();

    await user.press(screen.getByText('Thêm tiêu chí'));
    await user.press(screen.getByText('Lưu cấu hình'));

    expect(screen.getByText('Tên tiêu chí không được để trống')).toBeOnTheScreen();
    expect(putConfig).not.toHaveBeenCalled();
  });

  it('RES_003 → banner "Cấu hình đã thay đổi", tải lại cấu hình, GIỮ chữ đang sửa', async () => {
    mockBoard(['BOARD_EDIT']);
    putConfig.mockRejectedValue(apiError('RES_003', 409, { currentVersion: 4 }));
    const screen = await renderScreen();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Tên tiêu chí 1'), ' mới');
    await user.press(screen.getByText('Lưu cấu hình'));

    expect(await screen.findByText('Cấu hình đã thay đổi')).toBeOnTheScreen();
    await waitFor(() => expect(getConfig).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Tên tiêu chí 1')).toHaveDisplayValue('Nội dung mới');
  });

  it('REVIEW_004 { rubric } → lỗi hiện dưới danh sách tiêu chí', async () => {
    mockBoard(['BOARD_EDIT']);
    putConfig.mockRejectedValue(apiError('REVIEW_004', 400, { rubric: ['Tiêu chí không còn trong cấu hình hiện tại'] }));
    const screen = await renderScreen();
    const user = userEvent.setup();

    await user.press(screen.getByLabelText('Xoá tiêu chí 2'));
    await user.press(screen.getByText('Lưu cấu hình'));

    expect(await screen.findByText('Tiêu chí không còn trong cấu hình hiện tại')).toBeOnTheScreen();
  });
});
