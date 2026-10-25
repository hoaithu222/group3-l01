import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CameraPreview, type CameraPreviewProps } from '../../../components/prejoin/CameraPreview';
import { MicLevelMeter } from '../../../components/prejoin/MicLevelMeter';
import { PreJoinSummary } from '../../../components/prejoin/PreJoinSummary';
import { renderWithProviders } from './render-helpers';

/** Các mảnh của pre-join: khung xem trước (CHỈ có video khi camera bật), thanh mức mic (luôn có chữ), tóm tắt giờ họp. */

function previewProps(over: Partial<CameraPreviewProps> = {}): CameraPreviewProps {
  return {
    camOn: false,
    displayName: 'Lan',
    facing: 'front',
    onFlipCamera: jest.fn(),
    previewRef: null,
    renderVideo: jest.fn(() => <Text>VIDEO</Text>),
    ...over,
  };
}

describe('CameraPreview', () => {
  it('camera tắt: chỉ có avatar + chữ, KHÔNG vẽ video dù có previewRef; nút đổi camera ẨN (vô nghĩa khi không có hình)', async () => {
    const props = previewProps({ previewRef: { preview: true } });
    await renderWithProviders(<CameraPreview {...props} />);

    expect(screen.getByText('Camera đang tắt')).toBeOnTheScreen();
    expect(screen.getByText('Bật camera để xem trước hình của bạn.')).toBeOnTheScreen();
    expect(props.renderVideo).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Đổi camera trước hoặc sau' })).toBeNull();
  });

  it('nhãn tên trên khung là tên hiển thị hiện tại; tên rỗng thì không có nhãn', async () => {
    const { rerender } = await renderWithProviders(<CameraPreview {...previewProps({ displayName: '  Lan Anh ' })} />);
    expect(screen.getByText('Lan Anh')).toBeOnTheScreen();

    await rerender(<CameraPreview {...previewProps({ displayName: '   ' })} />);
    expect(screen.queryByText('Lan Anh')).toBeNull();
  });

  it('camera bật + có previewRef: vẽ video, lật gương camera trước, nói rõ đang dùng camera nào', async () => {
    const props = previewProps({ camOn: true, previewRef: { preview: true } });
    await renderWithProviders(<CameraPreview {...props} />);

    expect(screen.getByText('VIDEO')).toBeOnTheScreen();
    expect(props.renderVideo).toHaveBeenCalledWith({ preview: true }, { mirror: true, objectFit: 'cover' });
    expect(screen.getByText('Đang dùng camera trước.')).toBeOnTheScreen();
  });

  it('camera sau: không lật gương', async () => {
    const props = previewProps({ camOn: true, facing: 'back', previewRef: { preview: true } });
    await renderWithProviders(<CameraPreview {...props} />);

    expect(props.renderVideo).toHaveBeenCalledWith({ preview: true }, { mirror: false, objectFit: 'cover' });
    expect(screen.getByText('Đang dùng camera sau.')).toBeOnTheScreen();
  });

  it('bật nhưng chưa mở được camera: "Đang mở camera…", không vẽ video; đổi camera bấm được và gọi handler', async () => {
    const props = previewProps({ camOn: true });
    await renderWithProviders(<CameraPreview {...props} />);

    expect(screen.getByText('Đang mở camera…')).toBeOnTheScreen();
    expect(props.renderVideo).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Đổi camera trước hoặc sau' }));
    expect(props.onFlipCamera).toHaveBeenCalledTimes(1);
  });
});

describe('MicLevelMeter', () => {
  const now = () => screen.getByRole('progressbar').props.accessibilityValue.now as number;

  it('mic tắt: nhãn "Mic đang tắt" và mức 0 dù level còn giá trị cũ', async () => {
    await render(<MicLevelMeter level={80} micOn={false} />);

    expect(screen.getByText('Mic đang tắt')).toBeOnTheScreen();
    expect(now()).toBe(0);
  });

  it('mic bật: "Đang nghe" và mức theo level; ngoài khoảng/NaN được kẹp về 0..100', async () => {
    const { rerender } = await render(<MicLevelMeter level={50} micOn />);
    expect(screen.getByText('Đang nghe')).toBeOnTheScreen();
    expect(now()).toBe(50);

    await rerender(<MicLevelMeter level={250} micOn />);
    expect(now()).toBe(100);
    await rerender(<MicLevelMeter level={-5} micOn />);
    expect(now()).toBe(0);
    await rerender(<MicLevelMeter level={Number.NaN} micOn />);
    expect(now()).toBe(0);
  });
});

describe('PreJoinSummary', () => {
  it('tiêu đề + ngày + khoảng giờ; chỉ hiện "Đang diễn ra" khi cuộc họp đang LIVE', async () => {
    const { rerender } = await render(
      <PreJoinSummary endAt="2026-10-01T10:00:00.000Z" live={false} startAt="2026-10-01T09:00:00.000Z" title="Họp giao ban" />,
    );
    expect(screen.getByRole('header', { name: 'Họp giao ban' })).toBeOnTheScreen();
    expect(screen.getByText(/^\d{2}\/\d{2}\/2026 · \d{2}:\d{2} – \d{2}:\d{2}$/)).toBeOnTheScreen();
    expect(screen.queryByText('Đang diễn ra')).toBeNull();

    await rerender(<PreJoinSummary endAt="2026-10-01T10:00:00.000Z" live startAt="2026-10-01T09:00:00.000Z" title="Họp giao ban" />);
    expect(screen.getByText('Đang diễn ra')).toBeOnTheScreen();
  });
});
