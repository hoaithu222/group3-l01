import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { ActiveCallControls, type ActiveCallControlsProps } from '../components/ActiveCallControls';

beforeEach(() => jest.clearAllMocks());

/**
 * Điều khiển trong cuộc gọi: hàng bật/tắt + nút "Kết thúc" đứng riêng. ⚠️ Style của NativeWind không có trong Jest — chỉ kiểm HÀNH VI
 * (nhãn, callback, nút nào có ở loại cuộc gọi nào).
 */
function makeProps(over: Partial<ActiveCallControlsProps> = {}): ActiveCallControlsProps {
  return {
    cameraOn: false,
    micOn: true,
    onFlipCamera: jest.fn(),
    onHangUp: jest.fn(),
    onToggleCamera: jest.fn(),
    onToggleMic: jest.fn(),
    onToggleSpeaker: jest.fn(),
    speakerOn: false,
    video: false,
    ...over,
  };
}

const labelsOfButtons = () =>
  screen.getAllByRole('button').map((button) => button.props.accessibilityLabel as string);

describe('ActiveCallControls', () => {
  it('cuộc gọi thoại: mic · loa · kết thúc (không có camera/đổi camera)', async () => {
    await render(<ActiveCallControls {...makeProps()} />);
    expect(labelsOfButtons()).toEqual(['Tắt micro', 'Bật loa ngoài', 'Kết thúc cuộc gọi']);
  });

  it('cuộc gọi video: thêm camera + đổi camera, "Kết thúc" vẫn là nút CUỐI (không lẫn giữa các nút bật/tắt)', async () => {
    await render(<ActiveCallControls {...makeProps({ cameraOn: true, video: true })} />);
    const labels = labelsOfButtons();
    expect(labels).toHaveLength(5);
    expect(labels.at(-1)).toBe('Kết thúc cuộc gọi');
    expect(labels).toContain('Đổi camera trước/sau');
  });

  it('camera tắt thì "Đổi camera" bị khoá (không có track để đổi)', async () => {
    await render(<ActiveCallControls {...makeProps({ cameraOn: false, video: true })} />);
    expect(screen.getByLabelText('Đổi camera trước/sau')).toBeDisabled();
  });

  it('trạng thái mic/loa nói bằng CHỮ, và mỗi nút gọi đúng callback', async () => {
    const props = makeProps({ micOn: false, speakerOn: true });
    await render(<ActiveCallControls {...props} />);

    expect(screen.getByText('Bật mic')).toBeOnTheScreen();
    expect(screen.getByText('Loa ngoài')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Bật micro'));
    await fireEvent.press(screen.getByLabelText('Chuyển sang loa trong'));
    await fireEvent.press(screen.getByLabelText('Kết thúc cuộc gọi'));
    expect(props.onToggleMic).toHaveBeenCalledTimes(1);
    expect(props.onToggleSpeaker).toHaveBeenCalledTimes(1);
    expect(props.onHangUp).toHaveBeenCalledTimes(1);
  });

  it('rung phản hồi: bật/tắt = "đổi lựa chọn", Kết thúc = "chạm" — người đang nói thường không nhìn màn', async () => {
    const props = makeProps();
    await render(<ActiveCallControls {...props} />);

    await fireEvent.press(screen.getByLabelText('Tắt micro'));
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(props.onToggleMic).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Kết thúc cuộc gọi'));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(props.onHangUp).toHaveBeenCalledTimes(1);
  });
});
