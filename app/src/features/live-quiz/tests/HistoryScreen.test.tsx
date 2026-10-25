import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { liveQuizKeys } from '../api/live-quiz.keys';
import { liveQuizService } from '../api/live-quiz.service';
import type { LiveQuizHistoryItemDto, LiveQuizHistoryPage } from '../api/live-quiz.types';
import { HistoryScreen } from '../screens/HistoryScreen';

/**
 * Lịch sử thi trực tiếp: mỗi lượt là MỘT nút mở kết quả (`Card onPress`), điểm đi qua `formatNumber`, hạng có nhãn đọc
 * được ("hạng 3", không phải "#3"), và lỗi làm mới KHÔNG được xoá danh sách đã tải.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const historySpy = jest.spyOn(liveQuizService, 'history');

function item(overrides: Partial<LiveQuizHistoryItemDto> = {}): LiveQuizHistoryItemDto {
  return {
    answered: 10,
    correct: 8,
    createdAt: '2026-05-01T08:00:00.000Z',
    endedAt: '2026-05-01T08:20:00.000Z',
    rank: 3,
    score: 1250,
    sessionId: 's1',
    setId: 'set-1',
    setTitle: 'Toán lớp 9',
    total: 10,
    ...overrides,
  };
}

function page(
  items: LiveQuizHistoryItemDto[],
  nextCursor: string | null = null,
): LiveQuizHistoryPage {
  return { items, meta: { hasMore: nextCursor !== null, limit: 20, nextCursor } };
}

let queryClient: QueryClient;

function tree(): ReactElement {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>
        <HistoryScreen />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
});

it('mỗi lượt thi là MỘT nút; bấm ⇒ mở kết quả của đúng phiên đó', async () => {
  historySpy.mockResolvedValue(page([item(), item({ sessionId: 's2', setTitle: 'Văn lớp 9' })]));
  await render(tree());

  const first = await screen.findByRole('button', { name: 'Toán lớp 9' });
  expect(screen.getByRole('button', { name: 'Văn lớp 9' })).toBeOnTheScreen();

  await fireEvent.press(first);

  expect(router.push).toHaveBeenCalledWith({
    params: { sessionId: 's1' },
    pathname: '/study/live/[sessionId]/results',
  });
});

it('điểm có dấu chấm ngăn nghìn; nhãn trợ năng đọc "hạng 3" (huy chương chỉ là hình, ẩn khỏi trình đọc)', async () => {
  historySpy.mockResolvedValue(page([item()]));
  await render(tree());

  expect(await screen.findByText('1.250 điểm')).toBeOnTheScreen();
  // Ngày lấy từ `endedAt` theo múi giờ máy nên chỉ khoá phần số câu.
  expect(screen.getByText(/^Đúng 8\/10 câu/)).toBeOnTheScreen();
  expect(screen.getByLabelText('Hạng 3, 1.250 điểm, đúng 8 trên 10 câu')).toBeOnTheScreen();
});

it('chưa có lượt nào ⇒ trạng thái rỗng, "Nhập mã PIN" đi tới màn vào phòng', async () => {
  historySpy.mockResolvedValue(page([]));
  await render(tree());

  expect(await screen.findByText('Chưa có lượt thi nào')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Nhập mã PIN' }));

  expect(router.push).toHaveBeenCalledWith({ pathname: '/study/live/join' });
});

it('tải lỗi lúc chưa có gì ⇒ báo lỗi kèm "Thử lại", bấm là gọi lại API', async () => {
  historySpy.mockRejectedValueOnce(new Error('boom'));
  await render(tree());

  expect(await screen.findByText('Không tải được lịch sử')).toBeOnTheScreen();
  // ⛔ Không lộ `Error.message` thô ra màn hình.
  expect(screen.queryByText(/boom/)).toBeNull();

  historySpy.mockResolvedValueOnce(page([item()]));
  await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

  expect(await screen.findByRole('button', { name: 'Toán lớp 9' })).toBeOnTheScreen();
  expect(historySpy).toHaveBeenCalledTimes(2);
});

it('mất mạng lúc chưa có gì ⇒ trạng thái "ngoại tuyến" (không phải lỗi máy chủ), "Thử lại" gọi lại API', async () => {
  historySpy.mockRejectedValueOnce(
    Object.assign(new Error('Network Error'), { isAxiosError: true }),
  );
  await render(tree());

  expect(await screen.findByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
  expect(screen.queryByText('Không tải được lịch sử')).toBeNull();

  historySpy.mockResolvedValueOnce(page([item()]));
  await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

  expect(await screen.findByRole('button', { name: 'Toán lớp 9' })).toBeOnTheScreen();
});

it('làm mới hỏng nhưng đã có danh sách ⇒ GIỮ danh sách, không thay bằng màn lỗi', async () => {
  historySpy.mockResolvedValueOnce(page([item()]));
  await render(tree());
  await screen.findByRole('button', { name: 'Toán lớp 9' });

  historySpy.mockRejectedValueOnce(new Error('mất mạng'));
  await act(async () => {
    await queryClient.refetchQueries({ queryKey: liveQuizKeys.history() }).catch(() => undefined);
  });

  await waitFor(() => expect(historySpy).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('button', { name: 'Toán lớp 9' })).toBeOnTheScreen();
  expect(screen.queryByText('Không tải được lịch sử')).toBeNull();
});

it('còn trang sau ⇒ có "Tải thêm", bấm là xin trang kế theo con trỏ', async () => {
  historySpy.mockResolvedValueOnce(page([item()], 'cursor-2'));
  await render(tree());
  await screen.findByRole('button', { name: 'Toán lớp 9' });

  historySpy.mockResolvedValueOnce(page([item({ sessionId: 's9', setTitle: 'Sử lớp 9' })]));
  await fireEvent.press(screen.getByRole('button', { name: 'Tải thêm' }));

  expect(await screen.findByRole('button', { name: 'Sử lớp 9' })).toBeOnTheScreen();
  expect(historySpy).toHaveBeenLastCalledWith('cursor-2');
  expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();
});
