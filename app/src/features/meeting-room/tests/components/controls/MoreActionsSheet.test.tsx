import { fireEvent, screen } from '@testing-library/react-native';

import { MoreActionsSheet, type MoreActionsSheetProps } from '../../../components/controls/MoreActionsSheet';
import { renderWithInsets } from './controls-helpers';

/**
 * Menu "Thêm" (app.md §3.2 `MoreActionsSheet`): mục của CHỦ TRÌ chỉ hiện với chủ trì/đồng chủ trì, chia sẻ màn hình ẩn khi thiết bị không hỗ trợ,
 * và tuyệt đối không có "Bật mic người khác" (P0). Server vẫn là nơi quyết quyền — ở đây chỉ là ẩn/hiện giao diện.
 */
function makeProps(over: Partial<MoreActionsSheetProps> = {}): MoreActionsSheetProps {
  return {
    canScreenShare: true,
    layout: 'GRID',
    locked: false,
    onChangeLayout: jest.fn(),
    onClose: jest.fn(),
    onEndForAll: jest.fn(),
    onFlipCamera: jest.fn(),
    onLowerAllHands: jest.fn(),
    onMuteAll: jest.fn(),
    onToggleLock: jest.fn(),
    onToggleScreenShare: jest.fn(),
    onToggleSpeaker: jest.fn(),
    role: 'MEMBER',
    screenSharing: false,
    speakerOn: false,
    visible: true,
    ...over,
  };
}

const HOST_ONLY = ['Khoá cuộc họp', 'Hạ tay mọi người', 'Tắt mic tất cả', 'Kết thúc cho mọi người', 'Điều khiển của chủ trì'];

describe('MoreActionsSheet', () => {
  it('người thường: thấy mục chung, KHÔNG thấy bất kỳ mục nào của chủ trì', async () => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ role: 'MEMBER' })} />);

    for (const label of ['Chia sẻ màn hình', 'Đổi camera trước/sau', 'Chuyển sang loa ngoài', 'Bố cục lưới', 'Bố cục diễn giả']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    for (const label of HOST_ONLY) expect(screen.queryByText(label)).toBeNull();
  });

  it.each(['HOST', 'CO_HOST'] as const)('%s: thấy đủ mục của chủ trì', async (role) => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ role })} />);

    for (const label of HOST_ONLY) expect(screen.getByText(label)).toBeOnTheScreen();
  });

  it('KHÔNG có "Bật mic" ở bất kỳ vai trò nào — chủ trì chỉ TẮT được (P0)', async () => {
    const host = await renderWithInsets(<MoreActionsSheet {...makeProps({ role: 'HOST' })} />);
    expect(screen.queryByText(/bật mic/i)).toBeNull();
    expect(screen.getByText('Tắt mic tất cả')).toBeOnTheScreen();
    await host.unmount();

    await renderWithInsets(<MoreActionsSheet {...makeProps({ role: 'MEMBER' })} />);
    expect(screen.queryByText(/bật mic/i)).toBeNull();
  });

  it('thiết bị không chia sẻ được màn hình → ẨN mục chia sẻ (không để mục chết)', async () => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ canScreenShare: false })} />);

    expect(screen.queryByText('Chia sẻ màn hình')).toBeNull();
    expect(screen.queryByText('Dừng chia sẻ màn hình')).toBeNull();
    expect(screen.getByText('Đổi camera trước/sau')).toBeOnTheScreen();
  });

  it('đang chia sẻ → mục đổi thành "Dừng chia sẻ màn hình"', async () => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ screenSharing: true })} />);

    expect(screen.getByText('Dừng chia sẻ màn hình')).toBeOnTheScreen();
    expect(screen.queryByText('Chia sẻ màn hình')).toBeNull();
  });

  it('cuộc họp đang khoá → "Mở khoá cuộc họp"', async () => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ locked: true, role: 'HOST' })} />);

    expect(screen.getByText('Mở khoá cuộc họp')).toBeOnTheScreen();
    expect(screen.queryByText('Khoá cuộc họp')).toBeNull();
  });

  it('`canEndForAll=false` ẩn nút kết thúc dù là chủ trì (theo `myActions.canEnd`)', async () => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ canEndForAll: false, role: 'CO_HOST' })} />);

    expect(screen.queryByText('Kết thúc cho mọi người')).toBeNull();
    expect(screen.getByText('Tắt mic tất cả')).toBeOnTheScreen();
  });

  it('chọn một mục → tấm TỰ ĐÓNG rồi chạy đúng việc', async () => {
    const props = makeProps({ role: 'HOST' });
    await renderWithInsets(<MoreActionsSheet {...props} />);

    await fireEvent.press(screen.getByText('Tắt mic tất cả'));

    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onMuteAll).toHaveBeenCalledTimes(1);
  });

  it('mỗi mục gọi đúng callback của nó', async () => {
    const props = makeProps({ role: 'HOST' });
    await renderWithInsets(<MoreActionsSheet {...props} />);

    await fireEvent.press(screen.getByText('Chia sẻ màn hình'));
    await fireEvent.press(screen.getByText('Đổi camera trước/sau'));
    await fireEvent.press(screen.getByText('Chuyển sang loa ngoài'));
    await fireEvent.press(screen.getByText('Khoá cuộc họp'));
    await fireEvent.press(screen.getByText('Hạ tay mọi người'));
    await fireEvent.press(screen.getByText('Kết thúc cho mọi người'));

    for (const handler of [
      props.onToggleScreenShare,
      props.onFlipCamera,
      props.onToggleSpeaker,
      props.onToggleLock,
      props.onLowerAllHands,
      props.onEndForAll,
    ]) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it('bố cục hiện trạng thái bằng CHỮ "Đang chọn" và đổi được sang Diễn giả', async () => {
    const props = makeProps({ layout: 'GRID' });
    await renderWithInsets(<MoreActionsSheet {...props} />);

    expect(screen.getAllByText('Đang chọn')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Bố cục diễn giả'));
    expect(props.onChangeLayout).toHaveBeenCalledWith('SPEAKER');
  });

  it('ô bố cục đang chọn báo `selected` cho trình đọc màn hình, câu đọc gộp nhãn + trạng thái', async () => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ layout: 'SPEAKER' })} />);

    expect(screen.getByRole('button', { name: 'Bố cục diễn giả, Đang chọn' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Bố cục lưới' })).not.toBeSelected();
  });

  it('chủ trì: "Hạ tay mọi người" nói bằng CHỮ có bao nhiêu người đang giơ tay (khi nơi gọi truyền `raisedHands`)', async () => {
    const some = await renderWithInsets(<MoreActionsSheet {...makeProps({ raisedHands: 3, role: 'HOST' })} />);
    expect(screen.getByText('3 người đang giơ tay.')).toBeOnTheScreen();
    await some.unmount();

    await renderWithInsets(<MoreActionsSheet {...makeProps({ raisedHands: 0, role: 'HOST' })} />);
    expect(screen.getByText('Không ai đang giơ tay.')).toBeOnTheScreen();
  });

  it('âm thanh ra nói rõ đang dùng loa nào', async () => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ speakerOn: true })} />);

    expect(screen.getByText('Đang dùng loa ngoài')).toBeOnTheScreen();
    expect(screen.getByText('Chuyển sang loa trong')).toBeOnTheScreen();
  });

  it('đóng (visible=false) thì không dựng gì', async () => {
    await renderWithInsets(<MoreActionsSheet {...makeProps({ visible: false })} />);

    expect(screen.queryByText('Thêm')).toBeNull();
  });
});
