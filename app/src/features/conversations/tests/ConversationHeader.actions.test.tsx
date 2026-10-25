import { render, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ConversationDetail } from '../api/conversations.types';
import { ConversationHeader } from '../components/ConversationHeader';

/**
 * Thanh tiêu đề hội thoại: nút gọi (slot) + menu "⋯". Bản cũ có Tìm · Ghim · "…" (thực ra chỉ mở Thông tin) riêng lẻ. Test HÀNH
 * VI: mục nào có trong menu (nhóm có "Thành viên", 1-1 thì không), chạm đẩy đúng route, và các nút icon cũ đã gộp.
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
let mockConnection = 'connected';
let mockPresence = { state: 'OFFLINE', updatedAt: 0 };
jest.mock('@/core/socket', () => ({
  useConnectionState: () => mockConnection,
  usePresence: () => mockPresence,
}));
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: () => ({ isTablet: false }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

function conversation(kind: 'DIRECT' | 'GROUP'): ConversationDetail {
  return {
    id: 'c-1',
    kind,
    title: kind === 'GROUP' ? 'Nhóm học' : null,
    memberCount: kind === 'GROUP' ? 5 : 2,
    peer: kind === 'DIRECT' ? { name: 'An', presence: 'ONLINE', userId: 'u-2' } : null,
    myPermissions: { canCall: true },
  } as unknown as ConversationDetail;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConnection = 'connected';
  mockPresence = { state: 'OFFLINE', updatedAt: 0 };
});

describe('ConversationHeader', () => {
  it('không còn icon Tìm / Ghim / Thông tin riêng lẻ — chỉ có menu "⋯"', async () => {
    const screen = await render(<ConversationHeader conversation={conversation('GROUP')} />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Thêm tuỳ chọn của cuộc trò chuyện' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Tìm trong cuộc trò chuyện' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tin đã ghim' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thông tin cuộc trò chuyện' })).toBeNull();
  });

  it('nhóm: menu có Tìm · Tin đã ghim · Thành viên · Thông tin; chạm "Thành viên" mở màn thành viên', async () => {
    const screen = await render(<ConversationHeader conversation={conversation('GROUP')} />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: 'Thêm tuỳ chọn của cuộc trò chuyện' }));
    expect(await screen.findByText('Tìm trong cuộc trò chuyện')).toBeOnTheScreen();
    expect(screen.getByText('Tin đã ghim')).toBeOnTheScreen();
    expect(screen.getByText('Thông tin')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Thành viên'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        params: { conversationId: 'c-1' },
        pathname: '/messages/[conversationId]/members',
      }),
    );
  });

  it('1-1: menu KHÔNG có "Thành viên" (chỉ hai người) nhưng vẫn có Tìm · Ghim · Thông tin', async () => {
    const screen = await render(<ConversationHeader conversation={conversation('DIRECT')} />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: 'Thêm tuỳ chọn của cuộc trò chuyện' }));

    expect(await screen.findByText('Tìm trong cuộc trò chuyện')).toBeOnTheScreen();
    expect(screen.getByText('Tin đã ghim')).toBeOnTheScreen();
    expect(screen.getByText('Thông tin')).toBeOnTheScreen();
    expect(screen.queryByText('Thành viên')).toBeNull();
  });

  it('chạm "Thông tin" trong menu mở màn thông tin hội thoại', async () => {
    const screen = await render(<ConversationHeader conversation={conversation('DIRECT')} />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: 'Thêm tuỳ chọn của cuộc trò chuyện' }));
    await userEvent.press(await screen.findByText('Thông tin'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        params: { conversationId: 'c-1' },
        pathname: '/messages/[conversationId]/info',
      }),
    );
  });
});

describe('ConversationHeader — hiện diện của người kia', () => {
  it('ưu tiên dữ liệu SỐNG: ảnh chụp ghi ONLINE nhưng socket vừa báo "vắng mặt" ⇒ ghi "Vắng mặt"', async () => {
    mockPresence = { state: 'IDLE', updatedAt: 1 };
    const screen = await render(<ConversationHeader conversation={conversation('DIRECT')} />, { wrapper: Wrapper });

    expect(screen.getByText('Vắng mặt')).toBeOnTheScreen();
    expect(screen.queryByText('Đang hoạt động')).toBeNull();
  });

  it('chưa có dữ liệu sống ⇒ dùng ảnh chụp lúc tải chi tiết', async () => {
    const screen = await render(<ConversationHeader conversation={conversation('DIRECT')} />, { wrapper: Wrapper });

    expect(screen.getByText('Đang hoạt động')).toBeOnTheScreen();
  });

  it('CHÍNH MÌNH mất kết nối ⇒ không ghi trạng thái người kia (tránh đọc nhầm "Ngoại tuyến" là của mình)', async () => {
    mockConnection = 'offline';
    mockPresence = { state: 'OFFLINE', updatedAt: 1 };
    const screen = await render(<ConversationHeader conversation={conversation('DIRECT')} />, { wrapper: Wrapper });

    expect(screen.queryByText('Ngoại tuyến')).toBeNull();
    expect(screen.queryByText('Đang hoạt động')).toBeNull();
  });

  it('nhóm luôn ghi số thành viên, bất kể kết nối', async () => {
    mockConnection = 'connecting';
    const screen = await render(<ConversationHeader conversation={conversation('GROUP')} />, { wrapper: Wrapper });

    expect(screen.getByText('5 thành viên')).toBeOnTheScreen();
  });
});
