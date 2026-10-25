import { render, userEvent, waitFor } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import {
  isHtmlTooltipContent,
  resolveTooltipLevel,
  Tooltip,
  TooltipSheet,
} from '@/shared/ui/tooltip';

/**
 * `useTooltipPosition()` đọc `useSafeAreaInsets()` để kẹp bong bóng trong vùng
 * an toàn. Không có provider thì gói ném "No safe area value available" ngay
 * lúc render. Số đo iPhone X — đúng khung mà bản thiết kế vẽ trên.
 */
const IPHONE_X_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE_X_METRICS}>{children}</SafeAreaProvider>;
}

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⚠️ `render()` của RNTL 14 phải `await`.
 *
 * ⛔ KHÔNG test được chỗ bong bóng hiện ra: `<Tooltip>` đo phần tử kích hoạt
 * bằng `measureInWindow()`, mà trong Jest ref của component gốc không có phương
 * thức đó (không có tầng native để đo). Đó cũng là lý do việc bong bóng đặt
 * đúng chỗ phải nghiệm thu bằng mắt trên máy thật. Phần kiểm được ở đây là:
 * trạng thái ĐÓNG mặc định, và luật chọn cấp hiển thị — chỗ sai thì im lặng.
 */
describe('Tooltip', () => {
  it('vẽ phần tử kích hoạt và KHÔNG vẽ sẵn bong bóng', async () => {
    const screen = await render(
      <Tooltip content="Phí chuyển tiền ngoài hệ thống">
        <Text>?</Text>
      </Tooltip>,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('?')).toBeOnTheScreen();
    expect(screen.queryByText('Phí chuyển tiền ngoài hệ thống')).toBeNull();
  });

  it('mô tả cho trình đọc màn hình biết bấm vào sẽ ra gì', async () => {
    const screen = await render(
      <Tooltip content="Giải thích ngắn">
        <Text>?</Text>
      </Tooltip>,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('button')).toBeOnTheScreen();
    expect(screen.getByHintText('Chạm để xem giải thích')).toBeOnTheScreen();
  });

  /**
   * ⛔ Đây là luật của bản thiết kế, không phải tuỳ chọn.
   *
   * Nội dung dài quá 4 dòng KHÔNG được nhét vào bong bóng — thiết kế bắt chuyển
   * sang bottom sheet. Không có test này thì một chuỗi dài từ backend làm bong
   * bóng cao gần hết màn hình, che mất chính con số mà nó đang giải thích.
   */
  it('báo cho nơi gọi khi nội dung vượt sức chứa bong bóng', async () => {
    const onExceedsBubble = jest.fn();
    const longContent = ['Dòng 1', 'Dòng 2', 'Dòng 3', 'Dòng 4', 'Dòng 5'].join('\n');

    const screen = await render(
      <Tooltip content={longContent} onExceedsBubble={onExceedsBubble}>
        <Text>?</Text>
      </Tooltip>,
      { wrapper: Wrapper },
    );

    await userEvent.press(screen.getByRole('button'));

    expect(onExceedsBubble).toHaveBeenCalledTimes(1);
  });

  it('không mở gì khi bị vô hiệu hoá', async () => {
    const onExceedsBubble = jest.fn();
    const screen = await render(
      <Tooltip content={'a\nb\nc\nd\ne'} disabled onExceedsBubble={onExceedsBubble}>
        <Text>?</Text>
      </Tooltip>,
      { wrapper: Wrapper },
    );

    await userEvent.press(screen.getByRole('button'));

    expect(onExceedsBubble).not.toHaveBeenCalled();
  });
});

