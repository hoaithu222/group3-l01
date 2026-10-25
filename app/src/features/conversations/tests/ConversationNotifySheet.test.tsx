import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { notificationPreferencesService } from '@/core/notifications';

import { conversationsService } from '../api/conversations.service';
import { makeItem } from '../cache/apply-conversation-event.fixtures';
import { ConversationNotifySheet, currentNotifyChoice } from '../components/ConversationNotifySheet';

/**
 * p1-07 `app.md` §3 `NotifyModeSheet` ở hội thoại. Trọng tâm là bug đã sửa: "Cho tới khi bật lại" từng gửi `INHERIT`
 * (tức BỎ tắt tiếng) vì `mutedUntil: null` bị hiểu là "bỏ tắt tiếng". BE: `null` = bỏ HẠN, tắt vô thời hạn là `MUTED`.
 */

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const updateMeSpy = jest.spyOn(conversationsService, 'updateMe');
const accountSpy = jest.spyOn(notificationPreferencesService, 'getAccount');
const workspaceSpy = jest.spyOn(notificationPreferencesService, 'getWorkspace');

async function renderSheet(conversation = makeItem({ id: 'cv-1', kind: 'GROUP' })) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity, retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  await render(<ConversationNotifySheet conversation={conversation} visible onClose={jest.fn()} />, {
    wrapper: Wrapper,
  });
}

beforeEach(() => {
  updateMeSpy.mockReset().mockResolvedValue({} as never);
  accountSpy.mockReset().mockResolvedValue({
    channelMode: 'MENTIONS_AND_THREADS',
    directMode: 'ALL',
    dndUntil: null,
    groupMode: 'ALL',
    isDefault: { channelMode: true, directMode: true, groupMode: true, lockScreenPreview: true, sound: true },
    lockScreenPreview: 'HIDDEN',
    sound: true,
  });
  workspaceSpy.mockReset().mockResolvedValue({
    channelMode: 'INHERIT',
    effective: { channelMode: 'MENTIONS_AND_THREADS', groupMode: 'MENTIONS_AND_THREADS' },
    groupMode: 'INHERIT',
    workspaceId: 'ws-1',
  });
});

describe('currentNotifyChoice', () => {
  it('tin cờ `muted` tổng hợp của server: hết hạn tắt tiếng thì notifyMode còn MUTED vẫn KHÔNG coi là đang tắt', () => {
    expect(currentNotifyChoice({ muted: true, notifyMode: 'MUTED' })).toBe('MUTED');
    expect(currentNotifyChoice({ muted: false, notifyMode: 'MUTED' })).toBe('INHERIT');
    expect(currentNotifyChoice({ muted: false, notifyMode: 'MENTIONS' })).toBe('MENTIONS');
  });
});

describe('ConversationNotifySheet', () => {
  it('"Theo mặc định" hiện giá trị kế thừa THỰC TẾ của nhóm làm việc (Chỉ nhắc tên & luồng)', async () => {
    await renderSheet();
    expect(await screen.findByText('Theo mặc định (Chỉ nhắc tên & luồng)')).toBeOnTheScreen();
  });

  it('"Cho tới khi bật lại" → { MUTED, mutedUntil: null } — KHÔNG phải INHERIT', async () => {
    await renderSheet();
    await userEvent.press(screen.getByText('Tắt tiếng'));
    await userEvent.press(screen.getByText('Cho tới khi bật lại'));

    await waitFor(() => expect(updateMeSpy).toHaveBeenCalledWith('cv-1', { mutedUntil: null, notifyMode: 'MUTED' }));
  });

  it('tắt 1 giờ → MUTED + mutedUntil ISO tương lai', async () => {
    await renderSheet();
    await userEvent.press(screen.getByText('Tắt tiếng'));
    await userEvent.press(screen.getByText('1 giờ'));

    await waitFor(() => expect(updateMeSpy).toHaveBeenCalledTimes(1));
    const payload = updateMeSpy.mock.calls[0]?.[1] as { mutedUntil: string; notifyMode: string };
    expect(payload.notifyMode).toBe('MUTED');
    expect(new Date(payload.mutedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('bỏ tắt tiếng (chọn "Theo mặc định") → INHERIT + mutedUntil null để xoá hạn cũ', async () => {
    await renderSheet(makeItem({ id: 'cv-1', kind: 'GROUP', muted: true, notifyMode: 'MUTED' }));
    await userEvent.press(await screen.findByText(/^Theo mặc định/));

    await waitFor(() => expect(updateMeSpy).toHaveBeenCalledWith('cv-1', { mutedUntil: null, notifyMode: 'INHERIT' }));
  });

  it('tin 1-1: không có "Chỉ nhắc tên & luồng"; kế thừa directMode của TÀI KHOẢN', async () => {
    await renderSheet(makeItem({ id: 'cv-2', kind: 'DIRECT', workspaceId: null }));
    expect(screen.queryByText('Chỉ nhắc tên & luồng')).toBeNull();
    expect(await screen.findByText('Theo mặc định (Mọi tin)')).toBeOnTheScreen();
    expect(workspaceSpy).not.toHaveBeenCalled();
  });
});
