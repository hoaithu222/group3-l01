import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroHistoryItem, PomodoroHistoryPage } from '../api/pomodoro.types';
import { PomodoroHistoryScreen } from '../screens/PomodoroHistoryScreen';
import { CycleDots } from '../components/CycleDots';
import { makeSnapshot , apiErrorLike } from './fixtures';
import { makeQueryClient, renderWithProviders } from './helpers';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));

/**
 * Lịch sử học của tôi (P1): mỗi lượt là MỘT nút mở lại kênh, số liệu dạng chữ (không toLocaleString), nói rõ "không dùng để chấm điểm", lỗi làm mới KHÔNG
 * xoá danh sách đã tải. Kèm `CycleDots`: chấm + chữ "2/4", đủ vòng thì "4/4" khi nghỉ dài.
 */

const historySpy = jest.spyOn(pomodoroService, 'history');

function item(over: Partial<PomodoroHistoryItem> = {}): PomodoroHistoryItem {
  return {
    channelId: 'ch1',
    channelName: 'Phòng học đêm',
    completedFocusCycles: 4,
    config: makeSnapshot().config,
    cyclesAttended: 3,
    endReason: 'HOST_ENDED',
    endedAt: '2026-09-24T12:00:00.000Z',
    goal: 'Xong chương 3',
    interruptions: 1,
    joinedAt: '2026-09-24T10:00:00.000Z',
    leftAt: '2026-09-24T12:00:00.000Z',
    presentSeconds: 85 * 60,
    sessionId: 's1',
    skippedFocusCycles: 0,
    startedAt: '2026-09-24T10:00:00.000Z',
    status: 'ENDED',
    workspaceId: 'ws1',
    ...over,
  };
}

const page = (items: PomodoroHistoryItem[], nextCursor: string | null = null): PomodoroHistoryPage => ({
  items,
  meta: { hasMore: nextCursor !== null, limit: 20, nextCursor },
});

beforeEach(() => jest.clearAllMocks());

it('mỗi lượt là MỘT nút: tên phòng, có mặt/vòng/gián đoạn dạng chữ, mục tiêu; bấm ⇒ mở lại kênh', async () => {
  historySpy.mockResolvedValue(page([item()]));
  await renderWithProviders(<PomodoroHistoryScreen />, makeQueryClient());

  const row = await screen.findByRole('button', { name: /Phòng học đêm/ });
  expect(screen.getByText('Có mặt 1 giờ 25 phút · 3 vòng tập trung · 1 lần gián đoạn')).toBeOnTheScreen();
  expect(screen.getByText('Mục tiêu: Xong chương 3')).toBeOnTheScreen();
  expect(screen.getByText('Nhật ký cá nhân, không dùng để chấm điểm.')).toBeOnTheScreen();

  await fireEvent.press(row);
  expect(router.push).toHaveBeenCalledWith({ params: { chId: 'ch1', wsId: 'ws1' }, pathname: '/workspaces/[wsId]/channels/[chId]' });
});

it('chưa có phiên nào ⇒ trạng thái rỗng có lời hướng dẫn', async () => {
  historySpy.mockResolvedValue(page([]));
  await renderWithProviders(<PomodoroHistoryScreen />, makeQueryClient());
  expect(await screen.findByText('Chưa có phiên nào')).toBeOnTheScreen();
});

it('lỗi tải lần đầu ⇒ báo lỗi + Thử lại', async () => {
  historySpy.mockRejectedValue(apiErrorLike(500, 'SYS_500'));
  await renderWithProviders(<PomodoroHistoryScreen />, makeQueryClient());
  expect(await screen.findByText('Không tải được lịch sử')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Thử lại' })).toBeOnTheScreen();
});

it('còn trang sau ⇒ "Tải thêm" gọi trang kế bằng cursor', async () => {
  historySpy.mockResolvedValueOnce(page([item()], 'cur1')).mockResolvedValueOnce(page([item({ channelName: 'Phòng sáng', sessionId: 's2' })]));
  await renderWithProviders(<PomodoroHistoryScreen />, makeQueryClient());

  await fireEvent.press(await screen.findByRole('button', { name: 'Tải thêm' }));

  expect(await screen.findByRole('button', { name: /Phòng sáng/ })).toBeOnTheScreen();
  expect(historySpy).toHaveBeenLastCalledWith('cur1');
});

describe('CycleDots', () => {
  it('hiện "2/4" bằng chữ, tổng số vòng đã xong và số vòng bỏ qua', async () => {
    await renderWithProviders(<CycleDots completed={2} phase="FOCUS" skipped={1} total={4} />);
    expect(screen.getByText('2/4')).toBeOnTheScreen();
    expect(screen.getByText('Đã xong 2 vòng · bỏ qua 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Vòng 2 trên 4. Đã xong 2 vòng · bỏ qua 1')).toBeOnTheScreen();
  });

  it('đủ vòng thì nghỉ dài hiện 4/4; sang vòng mới đếm lại từ 0', async () => {
    const view = await renderWithProviders(<CycleDots completed={4} phase="LONG_BREAK" skipped={0} total={4} />);
    expect(screen.getByText('4/4')).toBeOnTheScreen();
    await view.rerender(<CycleDots completed={4} phase="FOCUS" skipped={0} total={4} />);
    expect(screen.getByText('0/4')).toBeOnTheScreen();
  });
});