describe('Ngưỡng nội dung tooltip', () => {
  it('phân cấp theo số ký tự đúng ghi chú thiết kế', () => {
    expect(resolveTooltipLevel('Ngắn gọn')).toBe(1);
    expect(resolveTooltipLevel('x'.repeat(57))).toBe(2);
    expect(resolveTooltipLevel('x'.repeat(176))).toBe(3);
  });

  /**
   * ⚠️ Đếm cả xuống dòng CỨNG chứ không chỉ đếm ký tự: bốn dòng ngắn viết tay
   * vẫn là bốn dòng. Chỉ đếm ký tự thì chúng lọt xuống cấp 1 và bong bóng cao
   * gấp đôi thiết kế cho phép.
   */
  it('đếm cả xuống dòng cứng', () => {
    expect(resolveTooltipLevel('a\nb\nc')).toBe(2);
    expect(resolveTooltipLevel('a\nb\nc\nd\ne')).toBe(3);
  });

  it('nhận ra nội dung HTML để mở màn riêng', () => {
    expect(isHtmlTooltipContent('<p>Điều khoản</p>')).toBe(true);
    // Dấu `<` đơn lẻ trong câu tiếng Việt KHÔNG phải HTML.
    expect(isHtmlTooltipContent('Áp dụng cho số tiền < 5 triệu')).toBe(false);
  });
});

/**
 * Tấm trượt của tooltip CẤP 3 (nội dung > 5 dòng).
 *
 * ⚠️ Chỉ test HÀNH VI. Vị trí, đệm và hoạt ảnh trượt không kiểm được ở tầng này
 * (NativeWind không biên dịch trong Jest, Reanimated chạy trên luồng UI).
 */
describe('TooltipSheet', () => {
  const BULLETS = ['Phí trong hệ thống: 0đ', 'Phí ngoài hệ thống: 3.300đ'];

  it('không dựng gì khi visible = false', async () => {
    const screen = await render(
      <TooltipSheet bullets={BULLETS} title="Biểu phí" visible={false} onClose={jest.fn()} />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByText('Biểu phí')).toBeNull();
  });

  it('dựng tiêu đề và toàn bộ gạch đầu dòng khi mở', async () => {
    const screen = await render(
      <TooltipSheet bullets={BULLETS} title="Biểu phí" visible onClose={jest.fn()}>
        <Text>Áp dụng từ 01/01</Text>
      </TooltipSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Biểu phí')).toBeOnTheScreen();
    expect(screen.getByText('Phí trong hệ thống: 0đ')).toBeOnTheScreen();
    expect(screen.getByText('Phí ngoài hệ thống: 3.300đ')).toBeOnTheScreen();
    expect(screen.getByText('Áp dụng từ 01/01')).toBeOnTheScreen();
  });

  /**
   * Tiêu đề phải được xướng là ĐẦU MỤC, nếu không người dùng TalkBack không
   * biết mình vừa lạc vào khối nội dung nào.
   */
  it('tiêu đề mang vai trò header cho trình đọc màn hình', async () => {
    const screen = await render(
      <TooltipSheet bullets={BULLETS} title="Biểu phí" visible onClose={jest.fn()} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('header', { name: 'Biểu phí' })).toBeOnTheScreen();
  });

  /**
   * ⚠️ `waitFor` là bắt buộc: từ khi dùng `useSheetTransition`, `onClose` chỉ
   * được gọi SAU khi tấm trượt hết xuống — gọi ngay thì `<Modal>` biến mất tức
   * thì và cú chạm trông như app đứng hình.
   */
  it('nút ✕ gọi onClose', async () => {
    const onClose = jest.fn();
    const screen = await render(
      <TooltipSheet bullets={BULLETS} title="Biểu phí" visible onClose={onClose} />,
      { wrapper: Wrapper },
    );

    // Có HAI phần tử mang nhãn "Đóng": [0] nền mờ (vẽ trước), [1] nút ✕ trên
    // tiêu đề. Không dùng `getByLabelText` được vì nó ném lỗi khi trùng nhãn.
    const closeButton = screen.getAllByLabelText('Đóng')[1];
    if (!closeButton) throw new Error('Thiếu nút ✕ trên tiêu đề tấm');

    await userEvent.press(closeButton);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('chạm nền mờ cũng đóng tấm', async () => {
    const onClose = jest.fn();
    const screen = await render(
      <TooltipSheet bullets={BULLETS} title="Biểu phí" visible onClose={onClose} />,
      { wrapper: Wrapper },
    );

    const backdrop = screen.getAllByLabelText('Đóng')[0];
    if (!backdrop) throw new Error('Thiếu nền mờ đóng được');

    await userEvent.press(backdrop);

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
