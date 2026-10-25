import { fireEvent, screen } from '@testing-library/react-native';

import { PreJoinView, type PreJoinViewProps } from '../../../components/prejoin/PreJoinView';
import { renderWithProviders } from './render-helpers';

/** `PreJoinView` (app.md p2-05 §3.2): mic/camera MẶC ĐỊNH TẮT, nút chính theo nhãn cha đưa, "chỉ để nghe" tuỳ chọn, lỗi mạng có "Thử lại". */

function makeProps(over: Partial<PreJoinViewProps> = {}): PreJoinViewProps {
  return {
    camDenied: false,
    camOn: false,
    defaultDisplayName: 'Nguyễn Văn A',
    endAt: '2026-10-01T10:00:00.000Z',
    error: null,
    facing: 'front',
    live: false,
    micDenied: false,
    micLevel: 0,
    micOn: false,
    onChangeName: jest.fn(),
    onClose: jest.fn(),
    onFlipCamera: jest.fn(),
    onOpenAudioRoute: jest.fn(),
    onPrimary: jest.fn(),
    onToggleCam: jest.fn(),
    onToggleMic: jest.fn(),
    previewRef: null,
    primaryLabel: 'Tham gia',
    primaryLoading: false,
    renderVideo: jest.fn(() => null),
    startAt: '2026-10-01T09:00:00.000Z',
    title: 'Họp giao ban',
    ...over,
  };
}

async function renderView(over: Partial<PreJoinViewProps> = {}) {
  const props = makeProps(over);
  await renderWithProviders(<PreJoinView {...props} />);
  return props;
}

describe('PreJoinView — thiết bị mặc định TẮT', () => {
  it('mic và camera đều tắt, có chữ nói rõ; tiêu đề cuộc họp hiện ra', async () => {
    await renderView();

    expect(screen.getByRole('switch', { name: 'Micro' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Camera' })).not.toBeChecked();
    expect(screen.getByText('Đang tắt — mọi người không nghe thấy bạn.')).toBeOnTheScreen();
    expect(screen.getByText('Đang tắt — mọi người không thấy bạn.')).toBeOnTheScreen();
    expect(screen.getByText('Họp giao ban')).toBeOnTheScreen();
    expect(screen.getByText('Mic đang tắt')).toBeOnTheScreen();
    expect(screen.getByText('Camera đang tắt')).toBeOnTheScreen();
  });

  it('chạm công tắc gọi đúng handler (không tự bật gì)', async () => {
    const props = await renderView();

    await fireEvent.press(screen.getByRole('switch', { name: 'Micro' }));
    expect(props.onToggleMic).toHaveBeenCalledTimes(1);
    expect(props.onToggleCam).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('switch', { name: 'Camera' }));
    expect(props.onToggleCam).toHaveBeenCalledTimes(1);
  });

  it('bị từ chối quyền: dòng nhắc "vẫn vào được", không phải popup', async () => {
    await renderView({ camDenied: true, micDenied: true });

    expect(screen.getByText('Chưa có quyền micro. Bạn vẫn vào được cuộc họp và chỉ nghe.')).toBeOnTheScreen();
    expect(screen.getByText('Chưa có quyền camera. Bạn vẫn vào được cuộc họp, không có hình ảnh.')).toBeOnTheScreen();
  });

  it('bị từ chối quyền + có onOpenSettings: khối "Mở Cài đặt" gọi đúng handler; đủ quyền thì không có khối đó', async () => {
    const onOpenSettings = jest.fn();
    const { rerender } = await renderWithProviders(<PreJoinView {...makeProps({ onOpenSettings })} />);
    expect(screen.queryByRole('button', { name: 'Mở Cài đặt' })).toBeNull();

    await rerender(<PreJoinView {...makeProps({ micDenied: true, onOpenSettings })} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Mở Cài đặt' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('hàng "Âm thanh ra" hiện đường ra hiện tại và mở tấm chọn khi chạm', async () => {
    const props = await renderView({ audioRouteLabel: 'Loa ngoài' });

    expect(screen.getByText('Loa ngoài')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Âm thanh ra'));
    expect(props.onOpenAudioRoute).toHaveBeenCalledTimes(1);
  });
});

describe('PreJoinView — nút chính và nút phụ', () => {
  it('nút chính đúng nhãn cha đưa; bấm gọi onPrimary', async () => {
    const props = await renderView({ primaryLabel: 'Bắt đầu cuộc họp' });

    await fireEvent.press(screen.getByRole('button', { name: 'Bắt đầu cuộc họp' }));
    expect(props.onPrimary).toHaveBeenCalledTimes(1);
  });

  it('đang gửi: nút chính báo busy và KHÔNG gọi lại onPrimary', async () => {
    const props = await renderView({ primaryLabel: 'Xin vào', primaryLoading: true });

    const button = screen.getByRole('button', { name: 'Xin vào' });
    expect(button).toBeBusy();
    await fireEvent.press(button);
    expect(props.onPrimary).not.toHaveBeenCalled();
  });

  it('"Tham gia chỉ để nghe" chỉ hiện khi truyền handler', async () => {
    await renderView();
    expect(screen.queryByText('Tham gia chỉ để nghe')).toBeNull();
  });

  it('có handler: hiện nút phụ, bấm gọi onListenOnly, khoá khi nút chính đang gửi', async () => {
    const onListenOnly = jest.fn();
    const { rerender } = await renderWithProviders(<PreJoinView {...makeProps({ onListenOnly })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tham gia chỉ để nghe' }));
    expect(onListenOnly).toHaveBeenCalledTimes(1);

    await rerender(<PreJoinView {...makeProps({ onListenOnly, primaryLoading: true })} />);
    expect(screen.getByRole('button', { name: 'Tham gia chỉ để nghe' })).toBeDisabled();
  });
});

describe('PreJoinView — lỗi và ô tên', () => {
  it('lỗi mạng: Alert nêu lỗi + nút "Thử lại" gọi onRetry', async () => {
    const onRetry = jest.fn();
    await renderView({ error: 'Cần kết nối mạng để tham gia cuộc họp.', onRetry });

    expect(screen.getByText('Cần kết nối mạng để tham gia cuộc họp.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('không truyền onRetry thì lỗi không có nút "Thử lại"; không lỗi thì không có Alert', async () => {
    await renderView({ error: 'Lỗi máy chủ' });
    expect(screen.getByText('Lỗi máy chủ')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });

  it('ô tên hiện tên mặc định và báo mỗi lần gõ', async () => {
    const props = await renderView();

    const input = screen.getByDisplayValue('Nguyễn Văn A');
    expect(input.props.maxLength).toBe(80);
    await fireEvent.changeText(input, 'Lan');
    expect(props.onChangeName).toHaveBeenCalledWith('Lan');
  });

  it('nút quay lại của thanh trên gọi onClose', async () => {
    const props = await renderView();

    await fireEvent.press(screen.getByRole('button', { name: 'Quay lại' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
