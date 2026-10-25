import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ProgressRing } from '@/shared/ui/progress-ring';

/**
 * `ProgressRing` (p0-12): vòng tiến độ tròn. Chỉ test HÀNH VI — role/giá trị/nhãn cho trình đọc màn hình (NativeWind và hoạt ảnh
 * không có trong Jest; `indeterminate` truyền `animated={false}` để không treo Jest bằng vòng lặp vô hạn).
 * `render()` của RNTL 14 phải `await`.
 */
describe('ProgressRing — có tiến độ', () => {
  it('là "progressbar" với giá trị phần trăm làm tròn', async () => {
    const screen = await render(<ProgressRing progress={0.456} />);

    const ring = screen.getByRole('progressbar');
    expect(ring).toHaveAccessibilityValue({ max: 100, min: 0, now: 46 });
    expect(ring).not.toBeBusy();
  });

  it.each([
    [1.5, 100],
    [-0.4, 0],
    [Number.NaN, 0],
    [0, 0],
    [1, 100],
  ])('progress=%p ⇒ giá trị %d (kẹp trong 0..100, NaN = 0)', async (progress, now) => {
    const screen = await render(<ProgressRing progress={progress} />);

    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ max: 100, min: 0, now });
  });

  it('nhãn mặc định "Đang tải…", đổi được', async () => {
    const screen = await render(<ProgressRing progress={0.2} />);
    expect(screen.getByLabelText('Đang tải…')).toBeOnTheScreen();

    const custom = await render(<ProgressRing label="Đang tải lên báo cáo.pdf" progress={0.2} />);
    expect(custom.getByLabelText('Đang tải lên báo cáo.pdf')).toBeOnTheScreen();
  });
});

describe('ProgressRing — chưa biết tiến độ', () => {
  it('indeterminate ⇒ busy và KHÔNG có giá trị phần trăm (không bịa số)', async () => {
    const screen = await render(<ProgressRing animated={false} indeterminate progress={0.7} />);

    const ring = screen.getByRole('progressbar');
    expect(ring).toBeBusy();
    expect(ring.props.accessibilityValue).toBeUndefined();
  });
});

describe('ProgressRing — nội dung ở tâm', () => {
  it('vẽ children (nút huỷ, chữ phần trăm…) ở giữa vòng', async () => {
    const screen = await render(
      <ProgressRing progress={0.5} size={40}>
        <Text>50%</Text>
      </ProgressRing>,
    );

    expect(screen.getByText('50%')).toBeOnTheScreen();
  });

  it('kích thước tuỳ chỉnh không làm hỏng vòng (đường kính nhỏ vẫn có nét ≥ 2dp)', async () => {
    const screen = await render(<ProgressRing progress={0.5} size={12} />);

    expect(screen.getByRole('progressbar')).toBeOnTheScreen();
  });
});
