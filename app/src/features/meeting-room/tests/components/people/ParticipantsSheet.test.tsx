import { fireEvent, screen } from '@testing-library/react-native';

import type { AttendeeLite, RoomRole } from '../../../api/meeting-room.types';
import { ParticipantsSheet, type ParticipantsSheetProps } from '../../../components/people/ParticipantsSheet';
import { groupForPanel } from '../../../utils/room-people.utils';
import { makeLobbyEntry, makePerson } from '../../fixtures';
import { renderWithProviders } from '../prejoin/render-helpers';

/** `ParticipantsSheet` (app.md p2-05 §3.2): thứ tự nhóm, lobby CHỈ cho chủ trì/đồng chủ trì, tab "Được mời", nút "Thêm" theo quyền. */

const PEOPLE = [
  makePerson({ isLocal: true, name: 'Tôi', userId: 'me' }),
  makePerson({ name: 'Chủ Hà', role: 'HOST', userId: 'host' }),
  makePerson({ name: 'Đồng Bình', role: 'CO_HOST', userId: 'co' }),
  makePerson({ handRaisedAt: '2026-10-01T09:05:00.000Z', name: 'Giơ Hai', userId: 'r2' }),
  makePerson({ handRaisedAt: '2026-10-01T09:02:00.000Z', name: 'Giơ Một', userId: 'r1' }),
  makePerson({ name: 'Cường', userId: 'plain' }),
];

const INVITED: AttendeeLite[] = [
  { avatarUrl: null, name: 'Mai', role: 'ATTENDEE', rsvp: 'PENDING', userId: 'i1' },
  { avatarUrl: null, name: 'Nam', role: 'CO_HOST', rsvp: 'DECLINED', userId: 'i2' },
];

function makeProps(over: Partial<ParticipantsSheetProps> = {}): ParticipantsSheetProps {
  return {
    groups: groupForPanel(PEOPLE),
    invited: INVITED,
    lobby: [],
    meId: 'me',
    meRole: 'HOST' as RoomRole,
    onAdmit: jest.fn(),
    onAdmitAll: jest.fn(),
    onClose: jest.fn(),
    onDeny: jest.fn(),
    onLowerAllHands: jest.fn(),
    onLowerHand: jest.fn(),
    onOpenPersonMenu: jest.fn(),
    visible: true,
    ...over,
  };
}

/** Tên theo thứ tự HÀNG trên màn — đọc từ nhãn trợ năng của từng hàng ("Tên, …, Mic bật, Camera tắt"). */
function rowNames(): string[] {
  return screen
    .getAllByLabelText(/, Mic (bật|tắt), Camera (bật|tắt)$/)
    .map((row) => String(row.props.accessibilityLabel).split(',')[0] ?? '');
}

