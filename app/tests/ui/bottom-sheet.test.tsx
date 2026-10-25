import { type ReactNode } from 'react';
import { Text } from 'react-native';
import { render, userEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BottomSheet, ConfirmSheet, SheetActions } from '@/shared/ui/bottom-sheet';

/**
 * ⛔ Bắt buộc. `react-native-keyboard-controller` gọi thẳng xuống module native
 * ngay lúc NẠP MODULE (nó dựng `NativeEventEmitter` ở tầng trên cùng), nên
 * không mock thì cả suite chết với "the package doesn't seem to be linked" —
 * trước cả khi có component nào được render. Gói có sẵn bản mock chính thức.
 *
 * ⚠️ Viết SAU phần `import` vẫn đúng: `babel-plugin-jest-hoist` nâng mọi lời
 * gọi `jest.mock` lên trên các import khi biên dịch. Đặt trước import thì
 * `import/first` của ESLint báo lỗi.
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

/**
 * ⛔ `useSafeAreaInsets()` NÉM LỖI khi không có provider bọc ngoài — trong app
 * thật `SafeAreaProvider` nằm ở `AppProviders`. `initialMetrics` là bắt buộc:
 * trong Jest không có tầng native nào đo được, thiếu nó thì hook trả về mãi
 * `null` và component không bao giờ render xong.
 *
 * Số đo lấy của iPhone X: 44 trên, 34 dưới — đúng ca mà đệm đáy phải cộng thêm.
 */
const METRICS = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 44, left: 0, right: 0, bottom: 34 },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

/**
 * ⚠️ Style của NativeWind KHÔNG có trong test (Jest không chạy Metro nên
 * Tailwind không được biên dịch — xem `tests/shared/rendering.test.tsx`). Nên
 * ở đây chỉ kiểm HÀNH VI: mở/đóng, callback, nhãn cho trình đọc màn hình.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`.
 */
