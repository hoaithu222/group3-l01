import { render, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ChannelDetail } from '../api';
import { ChannelHeader } from '../components/ChannelHeader';

/**
 * Thanh tiêu đề kênh chỉ có HAI khe phải (bản vẽ `AppBar`): icon Tìm + menu "⋯". Bản cũ nhét 4 nút. Test HÀNH VI — icon nào
 * còn ngoài, mục nào nằm trong menu, chạm thì đẩy đúng route; không đo được bề rộng (Jest không có style).
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));

const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const channel = { id: 'ch-1', name: 'Chung', description: null, type: 'TEXT' } as unknown as ChannelDetail;

beforeEach(() => jest.clearAllMocks());

describe('ChannelHeader', () => {
  it('chỉ còn HAI nút bên phải: Tìm và menu "⋯" — Ghim/Thành viên/Thông tin không còn là icon riêng', async () => {
    const screen = await render(<ChannelHeader channel={channel} wsId="ws-1" />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: 'Tìm trong kênh' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm tuỳ chọn của kênh' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Tin đã ghim' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thành viên kênh' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thông tin kênh' })).toBeNull();
  });

  it('bấm Tìm → đẩy route tìm kiếm của kênh', async () => {
    const screen = await render(<ChannelHeader channel={channel} wsId="ws-1" />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: 'Tìm trong kênh' }));

    expect(router.push).toHaveBeenCalledWith({
      params: { chId: 'ch-1', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/channels/[chId]/search',
    });
  });

  it('menu "⋯" liệt kê Tin đã ghim · Thành viên · Thông tin kênh và mỗi mục mở đúng route', async () => {
    const screen = await render(<ChannelHeader channel={channel} wsId="ws-1" />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: 'Thêm tuỳ chọn của kênh' }));
    expect(await screen.findByText('Tin đã ghim')).toBeOnTheScreen();
    expect(screen.getByText('Thành viên')).toBeOnTheScreen();
    expect(screen.getByText('Thông tin kênh')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Thành viên'));

    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        params: { chId: 'ch-1', wsId: 'ws-1' },
        pathname: '/workspaces/[wsId]/channels/[chId]/members',
      }),
    );
  });
});
