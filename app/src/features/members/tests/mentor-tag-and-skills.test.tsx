import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { membersService } from '../api';
import { MemberCardHeader } from '../components/MemberCardHeader';
import { MemberRow } from '../components/MemberRow';

import { badge, CARD, DAY, enable, newClient, providers, ROW } from './mentor-fixtures';

/**
 * p6-03 (nhãn cố vấn) + p6-06 (huy hiệu kỹ năng) ở danh sách/thẻ thành viên. Khoá: cố vấn = KHÁCH có `displayTag = "MENTOR"` → nhãn
 * "Cố vấn · còn N ngày" thay "Khách"; nhãn sót trên người đã được nâng vai không che vai thật; thẻ hiện ≤ 3 huy hiệu + "+N", chạm mở danh sách
 * đầy đủ, và tự ẩn khi cờ tắt/404/không có. (`member:updated` ở `useMemberSocket.mentor.test.tsx`.)
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('../api', () => {
  const actual = jest.requireActual('../api');
  return { ...actual, membersService: { ...actual.membersService, skillBadges: jest.fn() } };
});

const mockedSkills = jest.mocked(membersService.skillBadges);

beforeEach(() => {
  jest.clearAllMocks();
  enable();
});

describe('MemberRow — nhãn cố vấn', () => {
  it('khách có nhãn MENTOR + hạn (OWNER/ADMIN thấy): "Cố vấn · còn N ngày" thay cho "Khách"; đọc to là "Cố vấn"', async () => {
    const expiresAt = new Date(Date.now() + 10 * DAY).toISOString();
    await render(
      <MemberRow member={{ ...ROW, displayTag: 'MENTOR', expiresAt }} onPress={jest.fn()} />,
    );

    expect(screen.getByText('Cố vấn · còn 10 ngày')).toBeOnTheScreen();
    expect(screen.queryByText(/^Khách/)).toBeNull();
    expect(screen.getByLabelText(/Lê Văn Cố, Cố vấn, còn 10 ngày/)).toBeOnTheScreen();
  });

  it('MEMBER xem (BE không gửi hạn): chỉ "Cố vấn", không đoán hạn', async () => {
    await render(<MemberRow member={{ ...ROW, displayTag: 'MENTOR' }} onPress={jest.fn()} />);

    expect(screen.getByText('Cố vấn')).toBeOnTheScreen();
    expect(screen.queryByText(/còn/)).toBeNull();
  });

  it('nhãn MENTOR sót trên người đã là thành viên thường: vẫn ghi vai thật, không vẽ nhãn', async () => {
    await render(
      <MemberRow member={{ ...ROW, displayTag: 'MENTOR', role: 'MEMBER' }} onPress={jest.fn()} />,
    );

    expect(screen.getByText('Thành viên')).toBeOnTheScreen();
    expect(screen.queryByText(/Cố vấn/)).toBeNull();
  });

  it('nhãn lạ hoặc không có nhãn: khách thường vẫn "Khách · còn N ngày"', async () => {
    const expiresAt = new Date(Date.now() + 10 * DAY).toISOString();
    await render(
      <MemberRow member={{ ...ROW, displayTag: 'AMBASSADOR', expiresAt }} onPress={jest.fn()} />,
    );

    expect(screen.getByText('Khách · còn 10 ngày')).toBeOnTheScreen();
    expect(screen.queryByText(/Cố vấn/)).toBeNull();
  });
});

describe('MemberCardHeader — nhãn cố vấn + huy hiệu kỹ năng', () => {
  it('cờ career bật, có 4 huy hiệu: hiện 3 + "+1"; chạm → đóng thẻ rồi mở danh sách đầy đủ của người này', async () => {
    enable('career');
    mockedSkills.mockResolvedValue([
      badge('a', 'ReactJS'),
      badge('b', 'Node.js'),
      badge('c', 'MongoDB'),
      badge('d', 'Docker'),
    ]);
    const onClose = jest.fn();
    await render(<MemberCardHeader card={CARD} wsId="ws-1" onClose={onClose} />, {
      wrapper: providers(newClient()),
    });

    expect(await screen.findByText('ReactJS')).toBeOnTheScreen();
    expect(screen.getByText('Node.js')).toBeOnTheScreen();
    expect(screen.getByText('MongoDB')).toBeOnTheScreen();
    expect(screen.queryByText('Docker')).toBeNull();
    expect(screen.getByText('+1')).toBeOnTheScreen();
    expect(mockedSkills).toHaveBeenCalledWith('u-mentor');

    await fireEvent.press(
      screen.getByRole('button', {
        name: /Huy hiệu kỹ năng xác thực: ReactJS, Node.js, MongoDB, Docker/,
      }),
    );

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/me/career/people/u-mentor');
  });

  it('cờ career TẮT: không gọi API, không vẽ dòng huy hiệu', async () => {
    enable();
    mockedSkills.mockResolvedValue([badge('a', 'ReactJS')]);
    await render(<MemberCardHeader card={CARD} wsId="ws-1" onClose={jest.fn()} />, {
      wrapper: providers(newClient()),
    });

    expect(screen.getByText('Lê Văn Cố')).toBeOnTheScreen();
    expect(mockedSkills).not.toHaveBeenCalled();
    expect(screen.queryByText('ReactJS')).toBeNull();
  });

  it('người này không chia sẻ huy hiệu (404) hoặc chỉ có huy hiệu đã thu hồi: ẩn hẳn dòng, không toast/lỗi', async () => {
    enable('career');
    mockedSkills.mockRejectedValue(
      Object.assign(new Error('404'), { isAxiosError: true, response: { status: 404 } }),
    );
    const hidden = await render(<MemberCardHeader card={CARD} wsId="ws-1" onClose={jest.fn()} />, {
      wrapper: providers(newClient()),
    });

    await waitFor(() => expect(mockedSkills).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /Huy hiệu kỹ năng/ })).toBeNull();
    await hidden.unmount();

    mockedSkills.mockResolvedValue([badge('a', 'ReactJS', { revoked: true })]);
    await render(<MemberCardHeader card={CARD} wsId="ws-1" onClose={jest.fn()} />, {
      wrapper: providers(newClient()),
    });
    await waitFor(() => expect(mockedSkills).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('ReactJS')).toBeNull();
  });

  it('thẻ của cố vấn: nhãn "Cố vấn · còn N ngày" thay "Khách · còn N ngày"; dòng vai vẫn ghi "Khách"', async () => {
    const expiresAt = new Date(Date.now() + 10 * DAY).toISOString();
    await render(
      <MemberCardHeader
        card={{ ...CARD, displayTag: 'MENTOR', expiresAt }}
        wsId="ws-1"
        onClose={jest.fn()}
      />,
      { wrapper: providers(newClient()) },
    );

    expect(screen.getByText('Cố vấn · còn 10 ngày')).toBeOnTheScreen();
    expect(screen.queryByText(/^Khách · còn/)).toBeNull();
    expect(screen.getByText(/Khách · Tham gia/)).toBeOnTheScreen();
  });
});