describe('BottomSheet', () => {
  it('không dựng nội dung khi visible = false', async () => {
    const screen = await render(
      <BottomSheet title="Chọn tài khoản" visible={false} onClose={jest.fn()}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.queryByText('Nội dung tấm')).toBeNull();
  });

  it('dựng tiêu đề và nội dung khi visible = true', async () => {
    const screen = await render(
      <BottomSheet title="Chọn tài khoản" visible onClose={jest.fn()}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Chọn tài khoản')).toBeOnTheScreen();
    expect(screen.getByText('Nội dung tấm')).toBeOnTheScreen();
  });

  /**
   * Ghi chú thiết kế: "Chạm vùng ngoài hoặc close/indicator để tắt bottom
   * sheet". Nền mờ là đường thoát mà người dùng thử ĐẦU TIÊN.
   *
   * ⚠️ `waitFor` là bắt buộc: `onClose` chỉ được gọi SAU khi tấm trượt hết
   * xuống (xem `useSheetTransition`) — gọi ngay thì `<Modal>` biến mất tức thì
   * và cú chạm trông như app đứng hình.
   */
  it('gọi onClose khi bấm nền mờ', async () => {
    const onClose = jest.fn();
    // Không truyền `title` ⇒ không có nút ✕, nên nhãn "Đóng" duy nhất trên cây
    // chính là nền mờ. Rõ ràng hơn hẳn việc lấy phần tử thứ nhất trong hai.
    const screen = await render(
      <BottomSheet visible onClose={onClose}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    await userEvent.press(screen.getByLabelText('Đóng'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('nền mờ KHÔNG còn là nút khi dismissOnBackdrop = false', async () => {
    const screen = await render(
      <BottomSheet dismissOnBackdrop={false} visible onClose={jest.fn()}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    // Nền mờ phải mất hẳn vai trò nút, không phải chỉ vô hiệu hoá: nếu không
    // trình đọc màn hình vẫn đọc ra một nút "Đóng" mà bấm vào chẳng có gì xảy ra.
    expect(screen.queryByLabelText('Đóng')).toBeNull();
  });

  it('gọi onClose khi bấm nút ✕ trên tiêu đề', async () => {
    const onClose = jest.fn();
    const screen = await render(
      <BottomSheet dismissOnBackdrop={false} title="Chọn tài khoản" visible onClose={onClose}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    await userEvent.press(screen.getByLabelText('Đóng'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  /**
   * Nút ✕ chỉ có hình vẽ, không có chữ — thiếu `accessibilityLabel` thì
   * TalkBack đọc là "nút" và người dùng khiếm thị không có cách nào đóng tấm.
   */
  it('nút đóng có nhãn cho trình đọc màn hình', async () => {
    const screen = await render(
      <BottomSheet dismissOnBackdrop={false} title="Chọn tài khoản" visible onClose={jest.fn()}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByLabelText('Đóng')).toBeOnTheScreen();
  });

  it('không dựng nút ✕ khi không có tiêu đề — lúc đó tấm đóng bằng thanh kéo', async () => {
    const screen = await render(
      <BottomSheet dismissOnBackdrop={false} visible onClose={jest.fn()}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.queryByLabelText('Đóng')).toBeNull();
  });

  it('dựng vùng nút cố định ở đáy khi có footer', async () => {
    const screen = await render(
      <BottomSheet footer={<Text>Tiếp tục</Text>} title="Điều khoản" visible onClose={jest.fn()}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Tiếp tục')).toBeOnTheScreen();
  });

  /**
   * Ba slot của `header bottom sheet` trong Figma (`Support text` · `search bar`
   * · `Alert`). Chúng phải nằm NGOÀI `ScrollView`: ô tìm kiếm cuộn theo danh
   * sách là đúng thứ bản thiết kế không cho phép, và người dùng cuộn tới giữa
   * danh sách thì không còn thấy ô lọc đâu nữa.
   */
  it('dựng mô tả, ô tìm kiếm và alert trong phần đầu tấm', async () => {
    const screen = await render(
      <BottomSheet
        alert={<Text>Số dư khả dụng đã trừ phí</Text>}
        description="Chọn ngân hàng thụ hưởng"
        scrollable
        search={<Text>Ô tìm kiếm</Text>}
        title="Chọn ngân hàng"
        visible
        onClose={jest.fn()}
      >
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Chọn ngân hàng thụ hưởng')).toBeOnTheScreen();
    expect(screen.getByText('Ô tìm kiếm')).toBeOnTheScreen();
    expect(screen.getByText('Số dư khả dụng đã trừ phí')).toBeOnTheScreen();
  });

  /**
   * ⚠️ Chỉ kiểm được là ba slot KHÔNG dựng gì khi không truyền — hình thức
   * (đệm, khe) không kiểm được trong Jest vì NativeWind không biên dịch.
   */
  it('không dựng slot nào của phần đầu khi nơi gọi không truyền', async () => {
    const screen = await render(
      <BottomSheet title="Chọn ngân hàng" visible onClose={jest.fn()}>
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.queryByText('Chọn ngân hàng thụ hưởng')).toBeNull();
    expect(screen.getByText('Chọn ngân hàng')).toBeOnTheScreen();
  });

  /**
   * `padded={false}` là cách duy nhất dựng được 4 `Type` dạng danh sách của
   * Figma (row 375×56, khe 0, tràn hết viền). Test giữ phần kiểm được: bật/tắt
   * đệm KHÔNG làm mất nội dung — đệm thật thì phải nghiệm thu bằng mắt.
   */
  it('vẫn dựng đủ nội dung khi tắt đệm mặc định của vùng nội dung', async () => {
    const screen = await render(
      <BottomSheet
        bodyClassName="pb-md"
        padded={false}
        title="Chọn tỉnh"
        visible
        onClose={jest.fn()}
      >
        <Text>Hà Nội</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Hà Nội')).toBeOnTheScreen();
  });

  /**
   * Ghi chú thiết kế: khi tấm chạm trần 742px thì phần đầu và phần đáy ĐỨNG
   * YÊN, chỉ giữa cuộn. Test giữ đúng phần kiểm được ở tầng này: bật cuộn thì
   * cả ba khối vẫn có mặt (nội dung KHÔNG nuốt mất tiêu đề hay vùng nút).
   */
  it('giữ đủ tiêu đề, nội dung và vùng nút khi bật scrollable', async () => {
    const screen = await render(
      <BottomSheet
        footer={<Text>Đồng ý</Text>}
        scrollable
        title="Điều khoản"
        visible
        onClose={jest.fn()}
      >
        <Text>Nội dung tấm</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Điều khoản')).toBeOnTheScreen();
    expect(screen.getByText('Nội dung tấm')).toBeOnTheScreen();
    expect(screen.getByText('Đồng ý')).toBeOnTheScreen();
  });

  /**
   * Tìm khối mang `minHeight` — đó là thẻ TẤM. Số này là `style` NỘI TUYẾN
   * (phụ thuộc `insets` và `useWindowDimensions` lúc chạy) nên Jest đọc được,
   * khác hẳn class NativeWind.
   */
  function sheetStyle(node: unknown): Record<string, unknown> | null {
    if (!node || typeof node !== 'object') return null;
    const current = node as { children?: unknown[] | null; props?: { style?: unknown } };
    for (const entry of [current.props?.style].flat(Infinity)) {
      if (entry && typeof entry === 'object' && 'minHeight' in entry) {
        return entry as Record<string, unknown>;
      }
    }
    for (const child of current.children ?? []) {
      const found = sheetStyle(child);
      if (found) return found;
    }
    return null;
  }

  /**
   * ⛔ Figma ghi HAI mốc chiều cao tối thiểu, không phải một: **229** cho tấm
   * dạng list THÔNG TIN (`padded` mặc định) và **200** cho tấm dạng list THAO
   * TÁC/CHỨC NĂNG (`padded={false}`, tức các tấm tràn viền như `SelectSheet`).
   * Khoá cứng một số cho cả hai là một trong hai kiểu tấm luôn sai bản vẽ.
   */
  it('chiều cao tối thiểu theo đúng hai mốc của bản vẽ', async () => {
    const info = await render(
      <BottomSheet title="Chi tiết" visible onClose={jest.fn()}>
        <Text>Nội dung</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(sheetStyle(info.toJSON())?.minHeight).toBe(229);
  });

  it('tấm tràn viền lấy mốc 200 của bản vẽ', async () => {
    const list = await render(
      <BottomSheet padded={false} title="Chọn tỉnh" visible onClose={jest.fn()}>
        <Text>Hà Nội</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(sheetStyle(list.toJSON())?.minHeight).toBe(200);
  });

  /** Bản vẽ của màn nói khác thì nơi gọi vẫn đè được. */
  it('prop minHeight đè được mốc suy từ biến thể', async () => {
    const custom = await render(
      <BottomSheet minHeight={320} title="Chi tiết" visible onClose={jest.fn()}>
        <Text>Nội dung</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(sheetStyle(custom.toJSON())?.minHeight).toBe(320);
  });

  /**
   * ⛔ Đệm đáy là CỘNG chứ không phải `Math.max`: Figma chừa 16dp THÊM vào trên
   * vùng vạch gạt ngang (nút kết thúc y=60, Home Indicator y=76). Với
   * `Math.max`, iPhone (inset 34) cho đúng 34 và nút dính sát vạch — chỗ mà hệ
   * điều hành nuốt cú chạm để làm cử chỉ vuốt về màn chính.
   */
  it('đệm đáy cộng thêm 16dp trên vùng an toàn', async () => {
    const screen = await render(
      <BottomSheet title="Chi tiết" visible onClose={jest.fn()}>
        <Text>Nội dung</Text>
      </BottomSheet>,
      { wrapper: Wrapper },
    );

    expect(sheetStyle(screen.toJSON())?.paddingBottom).toBe(METRICS.insets.bottom + 16);
  });
});

/**
 * Hàng nút đáy tấm. Chỉ kiểm HÀNH VI: thứ tự đọc (phụ trước – chính sau ở hàng ngang, chính trước ở cột dọc — đúng thứ tự
 * trình đọc màn hình duyệt), callback, và cờ `busy` khi đang gửi. Bề rộng chia đôi là class ⇒ nghiệm thu bằng mắt.
 */
describe('SheetActions', () => {
  it('hàng ngang: nút phụ đứng trước nút chính, bấm gọi đúng callback', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const screen = await render(
      <SheetActions
        primary={{ label: 'Rời nhóm', onPress: onConfirm }}
        secondary={{ label: 'Huỷ', onPress: onCancel }}
        tone="danger"
      />,
    );

    const labels = screen.getAllByRole('button').map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual(['Huỷ', 'Rời nhóm']);

    await userEvent.press(screen.getByRole('button', { name: 'Rời nhóm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cột dọc: nút chính lên trước', async () => {
    const screen = await render(
      <SheetActions
        layout="column"
        primary={{ label: 'Lưu thay đổi', onPress: jest.fn() }}
        secondary={{ label: 'Để sau', onPress: jest.fn() }}
      />,
    );

    const labels = screen.getAllByRole('button').map((node) => node.props.accessibilityLabel);
    expect(labels).toEqual(['Lưu thay đổi', 'Để sau']);
  });

  it('đang gửi thì nút chính báo busy và không nhận chạm', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <SheetActions
        hint="Không hoàn tác được"
        primary={{ label: 'Xoá', loading: true, onPress: onConfirm }}
      />,
    );

    expect(screen.getByText('Không hoàn tác được')).toBeOnTheScreen();
    const button = screen.getByRole('button', { name: 'Xoá' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await userEvent.press(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('ConfirmSheet', () => {
  it('dựng tiêu đề (vai header), mô tả và hai nút; xác nhận gọi onConfirm', async () => {
    const onConfirm = jest.fn();
    const screen = await render(
      <ConfirmSheet
        confirmLabel="Rời nhóm"
        description="Bạn sẽ không nhận tin nhắn mới."
        icon="logout"
        title="Rời nhóm này?"
        tone="danger"
        visible
        onClose={jest.fn()}
        onConfirm={onConfirm}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('header', { name: 'Rời nhóm này?' })).toBeOnTheScreen();
    expect(screen.getByText('Bạn sẽ không nhận tin nhắn mới.')).toBeOnTheScreen();

    await userEvent.press(screen.getByRole('button', { name: 'Rời nhóm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('nút Huỷ đóng tấm', async () => {
    const onClose = jest.fn();
    const screen = await render(
      <ConfirmSheet
        confirmLabel="Xoá"
        title="Xoá thẻ?"
        visible
        onClose={onClose}
        onConfirm={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    await userEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('đang gửi thì nút Huỷ bị khoá (huỷ giữa chừng là đóng tấm mà việc vẫn xảy ra)', async () => {
    const busy = await render(
      <ConfirmSheet
        confirmLabel="Xoá"
        loading
        title="Xoá thẻ?"
        visible
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
      { wrapper: Wrapper },
    );
    expect(busy.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
  });

  it('hiện lỗi từ máy chủ khi có error', async () => {
    const screen = await render(
      <ConfirmSheet
        confirmLabel="Rời nhóm"
        error="Bạn là chủ nhóm duy nhất."
        title="Rời nhóm này?"
        visible
        onClose={jest.fn()}
        onConfirm={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Bạn là chủ nhóm duy nhất.')).toBeOnTheScreen();
  });
});
