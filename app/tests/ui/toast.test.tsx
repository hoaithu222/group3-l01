import { act, render, userEvent } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { ToastHost } from '@/shared/ui/feedback/ToastHost';
import { useToastStore } from '@/shared/ui/feedback/toast-store';
import { showToast } from '@/shared/utils/toast.utils';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⚠️ `render()` của RNTL 14 phải `await`.
 *
 * Trọng tâm: `ToastHost` là phần HIỂN THỊ, còn `toast-store` là hạ tầng mà tầng
 * gọi API đã dùng từ trước khi có bộ component. Test ở đây đi qua lối vào công
 * khai (`showToast()`) để nếu ai đó thay phần hiển thị mà làm gãy đường dây từ
 * interceptor axios tới màn hình thì test đỏ ngay.
 */

/**
 * `useSafeAreaInsets()` bình thường đọc số đo từ tầng native — không có trong
 * Jest, và thiếu provider thì gói ném "No safe area value available". Bọc bằng
 * `SafeAreaProvider` + `initialMetrics` (số đo iPhone X, đúng khung mà bản
 * thiết kế vẽ trên) là cách chính thức để test không cần tầng native.
 */
const IPHONE_X_METRICS: Metrics = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function Wrapper({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE_X_METRICS}>{children}</SafeAreaProvider>;
}

