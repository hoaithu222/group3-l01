import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { joinRequestsService, type MemberCard, type MemberRow as MemberRowData } from '../api';
import { InviteMethodSheet } from '../components/InviteMethodSheet';
import { JoinRequestsEntry } from '../components/JoinRequestsEntry';
import { MemberCardHeader } from '../components/MemberCardHeader';
import { MemberRow } from '../components/MemberRow';
import { renderWithProviders as renderWith } from './test-utils';

/**
 * Các điểm VÀO của p3-04 trên màn Thành viên (checklist be.md §5.6 phía client): mỗi cách mời
 * chỉ hiện đúng với người được phép theo cờ BE trả (`canInvite`, `myRole`, `actions.canRemove`);
 * quyền THẬT vẫn do BE (403/404) — test này chỉ khoá phần ẩn/hiện.
 */

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() } }));
jest.mock('@/core/socket', () => ({
  usePresence: () => ({ state: 'OFFLINE', updatedAt: 0 }),
}));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, joinRequestsService: { ...actual.joinRequestsService, list: jest.fn() } };
});

const mockedList = jest.mocked(joinRequestsService.list);

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => jest.clearAllMocks());

describe('InviteMethodSheet', () => {
  function sheet(canInviteByEmail: boolean, canManageMembers: boolean, onClose = jest.fn()) {
    return (
      <InviteMethodSheet
        canInviteByEmail={canInviteByEmail}
        canManageMembers={canManageMembers}
        visible
        wsId="ws-1"
        onClose={onClose}
      />
    );
  }

  it('thành viên KHÔNG được mời email → không có cách mời nào (BE 403 với "Link mời" nên không bày ra)', async () => {
    await renderWith(sheet(false, false));

    expect(screen.queryByText('Link mời')).toBeNull();
    expect(screen.queryByText('Mời qua email')).toBeNull();
    expect(screen.queryByText('Mời khách')).toBeNull();
    expect(screen.queryByText('Lời mời đã gửi')).toBeNull();
  });

  it('MEMBER được phép (memberCanInvite) → CHỈ "Mời qua email"; không có "Link mời" (BE đòi ADMIN), mời khách, danh sách lời mời', async () => {
    await renderWith(sheet(true, false));

    expect(screen.getByText('Mời qua email')).toBeOnTheScreen();
    expect(screen.queryByText('Link mời')).toBeNull();
    expect(screen.queryByText('Mời khách')).toBeNull();
    expect(screen.queryByText('Lời mời đã gửi')).toBeNull();
  });

  it('OWNER/ADMIN → đủ các cách; chọn "Mời khách" đóng sheet rồi mở đúng route', async () => {
    const onClose = jest.fn();
    await renderWith(sheet(true, true, onClose));

    expect(screen.getByText('Link mời')).toBeOnTheScreen();
    expect(screen.getByText('Mời qua email')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Mời khách'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/members/invite-guest',
      params: { wsId: 'ws-1' },
    });
    expect(screen.getByText('Lời mời đã gửi')).toBeOnTheScreen();
  });
});

describe('JoinRequestsEntry', () => {
  const REQUEST = {
    user: { id: 'u1', name: 'An', avatarUrl: null },
    requestMessage: null,
    requestedAt: '2026-09-19T00:00:00.000Z',
    via: 'INVITE_LINK' as const,
  };

  it('không bật duyệt/không đủ quyền (enabled=false) → ẩn và KHÔNG gọi API', async () => {
    await renderWith(<JoinRequestsEntry enabled={false} wsId="ws-1" />);

    expect(screen.queryByText('Yêu cầu tham gia')).toBeNull();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('có 2 yêu cầu chờ → hiện số; bấm mở màn duyệt', async () => {
    mockedList.mockResolvedValue({ items: [REQUEST, { ...REQUEST, user: { ...REQUEST.user, id: 'u2' } }], meta: { nextCursor: null, hasMore: false, limit: 20 } });
    await renderWith(<JoinRequestsEntry enabled wsId="ws-1" />);

    expect(await screen.findByText('Yêu cầu tham gia')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Yêu cầu tham gia'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/workspaces/[wsId]/members/requests', params: { wsId: 'ws-1' } });
  });

  it('còn trang sau → ghi "N+" thay vì một con số sai', async () => {
    mockedList.mockResolvedValue({ items: [REQUEST], meta: { nextCursor: 'c2', hasMore: true, limit: 20 } });
    await renderWith(<JoinRequestsEntry enabled wsId="ws-1" />);

    expect(await screen.findByText('1+')).toBeOnTheScreen();
  });

  it('không có yêu cầu nào → không vẽ dòng vô nghĩa', async () => {
    mockedList.mockResolvedValue({ items: [], meta: { nextCursor: null, hasMore: false, limit: 20 } });
    await renderWith(<JoinRequestsEntry enabled wsId="ws-1" />);

    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    expect(screen.queryByText('Yêu cầu tham gia')).toBeNull();
  });
});

describe('thẻ KHÁCH', () => {
  const GUEST_CARD: MemberCard = {
    userId: 'u-g',
    name: 'Khách A',
    displayName: null,
    avatarUrl: null,
    role: 'GUEST',
    status: 'ACTIVE',
    joinedAt: '2026-09-01T00:00:00.000Z',
    presence: 'OFFLINE',
    isMe: false,
    expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
    actions: { canMessage: false, canCall: false, canChangeRole: false, canRemove: true, canBan: false },
  };

  it('OWNER/ADMIN (actions.canRemove) thấy hạn + "Quản lý quyền khách" → đóng thẻ rồi mở màn quản lý khách', async () => {
    const onClose = jest.fn();
    await renderWith(<MemberCardHeader card={GUEST_CARD} wsId="ws-1" onClose={onClose} />);

    expect(screen.getByText('Khách · còn 5 ngày')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Quản lý quyền khách'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/members/[userId]/guest',
      params: { userId: 'u-g', wsId: 'ws-1' },
    });
  });

  it('người xem KHÔNG quản lý được (canRemove=false) → không có lối vào quản lý khách', async () => {
    await renderWith(
      <MemberCardHeader
        card={{ ...GUEST_CARD, actions: { ...GUEST_CARD.actions, canRemove: false } }}
        wsId="ws-1"
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByText('Quản lý quyền khách')).toBeNull();
  });

  it('thành viên thường → không có nhãn khách, không có lối vào quản lý khách', async () => {
    await renderWith(
      <MemberCardHeader card={{ ...GUEST_CARD, role: 'MEMBER', expiresAt: undefined }} wsId="ws-1" onClose={jest.fn()} />,
    );

    expect(screen.queryByText(/Khách ·/)).toBeNull();
    expect(screen.queryByText('Quản lý quyền khách')).toBeNull();
  });

  it('dòng khách trong danh sách hiện "Khách · còn N ngày" và đọc được hạn cho trình đọc màn hình', async () => {
    const member: MemberRowData = {
      userId: 'u-g',
      name: 'Khách A',
      displayName: null,
      avatarUrl: null,
      role: 'GUEST',
      status: 'ACTIVE',
      joinedAt: '2026-09-01T00:00:00.000Z',
      presence: 'OFFLINE',
      isMe: false,
      expiresAt: new Date(Date.now() + 5 * DAY).toISOString(),
    };
    await renderWith(<MemberRow member={member} onPress={jest.fn()} />);

    expect(screen.getByText('Khách · còn 5 ngày')).toBeOnTheScreen();
    expect(screen.getByLabelText('Khách A, Khách, còn 5 ngày')).toBeOnTheScreen();
  });
});
