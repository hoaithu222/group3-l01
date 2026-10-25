import { render } from '@testing-library/react-native';

import { PresenceDot, type PresenceDotState } from '@/shared/ui/presence-dot';

/**
 * `PresenceDot` (p1-02, dùng ở 6 chỗ) chưa có test — p0-12 SHL-07: mỗi primitive có nhãn trợ năng bằng CHỮ (màu không phải dấu hiệu
 * duy nhất). Chỉ test HÀNH VI (NativeWind không có trong Jest); `render()` của RNTL 14 phải `await`.
 */
describe('PresenceDot', () => {
  it.each<[PresenceDotState, string]>([
    ['ONLINE', 'Đang hoạt động'],
    ['IDLE', 'Vắng mặt'],
    ['DND', 'Không làm phiền'],
    ['OFFLINE', 'Ngoại tuyến'],
    // Người ngoài không phân biệt được ai đang cố ý ẩn với ai thật sự ngoại tuyến.
    ['HIDDEN', 'Ngoại tuyến'],
  ])('%s ⇒ nhãn "%s" cho trình đọc màn hình', async (state, label) => {
    const screen = await render(<PresenceDot state={state} />);

    expect(screen.getByLabelText(label)).toBeOnTheScreen();
  });

  it('mặc định chỉ có chấm (không chữ nhìn thấy) — danh sách dày đặc không bị chữ đè', async () => {
    const screen = await render(<PresenceDot state="ONLINE" />);

    expect(screen.queryByText('Đang hoạt động')).toBeNull();
  });

  it('showLabel ⇒ hiện thêm CHỮ cho màn chi tiết', async () => {
    const screen = await render(<PresenceDot showLabel state="DND" />);

    expect(screen.getByText('Không làm phiền')).toBeOnTheScreen();
  });
});