describe('ToastHost', () => {
  /**
   * ⛔ Phải dọn CẢ TRƯỚC lẫn SAU mỗi test.
   *
   * `clear()` huỷ luôn các hẹn giờ tự tắt 5 giây. Không dọn thì Jest treo ở
   * cuối lượt chạy ("Jest did not exit…") vì còn `setTimeout` sống, và cửa sổ
   * chống trùng nội dung của kho còn nhớ toast của test trước — test sau bắn
   * cùng một câu sẽ bị nuốt và đỏ một cách khó hiểu.
   *
   * ⛔ ĐỪNG bọc `act()` quanh mấy dòng này. Ở đây chưa có cây React nào được
   * mount, và `act()` gọi lúc "rỗng" làm hỏng hàng đợi act của React: MỌI
   * `render()` sau đó trả về cây RỖNG, mọi truy vấn báo "Unable to find an
   * element" — trong khi component hoàn toàn đúng. Mất khá lâu mới lần ra.
   * Kho là store thuần TypeScript, đổi state ngoài cây React nên không cần act.
   */
  beforeEach(() => {
    useToastStore.getState().clear();
  });

  /**
   * ⛔ Chỗ này thì NGƯỢC LẠI: phải bọc `act()`.
   *
   * Jest chạy `afterEach` theo thứ tự NGƯỢC với lúc khai, mà dọn dẹp tự động
   * của RNTL được khai lúc import (tức là sớm nhất) nên nó chạy SAU cùng. Hệ
   * quả: lúc dòng dưới chạy, cây React vẫn còn mount — đổi state kho ngoài
   * `act()` ở đó làm React in cảnh báo "not wrapped in act(...)". Cảnh báo đó
   * không làm đỏ test, nhưng nó che mất cảnh báo THẬT về sau.
   */
  afterEach(async () => {
    await act(async () => {
      useToastStore.getState().clear();
    });
  });

  it('không vẽ gì khi không có toast nào', async () => {
    const screen = await render(<ToastHost />, { wrapper: Wrapper });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hiện thông điệp bắn từ showToast()', async () => {
    const screen = await render(<ToastHost />, { wrapper: Wrapper });

    await act(async () => showToast('success', 'Lưu danh bạ thành công'));

    expect(screen.getByText('Lưu danh bạ thành công')).toBeOnTheScreen();
  });

  /**
   * ⛔ Toast tự tắt sau 5 giây và không có thao tác nào của người dùng gọi nó
   * lên. Thiếu `accessibilityRole="alert"` + `accessibilityLiveRegion` thì trên
   * Android nó hiện ra HOÀN TOÀN IM LẶNG: người dùng khiếm thị không biết giao
   * dịch vừa thành công hay vừa lỗi, và lúc họ dò tới nơi thì toast đã tắt.
   */
  it('đọc được cho trình đọc màn hình', async () => {
    const screen = await render(<ToastHost />, { wrapper: Wrapper });

    await act(async () => showToast('error', 'Giao dịch thất bại'));

    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  /**
   * ⛔ Role `alert` phải nằm ở khối THÔNG BÁO, không phải ở vùng CHẠM.
   *
   * Role `alert` báo với trình đọc màn hình rằng đây là nội dung, không phải
   * điều khiển — gắn nó lên `Pressable` thì TalkBack không đọc "nhấn đúp để
   * kích hoạt", và `accessibilityHint` đứng một mình trên phần tử không có role
   * tương tác thường bị bỏ qua hẳn. Test này khoá đúng chỗ đặt: phần tử mang
   * role `alert` cũng phải mang vùng đọc động, và KHÔNG được là một cái nút.
   */
  it('đặt vùng đọc động ở khối thông báo, không ở vùng chạm', async () => {
    const screen = await render(<ToastHost />, { wrapper: Wrapper });

    await act(async () => showToast('warning', 'Sắp hết hạn mức'));
    const block = screen.getByRole('alert');

    expect(block.props.accessibilityLiveRegion).toBe('polite');
    expect(block.props.accessibilityRole).not.toBe('button');
  });

  /**
   * Bản thiết kế cho nút ✕ là TUỲ CHỌN, còn ở đây CẢ dòng toast là vùng bấm để
   * đóng — trên di động đó là vùng chạm rộng hơn nút ✕ 24dp rất nhiều. ⚠️ Ca
   * này cũng canh việc tách role ở test trên không làm mất khả năng chạm.
   */
  it('chạm vào toast thì đóng nó', async () => {
    const screen = await render(<ToastHost />, { wrapper: Wrapper });

    await act(async () => showToast('info', 'Đang xử lý'));
    await userEvent.press(screen.getByRole('alert'));

    expect(screen.queryByText('Đang xử lý')).toBeNull();
  });

  /**
   * ⛔ Nút hành động là lý do duy nhất khiến toast khác một dòng chữ trôi qua.
   *
   * Ca dùng chính là "Đã xoá — Hoàn tác": người dùng lỡ tay xoá người thụ hưởng
   * và có đúng 5 giây để lấy lại. Bản vẽ có sẵn `_button toast` (259:97863, ghim
   * phải) nhưng để `hidden` — tức là một công tắc, không phải phần cố định.
   * Test khoá cả hai nửa: nút hiện đúng nhãn, VÀ bấm nó thì hành động chạy rồi
   * toast biến mất (để nguyên là mời người ta bấm "Hoàn tác" lần thứ hai vào
   * một việc đã hoàn tác rồi).
   */
  it('bấm nút hành động thì chạy hành động và đóng toast', async () => {
    const undo = jest.fn();
    const screen = await render(<ToastHost />, { wrapper: Wrapper });

    await act(async () => {
      useToastStore.getState().show('success', 'Đã xoá người thụ hưởng', {
        action: { label: 'Hoàn tác', onPress: undo },
      });
    });
    await userEvent.press(screen.getByRole('button', { name: 'Hoàn tác' }));

    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Đã xoá người thụ hưởng')).toBeNull();
  });

  /**
   * Ghi chú thiết kế (259:97843, nguyên văn): toast "biến mất sau một khoảng
   * thời gian ngắn (5 giây), hoặc người dùng có thể sử dụng action Đóng (x)
   * (nếu có)". ⚠️ "Nếu có" — nên ✕ phải TẮT theo mặc định: vẽ nó ở mọi toast là
   * thêm một nút cho thứ mà chạm chỗ nào cũng đóng được.
   */
  it('chỉ vẽ nút ✕ khi được bật', async () => {
    const screen = await render(<ToastHost />, { wrapper: Wrapper });

    await act(async () => showToast('info', 'Không có nút đóng'));
    expect(screen.queryByRole('button', { name: 'Đóng thông báo' })).toBeNull();

    await act(async () => {
      useToastStore.getState().show('info', 'Có nút đóng', { dismissible: true });
    });
    await userEvent.press(screen.getByRole('button', { name: 'Đóng thông báo' }));

    expect(screen.queryByText('Có nút đóng')).toBeNull();
  });

  /**
   * Một thao tác của người dùng thường bắn nhiều request song song (màn hình có
   * 3 thẻ dữ liệu = 3 query). Mất mạng thì cả 3 cùng hỏng cùng lúc — không gộp
   * thì người dùng thấy ba dòng "Không có kết nối mạng" chồng lên nhau, trông
   * như app đang lỗi nặng trong khi chỉ là rớt Wi-Fi.
   */
  it('gộp các toast trùng nội dung bắn liên tiếp', async () => {
    const screen = await render(<ToastHost />, { wrapper: Wrapper });

    await act(async () => {
      showToast('error', 'Không có kết nối mạng');
      showToast('error', 'Không có kết nối mạng');
      showToast('error', 'Không có kết nối mạng');
    });

    expect(screen.getAllByText('Không có kết nối mạng')).toHaveLength(1);
  });
});
