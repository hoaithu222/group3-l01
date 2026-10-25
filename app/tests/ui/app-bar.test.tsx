import { render, userEvent } from '@testing-library/react-native';
import { type ReactElement } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { AppBar } from '@/shared/ui/navigation';

/**
 * ⚠️ Chỉ test HÀNH VI. `className` KHÔNG thành `style` trong Jest — xem
 * `docs/rules/testing.md`. Chiều cao thanh (54 + 8 + 56) không kiểm được ở đây;
 * nó phụ thuộc `insets.top` lúc chạy.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 *
 * ⛔ `AppBar` gọi `useSafeAreaInsets()`, mà hook đó NÉM LỖI khi không có
 * `SafeAreaProvider` bọc ngoài. Truyền `initialMetrics` để provider có số ngay
 * ở lần vẽ đầu — không có nó thì provider phải chờ `onLayout`, thứ không bao
 * giờ xảy ra trong môi trường test.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderAppBar(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

describe('AppBar', () => {
  it('hiện tiêu đề và phụ đề', async () => {
    const screen = await renderAppBar(
      <AppBar subtitle="Số dư khả dụng" title="Thông tin chuyển tiền" />,
    );

    expect(screen.getByText('Thông tin chuyển tiền')).toBeOnTheScreen();
    expect(screen.getByText('Số dư khả dụng')).toBeOnTheScreen();
  });

  /**
   * Nút quay lại chỉ có biểu tượng, không có chữ. Không có `accessibilityLabel`
   * thì TalkBack đọc ra "nút" — người dùng khiếm thị không biết nó làm gì, mà
   * đây lại là đường thoát duy nhất khỏi màn hình.
   */
  it('nút quay lại có nhãn a11y và gọi onBack', async () => {
    const onBack = jest.fn();
    const screen = await renderAppBar(<AppBar title="Chi tiết giao dịch" onBack={onBack} />);

    const back = screen.getByLabelText('Quay lại');
    expect(back).toBeOnTheScreen();

    await userEvent.press(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Không truyền `onBack` thì KHÔNG được vẽ nút. Màn gốc của một phân hệ
   * không có chỗ nào để lùi về; vẽ nút ở đó là bấm vào không có gì xảy ra và
   * người dùng kết luận app treo.
   */
  it('không vẽ nút quay lại khi không có onBack', async () => {
    const screen = await renderAppBar(<AppBar title="Trang chủ" />);

    expect(screen.queryByLabelText('Quay lại')).toBeNull();
  });

  it('vẽ nhóm nút bên phải', async () => {
    const screen = await renderAppBar(
      <AppBar actions={<Text>Trợ giúp</Text>} title="Thanh toán" />,
    );

    expect(screen.getByText('Trợ giúp')).toBeOnTheScreen();
  });

  /** Biến thể tiêu đề lớn vẫn phải hiện đúng chữ, chỉ khác chỗ đặt. */
  it('biến thể tiêu đề lớn vẫn hiện tiêu đề', async () => {
    const screen = await renderAppBar(<AppBar title="Cài đặt FaceID" variant="large" />);

    expect(screen.getByText('Cài đặt FaceID')).toBeOnTheScreen();
  });

  /**
   * `Type=Search` là 1 trong 3 `Type` của bản vẽ (`259:95973`): ô tìm kiếm
   * 267×48 ngồi vào đúng chỗ của tiêu đề, nút quay lại và nhóm nút phải giữ
   * nguyên. Ô nhập do nơi gọi truyền vào (`SearchInput` dùng chung) nên ở đây
   * chỉ kiểm rằng nó ĐƯỢC VẼ RA — dựng lại ô nhập trong `AppBar` là có hai ô
   * tìm kiếm phải sửa song song.
   */
  it('biến thể tìm kiếm vẽ ô tìm kiếm cạnh nút quay lại', async () => {
    const screen = await renderAppBar(
      <AppBar
        actions={<Text>Lọc</Text>}
        search={<Text>Ô tìm kiếm</Text>}
        variant="search"
        onBack={jest.fn()}
      />,
    );

    expect(screen.getByText('Ô tìm kiếm')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quay lại')).toBeOnTheScreen();
    expect(screen.getByText('Lọc')).toBeOnTheScreen();
  });

  /** Khe `search` chỉ thuộc về `variant="search"` — truyền nhầm thì bỏ qua, không vẽ chồng. */
  it('khe tìm kiếm không lọt vào biến thể thường', async () => {
    const screen = await renderAppBar(
      <AppBar search={<Text>Ô tìm kiếm</Text>} title="Danh sách giao dịch" />,
    );

    expect(screen.getByText('Danh sách giao dịch')).toBeOnTheScreen();
    expect(screen.queryByText('Ô tìm kiếm')).toBeNull();
  });
});
