import { fireEvent, screen } from '@testing-library/react-native';

import type { RoomRole } from '../../../api/meeting-room.types';
import { HostParticipantMenu, type HostParticipantMenuProps } from '../../../components/people/HostParticipantMenu';
import type { RoomPerson } from '../../../utils/room-people.utils';
import { makePerson } from '../../fixtures';
import { renderWithProviders } from '../prejoin/render-helpers';

/**
 * `HostParticipantMenu` (app.md p2-05 §3.2, §7): chủ trì chỉ TẮT (không bao giờ "Bật mic/camera người khác"), "Mời ra" không bao giờ
 * hiện với chủ trì, đồng chủ trì không cấp/thu quyền và không mời đồng chủ trì khác ra.
 */

function makeProps(person: RoomPerson | null, over: Partial<HostParticipantMenuProps> = {}): HostParticipantMenuProps {
  return {
    canChangeRole: true,
    meRole: 'HOST' as RoomRole,
    onClose: jest.fn(),
    onMuteCamera: jest.fn(),
    onMuteMic: jest.fn(),
    onRemove: jest.fn(),
    onSetRole: jest.fn(),
    onStopShare: jest.fn(),
    person,
    ...over,
  };
}

const MEMBER = makePerson({ cameraEnabled: true, micEnabled: true, name: 'Cường', userId: 'u1' });

describe('HostParticipantMenu — nội dung theo vai', () => {
  it('KHÔNG BAO GIỜ có mục "Bật mic"/"Bật camera" (chỉ tắt) — kể cả khi người kia đang tắt', async () => {
    await renderWithProviders(
      <HostParticipantMenu {...makeProps(makePerson({ cameraEnabled: false, micEnabled: false, name: 'Cường', userId: 'u1' }))} />,
    );

    expect(screen.queryByText(/^Bật/)).toBeNull();
    expect(screen.getByText('Mic đang tắt')).toBeOnTheScreen();
    expect(screen.getByText('Camera đang tắt')).toBeOnTheScreen();
  });

  it('mục tiêu là HOST: không có "Mời ra khỏi cuộc họp", không có cấp/thu quyền', async () => {
    await renderWithProviders(<HostParticipantMenu {...makeProps(makePerson({ name: 'Chủ Hà', role: 'HOST', userId: 'h' }))} />);

    expect(screen.queryByText('Mời ra khỏi cuộc họp')).toBeNull();
    expect(screen.queryByText(/quyền đồng chủ trì/)).toBeNull();
  });

  it('người xem là đồng chủ trì: không thấy "Cấp quyền", mời ra được người thường nhưng KHÔNG mời được đồng chủ trì khác', async () => {
    const { rerender } = await renderWithProviders(<HostParticipantMenu {...makeProps(MEMBER, { meRole: 'CO_HOST' })} />);
    expect(screen.queryByText('Cấp quyền đồng chủ trì')).toBeNull();
    expect(screen.getByText('Mời ra khỏi cuộc họp')).toBeOnTheScreen();

    await rerender(
      <HostParticipantMenu {...makeProps(makePerson({ name: 'Bình', role: 'CO_HOST', userId: 'co' }), { meRole: 'CO_HOST' })} />,
    );
    expect(screen.queryByText('Mời ra khỏi cuộc họp')).toBeNull();
  });

  it('người xem là người thường: không có menu nào', async () => {
    await renderWithProviders(<HostParticipantMenu {...makeProps(MEMBER, { meRole: 'MEMBER' })} />);

    expect(screen.queryByText('Tắt mic')).toBeNull();
  });

  it('person = null: đóng, không dựng gì', async () => {
    await renderWithProviders(<HostParticipantMenu {...makeProps(null)} />);

    expect(screen.queryByText('Tắt mic')).toBeNull();
  });

  it('"Dừng chia sẻ" chỉ hiện khi người đó đang chia sẻ màn hình', async () => {
    const { rerender } = await renderWithProviders(<HostParticipantMenu {...makeProps(MEMBER)} />);
    expect(screen.queryByText('Dừng chia sẻ')).toBeNull();

    await rerender(<HostParticipantMenu {...makeProps({ ...MEMBER, screenShareRef: { share: true } })} />);
    expect(screen.getByText('Dừng chia sẻ')).toBeOnTheScreen();
  });
});