describe('ParticipantsSheet — tab "Trong phòng"', () => {
  it('thứ tự: giơ tay (sớm nhất trước) → chủ trì/đồng chủ trì → còn lại; nhãn tab có số đếm', async () => {
    await renderWithProviders(<ParticipantsSheet {...makeProps()} />);

    expect(rowNames()).toEqual(['Giơ Một', 'Giơ Hai', 'Chủ Hà', 'Đồng Bình', 'Tôi', 'Cường']);
    expect(screen.getByText('Trong phòng (6)')).toBeOnTheScreen();
    expect(screen.getByText('Được mời (2)')).toBeOnTheScreen();
  });

  it('chủ trì thấy danh sách chờ: rỗng ⇒ "Chưa có ai chờ"; có từ hai người ⇒ "Cho tất cả vào" gọi onAdmitAll', async () => {
    const { rerender } = await renderWithProviders(<ParticipantsSheet {...makeProps()} />);
    expect(screen.getByText('Chưa có ai chờ')).toBeOnTheScreen();
    expect(screen.queryByText('Cho tất cả vào')).toBeNull();

    const props = makeProps({ lobby: [makeLobbyEntry('a'), makeLobbyEntry('b')] });
    await rerender(<ParticipantsSheet {...props} />);
    expect(screen.getByText('Đang chờ vào (2)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cho tất cả vào' }));
    expect(props.onAdmitAll).toHaveBeenCalledTimes(1);
  });

  it('người thường KHÔNG thấy danh sách chờ (dù cha lỡ truyền dữ liệu), không có nút "Tuỳ chọn"/"Hạ tay" cho người khác', async () => {
    await renderWithProviders(
      <ParticipantsSheet {...makeProps({ lobby: [makeLobbyEntry('a')], meRole: 'MEMBER' })} />,
    );

    expect(screen.queryByText(/Đang chờ vào/)).toBeNull();
    expect(screen.queryByText('Chưa có ai chờ')).toBeNull();
    expect(screen.queryByLabelText(/^Tuỳ chọn cho/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Hạ tay/ })).toBeNull();
  });

  it('"Đang giơ tay (n)" đứng đầu, đánh số theo giờ giơ; chủ trì có "Hạ tay tất cả" + "Hạ tay" từng người', async () => {
    const props = makeProps();
    await renderWithProviders(<ParticipantsSheet {...props} />);

    expect(screen.getByText('Đang giơ tay (2)')).toBeOnTheScreen();
    expect(screen.getByText('Chủ trì và đồng chủ trì (2)')).toBeOnTheScreen();
    expect(screen.getByText('Thành viên (2)')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Giơ Một, Đang giơ tay, thứ 1,/)).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Giơ Hai, Đang giơ tay, thứ 2,/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Hạ tay tất cả' }));
    expect(props.onLowerAllHands).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Hạ tay của Giơ Hai' }));
    expect(props.onLowerHand).toHaveBeenCalledWith(expect.objectContaining({ userId: 'r2' }));
  });

  it('người thường đang giơ tay: chỉ có "Hạ tay" của CHÍNH mình; một người giơ thì không có "Hạ tay tất cả"; đang hạ thì hàng đó busy', async () => {
    const people = [
      makePerson({ handRaisedAt: '2026-10-01T09:01:00.000Z', isLocal: true, name: 'Tôi', userId: 'me' }),
      makePerson({ handRaisedAt: '2026-10-01T09:02:00.000Z', name: 'Lan', userId: 'lan' }),
    ];
    const props = makeProps({ groups: groupForPanel(people), meRole: 'MEMBER' });
    const { rerender } = await renderWithProviders(<ParticipantsSheet {...props} />);

    expect(screen.queryByRole('button', { name: 'Hạ tay tất cả' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hạ tay của Lan' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Hạ tay của bạn' }));
    expect(props.onLowerHand).toHaveBeenCalledWith(expect.objectContaining({ userId: 'me' }));

    const host = makeProps({ groups: groupForPanel(people.slice(1)), loweringUserId: 'lan', meRole: 'CO_HOST' });
    await rerender(<ParticipantsSheet {...host} />);
    expect(screen.queryByRole('button', { name: 'Hạ tay tất cả' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hạ tay của Lan' })).toBeBusy();
  });

  it('chủ trì: nút "Tuỳ chọn" cho người khác, KHÔNG cho chính mình và KHÔNG cho chủ trì; chạm mở menu đúng người', async () => {
    const props = makeProps();
    await renderWithProviders(<ParticipantsSheet {...props} />);

    expect(screen.queryByLabelText('Tuỳ chọn cho Tôi')).toBeNull();
    expect(screen.queryByLabelText('Tuỳ chọn cho Chủ Hà')).toBeNull();
    expect(screen.getByLabelText('Tuỳ chọn cho Đồng Bình')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Tuỳ chọn cho Cường'));
    expect(props.onOpenPersonMenu).toHaveBeenCalledWith(expect.objectContaining({ userId: 'plain' }));
  });
});

describe('ParticipantsSheet — tab "Được mời"', () => {
  it('đổi tab: hiện người được mời kèm RSVP bằng CHỮ; danh sách trong phòng và lobby ẩn đi', async () => {
    await renderWithProviders(<ParticipantsSheet {...makeProps({ lobby: [makeLobbyEntry('a')] })} />);

    await fireEvent.press(screen.getByText('Được mời (2)'));

    expect(screen.getByText('Mai')).toBeOnTheScreen();
    expect(screen.getByText('Chưa phản hồi')).toBeOnTheScreen();
    expect(screen.getByText('Không tham dự')).toBeOnTheScreen();
    expect(screen.getByText('Đồng chủ trì')).toBeOnTheScreen();
    expect(screen.queryByText('Cường')).toBeNull();
    expect(screen.queryByText(/Đang chờ vào/)).toBeNull();
  });

  it('không còn ai chưa vào: báo rõ thay vì để trống', async () => {
    await renderWithProviders(<ParticipantsSheet {...makeProps({ invited: [] })} />);

    await fireEvent.press(screen.getByText('Được mời (0)'));
    expect(screen.getByText('Mọi người được mời đều đã vào phòng.')).toBeOnTheScreen();
  });

  it('visible=false: không dựng nội dung', async () => {
    await renderWithProviders(<ParticipantsSheet {...makeProps({ visible: false })} />);

    expect(screen.queryByText('Người tham gia')).toBeNull();
  });
});
