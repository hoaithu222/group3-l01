import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Keyboard } from 'react-native';

import { WorkspaceSearchScreen } from '../screens/WorkspaceSearchScreen';
import { useWorkspaceSearchStore } from '../store/workspace-search.store';
import {
  filePage,
  makeFileHit,
  makeMessageHit,
  messagePage,
  renderWithProviders,
} from './fixtures';
import { mockedSearch, resetScreenMocks, typeQuery } from './screen-harness';

/**
 * Mở kết quả TIN (app.md p5-04 §4/§7): chat `?m=`, luồng (kể cả tệp nằm trong reply), hội thoại · bàn phím đóng TRƯỚC khi rời màn.
 * Tệp/kênh/người/cuộc họp: `.results.test.tsx`; tìm gần đây: `.recents.test.tsx`; máy tính bảng: `.tablet.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shell/capabilities', () => ({
  FeatureOffScreen: () => null,
  useCapabilities: () => ({ data: undefined }),
  useFeature: jest.fn(() => true),
}));
jest.mock('@/shared/theme', () => ({
  ...jest.requireActual('@/shared/theme'),
  useBreakpoint: jest.fn(),
}));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/workspace-search.service', () => ({
  workspaceSearchService: {
    getWorkspaceHead: jest.fn(),
    joinChannel: jest.fn(),
    listAuthors: jest.fn(),
    listScopes: jest.fn(),
    search: jest.fn(),
  },
}));

const dismiss = jest.spyOn(Keyboard, 'dismiss');

beforeEach(resetScreenMocks);

describe('WorkspaceSearchScreen — mở kết quả tin', () => {
  it('tin trong kênh → phòng chat với ?m=messageId; bàn phím đóng TRƯỚC khi điều hướng', async () => {
    mockedSearch.mockResolvedValue(messagePage([makeMessageHit({ messageId: 'm-9' })]));
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ án');

    await fireEvent.press(
      await screen.findByRole('button', { name: /Họp đồ án nhóm/ }, { timeout: 2000 }),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-1', m: 'm-9' },
    });
    expect(dismiss).toHaveBeenCalled();
    expect(dismiss.mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(router.push).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('tin TRẢ LỜI trong luồng → màn luồng của tin gốc, ?m= là reply', async () => {
    mockedSearch.mockResolvedValue(
      messagePage([
        makeMessageHit({
          inThread: true,
          messageId: 'reply-1',
          parentMessageId: 'root-1',
          threadId: 'root-1',
        }),
      ]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ án');

    expect(await screen.findByText('Trong luồng', {}, { timeout: 2000 })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /trong luồng/ }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
      params: { wsId: 'ws-1', chId: 'ch-1', messageId: 'root-1', m: 'reply-1' },
    });
  });

  it('TỆP nằm trong reply của luồng → màn luồng của tin gốc (source.threadId), ?m= là tin chứa tệp', async () => {
    mockedSearch.mockResolvedValue(
      filePage([
        makeFileHit({
          name: 'slide-luong.pdf',
          source: {
            kind: 'MESSAGE',
            messageId: 'reply-9',
            threadId: 'root-3',
            scope: { type: 'CHANNEL', id: 'ch-1', name: 'chung', isPrivate: false },
          },
        }),
      ]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('slide');
    await fireEvent.press(await screen.findByRole('tab', { name: 'Tệp' }, { timeout: 2000 }));

    await fireEvent.press(
      await screen.findByRole('button', { name: /slide-luong.pdf/ }, { timeout: 2000 }),
    );

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]/thread/[messageId]',
      params: { wsId: 'ws-1', chId: 'ch-1', messageId: 'root-3', m: 'reply-9' },
    });
  });

  it('tin của hội thoại (nhóm chat/1-1) → màn hội thoại với ?m=, không cần wsId', async () => {
    mockedSearch.mockResolvedValue(
      messagePage([
        makeMessageHit({
          messageId: 'dm-1',
          scope: { type: 'CONVERSATION', id: 'cv-1', name: 'Trần Thị Bình', isPrivate: true },
        }),
      ]),
    );
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ án');

    expect(await screen.findByText('Trần Thị Bình', {}, { timeout: 2000 })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Trần Thị Bình, riêng tư/ }));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/messages/[conversationId]',
      params: { conversationId: 'cv-1', m: 'dm-1' },
    });
  });

  it('mở kết quả cũng CHỐT từ khoá vào "tìm gần đây" (không lưu từng nhịp debounce)', async () => {
    mockedSearch.mockResolvedValue(messagePage([makeMessageHit()]));
    await renderWithProviders(<WorkspaceSearchScreen />);
    await typeQuery('đồ');
    await typeQuery('đồ án');
    await fireEvent.press(
      await screen.findByRole('button', { name: /Họp đồ án nhóm/ }, { timeout: 2000 }),
    );

    expect(useWorkspaceSearchStore.getState().recents['recent-search:u-me:ws-1']).toEqual([
      'đồ án',
    ]);
  });
});
