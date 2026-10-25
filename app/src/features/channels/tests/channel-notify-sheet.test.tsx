import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { notificationPreferencesService } from '@/core/notifications';

import { channelsService, type ChannelDetail } from '../api';
import { ChannelInfoSheets } from '../components/ChannelInfoSheets';
import { ChannelInfoScreen } from '../screens/ChannelInfoScreen';
import { channelNotifyLabel } from '../utils/channel-notify';

/**
 * p1-07 app.md §3 `NotifyModeSheet`: "dùng ở info hội thoại, cài đặt kênh, cài đặt workspace; 'Theo mặc định' hiển thị giá trị kế thừa thực tế".
 * Trước đây cài đặt kênh dùng `SelectSheet` với bốn chữ riêng ("Theo tài khoản", "Tắt thông báo"…) — lệch bộ chữ với hội thoại/nhóm và
 * không nói `INHERIT` sẽ ra giá trị gì.
 */
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ chId: 'ch-1', wsId: 'ws-1' }),
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('../api/channels.service', () => ({
  channelsService: {
    get: jest.fn(),
    list: jest.fn(async () => ({ discoverable: [], joined: [] })),
    updateMe: jest.fn(),
  },
}));
jest.mock('@/core/notifications', () => ({
  ...jest.requireActual('@/core/notifications'),
  notificationPreferencesService: { getAccount: jest.fn(), getWorkspace: jest.fn() },
}));

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { gcTime: Infinity, retry: false } },
  });
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

const detail = (over: Partial<ChannelDetail> = {}): ChannelDetail => ({
  createdBy: 'u1',
  description: null,
  id: 'ch-1',
  isDefault: false,
  lastMessageAt: null,
  memberCount: 3,
  myPermissions: {
    canArchive: false,
    canLeave: false,
    canManage: false,
    canManageGrants: false,
    canModerate: false,
    canPin: false,
    canReact: true,
    canWrite: true,
  },
  name: 'chung',
  notifyMode: 'INHERIT',
  pinned: false,
  position: 0,
  postingPolicy: 'MEMBERS',
  status: 'ACTIVE',
  type: 'TEXT',
  version: 1,
  visibility: 'PUBLIC',
  ...over,
});

describe('channelNotifyLabel', () => {
  it('cùng bộ chữ với NotifyModeSheet; INHERIT hiện giá trị kế thừa thực tế, chưa biết thì chỉ "Theo mặc định"', () => {
    expect(channelNotifyLabel('ALL_MESSAGES', undefined)).toBe('Mọi tin');
    expect(channelNotifyLabel('MENTIONS_AND_THREADS', undefined)).toBe('Chỉ nhắc tên & luồng');
    expect(channelNotifyLabel('MUTED', 'ALL')).toBe('Tắt tiếng');
    expect(channelNotifyLabel('INHERIT', 'MENTIONS')).toBe('Theo mặc định (Chỉ nhắc tên & luồng)');
    expect(channelNotifyLabel('INHERIT', undefined)).toBe('Theo mặc định');
  });
});

describe('ChannelInfoSheets — tấm Thông báo của kênh', () => {
  const baseProps = {
    archiveLoading: false,
    archiveSheetOpen: false,
    isDefault: false,
    leaveDialogOpen: false,
    leaveLoading: false,
    notifyMode: 'INHERIT' as const,
    notifySheetOpen: true,
    replacementOptions: [],
    onArchiveClose: jest.fn(),
    onArchiveConfirm: jest.fn(),
    onLeaveClose: jest.fn(),
    onLeaveConfirm: jest.fn(),
    onNotifyChange: jest.fn(),
    onNotifyClose: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('hiện Mọi tin · Chỉ nhắc tên & luồng · Tắt tiếng · Theo mặc định (giá trị kế thừa); KHÔNG có chọn thời lượng', async () => {
    await render(<ChannelInfoSheets {...baseProps} notifyInherited="MENTIONS" />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('Mọi tin')).toBeOnTheScreen();
    expect(screen.getByText('Chỉ nhắc tên & luồng')).toBeOnTheScreen();
    expect(screen.getByText('Tắt tiếng')).toBeOnTheScreen();
    expect(screen.getByText('Theo mặc định (Chỉ nhắc tên & luồng)')).toBeOnTheScreen();
  });

  it.each([
    ['Mọi tin', 'ALL_MESSAGES'],
    ['Chỉ nhắc tên & luồng', 'MENTIONS_AND_THREADS'],
    ['Tắt tiếng', 'MUTED'],
  ])('chọn "%s" → đổi ra enum của kênh (%s) và đóng tấm', async (label, mode) => {
    await render(<ChannelInfoSheets {...baseProps} />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByText(label));

    expect(baseProps.onNotifyChange).toHaveBeenCalledWith(mode);
    expect(baseProps.onNotifyClose).toHaveBeenCalled();
  });

  it('chọn "Theo mặc định" → INHERIT (bỏ ghi đè riêng của kênh)', async () => {
    await render(<ChannelInfoSheets {...baseProps} notifyMode="MUTED" />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByText('Theo mặc định'));

    expect(baseProps.onNotifyChange).toHaveBeenCalledWith('INHERIT');
  });
});

describe('ChannelInfoScreen — Cá nhân → Thông báo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(channelsService.get).mockResolvedValue(detail());
    jest
      .mocked(channelsService.updateMe)
      .mockResolvedValue({ notifyMode: 'MUTED', pinned: false, position: 0 });
    jest.mocked(notificationPreferencesService.getAccount).mockResolvedValue({
      channelMode: 'ALL',
      directMode: 'ALL',
      dndUntil: null,
      groupMode: 'ALL',
      isDefault: {
        channelMode: true,
        directMode: true,
        groupMode: true,
        lockScreenPreview: true,
        sound: true,
      },
      lockScreenPreview: 'HIDDEN',
      sound: true,
    });
    jest.mocked(notificationPreferencesService.getWorkspace).mockResolvedValue({
      channelMode: 'INHERIT',
      effective: { channelMode: 'MENTIONS_AND_THREADS', groupMode: 'ALL' },
      groupMode: 'INHERIT',
      workspaceId: 'ws-1',
    });
  });

  it('dòng "Thông báo" hiện giá trị kế thừa của nhóm; chọn "Tắt tiếng" gọi PATCH /channels/:id/me { notifyMode: MUTED }', async () => {
    await render(<ChannelInfoScreen />, { wrapper: Wrapper });

    // Đợi giá trị kế thừa của nhóm về (`channelMode` hiệu lực = Chỉ nhắc tên & luồng).
    const row = await screen.findByText('Theo mặc định (Chỉ nhắc tên & luồng)');
    await fireEvent.press(row);

    await fireEvent.press(await screen.findByText('Tắt tiếng'));

    expect(channelsService.updateMe).toHaveBeenCalledWith('ch-1', { notifyMode: 'MUTED' });
  });
});
