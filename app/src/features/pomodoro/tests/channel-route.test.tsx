import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ChannelChatRoute from '../../../../app/(app)/workspaces/[wsId]/channels/[chId]/index';

/**
 * p5-02 app.md §1: KHÔNG thêm route — kênh `POMODORO` mở trong route kênh hiện có: TEXT → chat, VOICE → preview phòng thoại, POMODORO → `PomodoroRoomScreen`
 * (bọc `FeatureRouteGuard flag="pomodoro"`, kèm `ChannelHeader`). Route chỉ lắp ráp — không import chéo giữa `channels`/`calls`/`pomodoro`.
 */

const mockChannel: { current: { data?: { id: string; type: string } } } = { current: {} };
const mockGuardFlags: string[] = [];

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ chId: 'ch1', wsId: 'ws1' }) }));
jest.mock('@/features/channels/queries/channels.queries', () => ({ useChannel: () => mockChannel.current }));
jest.mock('@/features/channels/components/ChannelHeader', () => {
  const { Text } = jest.requireActual('react-native');
  return { ChannelHeader: () => <Text>Đầu trang kênh</Text> };
});
jest.mock('@/features/channels/screens/ChannelChatScreen', () => {
  const { Text } = jest.requireActual('react-native');
  return { ChannelChatScreen: () => <Text>Màn chat</Text> };
});
jest.mock('@/features/calls', () => {
  const { Text } = jest.requireActual('react-native');
  return { VoiceRoomPreviewScreen: () => <Text>Preview phòng thoại</Text> };
});
jest.mock('@/shell/voice-room/RoomChatPanel', () => ({ RoomChatPanel: () => null }));
jest.mock('@/shell/capabilities', () => ({
  FeatureRouteGuard: ({ children, flag }: { children: ReactNode; flag: string }) => {
    mockGuardFlags.push(flag);
    return <>{children}</>;
  },
}));
jest.mock('@/features/pomodoro', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    PomodoroRoomScreen: (props: { channelId: string; header: ReactNode; wsId: string }) => (
      <>
        <Text>{`Pomodoro ${props.channelId} ${props.wsId}`}</Text>
        {props.header}
      </>
    ),
  };
});

beforeEach(() => {
  mockGuardFlags.length = 0;
});

it('kênh POMODORO ⇒ PomodoroRoomScreen với channelId/wsId, ChannelHeader, bọc cờ `pomodoro`', async () => {
  mockChannel.current = { data: { id: 'ch1', type: 'POMODORO' } };
  await render(<ChannelChatRoute />);

  expect(screen.getByText('Pomodoro ch1 ws1')).toBeOnTheScreen();
  expect(screen.getByText('Đầu trang kênh')).toBeOnTheScreen();
  expect(mockGuardFlags).toEqual(['pomodoro']);
});

it('kênh TEXT vẫn vào màn chat; VOICE vẫn vào preview phòng thoại (không bị POMODORO ảnh hưởng)', async () => {
  mockChannel.current = { data: { id: 'ch1', type: 'TEXT' } };
  const text = await render(<ChannelChatRoute />);
  expect(screen.getByText('Màn chat')).toBeOnTheScreen();
  expect(mockGuardFlags).toEqual([]);
  await text.unmount();

  mockChannel.current = { data: { id: 'ch1', type: 'VOICE' } };
  await render(<ChannelChatRoute />);
  expect(screen.getByText('Preview phòng thoại')).toBeOnTheScreen();
  expect(mockGuardFlags).toEqual([]);
});

it('đang tải chi tiết kênh (chưa biết loại) ⇒ để màn chat vẽ khung chờ như cũ, không vào Pomodoro', async () => {
  mockChannel.current = {};
  await render(<ChannelChatRoute />);
  expect(screen.getByText('Màn chat')).toBeOnTheScreen();
  expect(screen.queryByText(/^Pomodoro/)).toBeNull();
});
