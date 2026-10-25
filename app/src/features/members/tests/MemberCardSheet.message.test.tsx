import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { membersService, type MemberCard } from '../api';
import { MemberCardSheet } from '../components/MemberCardSheet';

/**
 * Chốt lỗi p1-02: nút "Nhắn tin" của thẻ thành viên từng chỉ toast "sắp có"
 * dù DM (p1-05) đã có — và còn không hiện vì BE gán CỨNG `actions.canMessage=false`
 * (`member.presenter.ts`). Nay hiện theo trạng thái người được xem và mở DM qua
 * route `/messages/new`.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: () => false }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, membersService: { ...actual.membersService, card: jest.fn() } };
});

const mockedCard = jest.mocked(membersService.card);

const METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const CARD: MemberCard = {
  userId: 'u-2',
  name: 'Trần Thị Bình',
  displayName: null,
  avatarUrl: null,
  role: 'MEMBER',
  status: 'ACTIVE',
  joinedAt: '2026-09-01T00:00:00.000Z',
  presence: 'OFFLINE',
  isMe: false,
  // BE hiện trả cứng false — nút vẫn phải hiện.
  actions: { canMessage: false, canCall: false, canChangeRole: false, canRemove: false, canBan: false },
};

async function renderSheet(onClose = jest.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={METRICS}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  await render(<MemberCardSheet userId="u-2" wsId="ws-1" onClose={onClose} />, { wrapper: Wrapper });
  return onClose;
}

describe('MemberCardSheet — Nhắn tin', () => {
  beforeEach(() => {
    mockedCard.mockReset();
    jest.mocked(router.push).mockClear();
  });

  it('người khác đang ACTIVE ⇒ có "Nhắn tin"; bấm ⇒ đóng sheet rồi mở DM bằng route /messages/new', async () => {
    mockedCard.mockResolvedValue(CARD);
    const onClose = await renderSheet();

    await waitFor(() => expect(screen.getByText('Nhắn tin')).toBeOnTheScreen());
    await fireEvent.press(screen.getByText('Nhắn tin'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/messages/new',
      params: { userId: 'u-2', name: 'Trần Thị Bình', avatarUrl: '' },
    });
  });

  it('thẻ của CHÍNH MÌNH ⇒ không có "Nhắn tin"', async () => {
    mockedCard.mockResolvedValue({ ...CARD, isMe: true });
    await renderSheet();

    await waitFor(() => expect(screen.getByText('Đổi tên hiển thị')).toBeOnTheScreen());
    expect(screen.queryByText('Nhắn tin')).toBeNull();
  });

  it('người đang bị chặn ⇒ không có "Nhắn tin"', async () => {
    mockedCard.mockResolvedValue({ ...CARD, status: 'BANNED' });
    await renderSheet();

    await waitFor(() => expect(screen.getByText('Gỡ chặn')).toBeOnTheScreen());
    expect(screen.queryByText('Nhắn tin')).toBeNull();
  });
});
