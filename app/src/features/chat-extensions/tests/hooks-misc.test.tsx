import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { ListItemDefaultsProvider } from '@/shared/ui/list';
import { ProfileRowsSlot, resetProfileRows } from '@/shared/profile';

import { scheduledKeys } from '../api/chat-extensions.keys';
import { scheduledMessageService } from '../api/scheduled-message.service';
import { useChatExtLimits, useChatSubFeatures } from '../hooks/useChatSubFeatures';
import { useScheduledCount, useScheduledSocket } from '../hooks/useScheduledMessages';
import { cursorPage, makeQueryClient, makeScheduled, renderWithProviders } from './fixtures';
import '../register-profile';

/**
 * Cờ phụ + giới hạn từ capabilities (DU-05), số đếm "tin đã hẹn", socket `scheduled-message:updated`, và hai hàng lối vào ở màn Tôi (đăng ký qua khe `@/shared/profile`).
 * `useFeature`/`useCapabilities` được thay bằng bản đọc từ `mockCaps` để đổi cờ giữa các ca.
 */
const mockCaps: { flags: Record<string, boolean | undefined>; limits?: Record<string, unknown> } = { flags: {} };
const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: { limits: mockCaps.limits } }),
  useFeature: (flag: string) => mockCaps.flags[flag],
}));
jest.mock('@/core/socket', () => ({
  onRoomResync: () => () => undefined,
  useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));
jest.mock('../api/scheduled-message.service', () => ({ scheduledMessageService: { listMine: jest.fn() } }));

const listMine = jest.mocked(scheduledMessageService.listMine);
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers.clear();
  mockCaps.flags = { messageReminders: true, messageToTask: true, polls: true, scheduledMessages: true };
  mockCaps.limits = undefined;
  queryClient = makeQueryClient();
  listMine.mockResolvedValue(cursorPage([makeScheduled(), makeScheduled({ id: 's-2' })]));
});

describe('useChatSubFeatures / useChatExtLimits', () => {
  it('cờ BẬT → true; TẮT hoặc chưa biết (undefined, BE cũ chưa có cờ) → false — an toàn hơn hiện nhầm', async () => {
    mockCaps.flags = { messageReminders: true, polls: false };
    const { result } = await renderHook(() => useChatSubFeatures(), { wrapper });

    expect(result.current).toEqual({
      messageReminders: true,
      messageToResource: false,
      messageToTask: false,
      polls: false,
      scheduledMessages: false,
    });
  });

  it('giới hạn lấy từ capabilities, thiếu thì mặc định', async () => {
    mockCaps.limits = { poll: { optionsMax: 4 }, scheduledMessage: { sendAtMaxDays: 14 } };
    const { result } = await renderHook(() => useChatExtLimits(), { wrapper });

    expect(result.current.poll.optionsMax).toBe(4);
    expect(result.current.scheduled.sendAtMaxDays).toBe(14);
    expect(result.current.reminder.remindAtMaxDays).toBe(365);
  });
});

describe('useScheduledCount', () => {
  it('đếm tin ĐANG CHỜ của phòng (lọc theo phòng)', async () => {
    const { result } = await renderHook(() => useScheduledCount({ scopeId: 'ch-1', scopeType: 'CHANNEL' }, true), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ count: 2, more: false }));
    expect(listMine).toHaveBeenCalledWith({ limit: 50, scopeId: 'ch-1', scopeType: 'CHANNEL', status: 'PENDING' });
  });

  it('còn trang sau (hasMore) → more=true để banner hiện "50+"', async () => {
    listMine.mockResolvedValue(cursorPage([makeScheduled()], { hasMore: true, nextCursor: 'c2' }));
    const { result } = await renderHook(() => useScheduledCount({ scopeId: 'ch-1', scopeType: 'CHANNEL' }, true), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ count: 1, more: true }));
  });

  it('tắt (cờ tắt) → KHÔNG gọi API', async () => {
    await renderHook(() => useScheduledCount({ scopeId: 'ch-1', scopeType: 'CHANNEL' }, false), { wrapper });
    expect(listMine).not.toHaveBeenCalled();
  });
});

describe('useScheduledSocket', () => {
  it('scheduled-message:updated → làm mới MỌI danh sách/số đếm tin hẹn giờ', async () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useScheduledSocket(), { wrapper });

    await act(async () => mockHandlers.get('scheduled-message:updated')?.({ id: 's-1', status: 'SENT' }));

    expect(spy).toHaveBeenCalledWith({ queryKey: scheduledKeys.all });
  });
});

describe('hai hàng lối vào ở màn Tôi (khe @/shared/profile)', () => {
  const renderRows = () =>
    renderWithProviders(
      <ListItemDefaultsProvider emphasis="title">
        <ProfileRowsSlot />
      </ListItemDefaultsProvider>,
    );

  afterAll(() => resetProfileRows());

  it('cờ bật → "Tin đã hẹn" và "Nhắc lại của tôi"; chạm điều hướng đúng route trong ngăn xếp me/', async () => {
    await renderRows();

    await fireEvent.press(screen.getByText('Tin đã hẹn'));
    await fireEvent.press(screen.getByText('Nhắc lại của tôi'));

    expect(router.push).toHaveBeenNthCalledWith(1, '/me/scheduled-messages');
    expect(router.push).toHaveBeenNthCalledWith(2, '/me/reminders');
  });

  it('DU-05: tắt cờ nào thì hàng đó biến mất', async () => {
    mockCaps.flags = { messageReminders: false, scheduledMessages: true };
    await renderRows();

    expect(screen.getByText('Tin đã hẹn')).toBeOnTheScreen();
    expect(screen.queryByText('Nhắc lại của tôi')).toBeNull();
  });
});