describe('HostParticipantMenu — hạ tay', () => {
  it('"Hạ tay" chỉ khi người đó ĐANG giơ tay; bấm đóng menu rồi gọi onLowerHand', async () => {
    const props = makeProps(MEMBER, { onLowerHand: jest.fn() });
    const { rerender } = await renderWithProviders(<HostParticipantMenu {...props} />);
    expect(screen.queryByText('Hạ tay')).toBeNull();

    const raised = makeProps({ ...MEMBER, handRaisedAt: '2026-10-01T09:02:00.000Z' }, { onLowerHand: jest.fn() });
    await rerender(<HostParticipantMenu {...raised} />);
    await fireEvent.press(screen.getByText('Hạ tay'));
    expect(raised.onClose).toHaveBeenCalledTimes(1);
    expect(raised.onLowerHand).toHaveBeenCalledTimes(1);
  });
});

describe('HostParticipantMenu — hành động', () => {
  it('"Tắt mic"/"Tắt camera" đóng menu rồi chạy việc; mic đã tắt thì mục bị khoá', async () => {
    const props = makeProps(MEMBER);
    const { rerender } = await renderWithProviders(<HostParticipantMenu {...props} />);

    await fireEvent.press(screen.getByText('Tắt mic'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onMuteMic).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('Tắt camera'));
    expect(props.onMuteCamera).toHaveBeenCalledTimes(1);

    const off = makeProps({ ...MEMBER, micEnabled: false });
    await rerender(<HostParticipantMenu {...off} />);
    await fireEvent.press(screen.getByText('Tắt mic'));
    expect(off.onMuteMic).not.toHaveBeenCalled();
  });

  it('HOST cấp quyền cho người thường, thu quyền của đồng chủ trì cấp tạm; canChangeRole=false thì không có', async () => {
    const grant = makeProps(MEMBER);
    const { rerender } = await renderWithProviders(<HostParticipantMenu {...grant} />);
    await fireEvent.press(screen.getByText('Cấp quyền đồng chủ trì'));
    expect(grant.onSetRole).toHaveBeenCalledWith('CO_HOST');

    const revoke = makeProps({ ...MEMBER, role: 'CO_HOST' });
    await rerender(<HostParticipantMenu {...revoke} />);
    await fireEvent.press(screen.getByText('Thu quyền đồng chủ trì'));
    expect(revoke.onSetRole).toHaveBeenCalledWith('MEMBER');

    await rerender(<HostParticipantMenu {...makeProps({ ...MEMBER, role: 'CO_HOST' }, { canChangeRole: false })} />);
    expect(screen.queryByText(/quyền đồng chủ trì/)).toBeNull();
  });

  it('mời ra: mặc định KHÔNG xoá khỏi danh sách tham dự; bật công tắc thì truyền true; đổi người là về tắt', async () => {
    const first = makeProps(MEMBER);
    const { rerender } = await renderWithProviders(<HostParticipantMenu {...first} />);
    await fireEvent.press(screen.getByText('Mời ra khỏi cuộc họp'));
    expect(first.onRemove).toHaveBeenCalledWith(false);

    const second = makeProps(MEMBER);
    await rerender(<HostParticipantMenu {...second} />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Xoá khỏi danh sách tham dự' }));
    expect(screen.getByRole('switch', { name: 'Xoá khỏi danh sách tham dự' })).toBeChecked();
    await fireEvent.press(screen.getByText('Mời ra khỏi cuộc họp'));
    expect(second.onRemove).toHaveBeenCalledWith(true);

    await rerender(<HostParticipantMenu {...makeProps(makePerson({ name: 'Dũng', userId: 'u2' }))} />);
    expect(screen.getByRole('switch', { name: 'Xoá khỏi danh sách tham dự' })).not.toBeChecked();
  });
});
