import { render } from '@testing-library/react-native';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { type ReactElement } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

/**
 * ⚠️ Chỉ test HÀNH VI. Dải chuyển màu đầu màn (20% chiều cao, `header-from`)
 * KHÔNG kiểm được ở đây — `className` không thành `style` trong Jest, xem
 * `docs/rules/testing.md`.
 *
 * ⛔ `Screen` gọi `useSafeAreaInsets()`, hook đó NÉM LỖI khi không có
 * `SafeAreaProvider`. `initialMetrics` để provider có số ngay ở lần vẽ đầu.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen(ui: ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

/** RNTL 14 đã bỏ `UNSAFE_getAllByProps`, nên tự duyệt cây JSON đã render. */
type JsonNode = { children?: unknown[] | null; props?: Record<string, unknown> } | null;

function findByProp(node: unknown, key: string, value: unknown): JsonNode {
  if (!node || typeof node !== 'object') return null;
  const current = node as { children?: unknown[] | null; props?: Record<string, unknown> };
  if (current.props?.[key] === value) return current;
  for (const child of current.children ?? []) {
    const found = findByProp(child, key, value);
    if (found) return found;
  }
  return null;
}

/**
 * Tìm node ĐẦU TIÊN có mang một prop tên `key` (bất kể giá trị) và trả về cả
 * bộ props của nó. Cần cho `refreshControl`: giá trị của nó là một PHẦN TỬ
 * React, không so sánh bằng `===` với thứ gì viết ra được trong test.
 */
function findPropsWithKey(node: unknown, key: string): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const current = node as { children?: unknown[] | null; props?: Record<string, unknown> };
  if (current.props && key in current.props) return current.props;
  for (const child of current.children ?? []) {
    const found = findPropsWithKey(child, key);
    if (found) return found;
  }
  return null;
}

/** `style` của React Native có thể là object, mảng, hoặc mảng lồng mảng. */
function flattenStyle(value: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    for (const entry of value) flattenStyle(entry, out);
    return;
  }
  if (value && typeof value === 'object') out.push(value as Record<string, unknown>);
}

/**
 * Gom mọi `paddingBottom` > 0 trong cây đã render.
 *
 * ⚠️ Đây là một trong số ít thứ về BỐ CỤC kiểm được trong Jest: nó là style NỘI
 * TUYẾN (`insets.bottom` chỉ biết lúc chạy) chứ không phải class, mà class thì
 * NativeWind không biên dịch trong Jest — xem `docs/rules/testing.md`.
 */
function collectPaddingBottom(node: unknown, found: number[] = []): number[] {
  if (!node || typeof node !== 'object') return found;
  const current = node as { children?: unknown[] | null; props?: Record<string, unknown> };

  const styles: Record<string, unknown>[] = [];
  flattenStyle(current.props?.style, styles);
  flattenStyle(current.props?.contentContainerStyle, styles);
  for (const style of styles) {
    if (typeof style.paddingBottom === 'number' && style.paddingBottom > 0) {
      found.push(style.paddingBottom);
    }
  }

  for (const child of current.children ?? []) collectPaddingBottom(child, found);
  return found;
}

describe('Screen', () => {
  it('vẽ nội dung, thanh tiêu đề và thanh đáy', async () => {
    const screen = await renderScreen(
      <Screen footer={<Text>Tiếp tục</Text>} header={<Text>Chuyển tiền</Text>}>
        <Text>Nội dung màn hình</Text>
      </Screen>,
    );

    expect(screen.getByText('Chuyển tiền')).toBeOnTheScreen();
    expect(screen.getByText('Nội dung màn hình')).toBeOnTheScreen();
    expect(screen.getByText('Tiếp tục')).toBeOnTheScreen();
  });

  it('vẽ được khi tắt cuộn và tắt dải màu', async () => {
    const screen = await renderScreen(
      <Screen gradient={false} padded={false} scrollable={false}>
        <Text>Danh sách sát mép</Text>
      </Screen>,
    );

    expect(screen.getByText('Danh sách sát mép')).toBeOnTheScreen();
  });

  /**
   * Dải màu phủ lên 20% trên cùng của màn — tức là phủ lên cả thanh tiêu đề.
   * Không chặn cú chạm thì nút "Quay lại" của `AppBar` nằm DƯỚI nó và bấm không
   * ăn: một lỗi chỉ lộ ra trên máy thật, không lộ ra trong ảnh chụp thiết kế.
   */
  it('dải màu không ăn cú chạm và im lặng với trình đọc màn hình', async () => {
    const screen = await renderScreen(
      <Screen>
        <Text>Nội dung</Text>
      </Screen>,
    );

    const decoration = findByProp(screen.toJSON(), 'pointerEvents', 'none');

    expect(decoration).not.toBeNull();
    expect(decoration?.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });

  /**
   * ⛔ Vùng an toàn đáy chỉ được cộng ĐÚNG MỘT LẦN.
   *
   * `<Screen footer={<BottomActionBar/>}>` là cách ghép tự nhiên nhất của cặp
   * component này. Trước đây cả hai cùng cộng `insets.bottom` ⇒ 34 + 34 = **68dp**
   * trống dưới nút trên iPhone (bản vẽ chỉ có 16 + 21). Nay `Screen` không đệm
   * khe `footer` nữa; nơi chịu trách nhiệm là chính thanh đáy.
   */
  it('footer không cộng đúp vùng an toàn đáy', async () => {
    const screen = await renderScreen(
      <Screen
        footer={
          <BottomActionBar>
            <Text>Xác nhận</Text>
          </BottomActionBar>
        }
      >
        <Text>Nội dung</Text>
      </Screen>,
    );

    expect(collectPaddingBottom(screen.toJSON())).toEqual([METRICS.insets.bottom]);
  });

  /** Không có footer thì chính vùng nội dung phải chừa chỗ cho vạch gạt ngang. */
  it('không có footer thì nội dung tự chừa vùng an toàn đáy', async () => {
    const screen = await renderScreen(
      <Screen>
        <Text>Nội dung</Text>
      </Screen>,
    );

    expect(collectPaddingBottom(screen.toJSON())).toEqual([METRICS.insets.bottom]);
  });

  /**
   * ⛔ Màn nằm trong `<Tabs>` KHÔNG được cộng vùng an toàn đáy.
   *
   * `BottomTabView` không ghi đè `SafeAreaInsetsContext` cho màn con, nên
   * `insets.bottom` vẫn là 34 dù thanh tab đã che kín chỗ đó — cộng thêm là
   * **34dp** trống ở đúng những màn chính. `BottomTabBarHeightContext` là tín
   * hiệu "có thanh tab ở dưới" mà chính navigator cấp cho từng màn con.
   */
  it('màn nằm trong thanh tab không cộng thêm vùng an toàn đáy', async () => {
    const screen = await renderScreen(
      <BottomTabBarHeightContext.Provider value={82}>
        <Screen>
          <Text>Nội dung trong tab</Text>
        </Screen>
      </BottomTabBarHeightContext.Provider>,
    );

    expect(collectPaddingBottom(screen.toJSON())).toEqual([]);
  });

  /**
   * ── KÉO-ĐỂ-LÀM-MỚI ────────────────────────────────────────────────────────
   *
   * ⚠️ Cử chỉ kéo KHÔNG mô phỏng được trong Jest (không có tầng native nào để
   * kéo), nên phần kiểm được là HỢP ĐỒNG mà `ScrollView` nhận: có phần tử
   * `refreshControl` hay không, nó mang đúng cờ `refreshing` nào, màu lấy từ
   * token hay `undefined`, và `onRefresh` có nối tới callback của nơi gọi không.
   * ⛔ `RCTRefreshControl` hiện trong cây JSON với props RỖNG — mọi thứ nằm ở
   * PROP `refreshControl` của `RCTScrollView`, nên phải đọc ở đó.
   */
  function findRefreshControl(node: unknown) {
    const props = findPropsWithKey(node, 'refreshControl');
    return (props?.refreshControl ?? undefined) as { props: Record<string, unknown> } | undefined;
  }

  it('gắn vòng quay làm mới khi có onRefresh, và nối đúng callback', async () => {
    const onRefresh = jest.fn();
    const screen = await renderScreen(
      <Screen header={<Text>Giao dịch</Text>} refreshing onRefresh={onRefresh}>
        <Text>Nội dung</Text>
      </Screen>,
    );

    const control = findRefreshControl(screen.toJSON());

    expect(control).toBeDefined();
    expect(control?.props.refreshing).toBe(true);
    (control?.props.onRefresh as () => void)();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Màu vòng quay KHÔNG đi qua className được (`tintColor`/`colors` nhận mã
   * màu thô). Quên hook `useThemeColors` thì hai prop này là `undefined`: iOS vẽ
   * vòng quay xám mặc định, Android vẽ màu xanh của Material — và ở chế độ tối
   * thì gần như không thấy. Test này chốt lại rằng chúng có màu thật.
   */
  it('màu vòng quay lấy từ token, không để trống', async () => {
    const screen = await renderScreen(
      <Screen header={<Text>Giao dịch</Text>} onRefresh={jest.fn()}>
        <Text>Nội dung</Text>
      </Screen>,
    );

    const control = findRefreshControl(screen.toJSON());

    expect(control?.props.tintColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(control?.props.colors).toHaveLength(1);
  });

  /**
   * ⛔ Vòng quay neo vào KHUNG vùng cuộn, không vào nội dung: đệm trong
   * `contentContainerStyle` không đẩy nó xuống. Màn KHÔNG có `header` tự cộng
   * `insets.top` cho phần thân, nên thiếu `progressViewOffset` là vòng quay hiện
   * đè lên tai thỏ. Màn CÓ `header` thì `AppBar` đã đứng trên vùng cuộn ⇒ 0.
   */
  it('màn CÓ thanh tiêu đề thì vòng quay không lệch (offset 0)', async () => {
    const screen = await renderScreen(
      <Screen header={<Text>Giao dịch</Text>} onRefresh={jest.fn()}>
        <Text>Nội dung</Text>
      </Screen>,
    );

    expect(findRefreshControl(screen.toJSON())?.props.progressViewOffset).toBe(0);
  });

  it('màn KHÔNG có thanh tiêu đề thì vòng quay tụt xuống dưới tai thỏ', async () => {
    const screen = await renderScreen(
      <Screen onRefresh={jest.fn()}>
        <Text>Nội dung</Text>
      </Screen>,
    );

    expect(findRefreshControl(screen.toJSON())?.props.progressViewOffset).toBe(METRICS.insets.top);
  });

  it('không có onRefresh thì KHÔNG gắn vòng quay nào', async () => {
    const screen = await renderScreen(
      <Screen>
        <Text>Nội dung</Text>
      </Screen>,
    );

    expect(findRefreshControl(screen.toJSON())).toBeUndefined();
  });

  /**
   * ⛔ `scrollable={false}` thì không có gì để kéo. Bỏ qua IM LẶNG là màn hình
   * kéo mãi không phản ứng còn lập trình viên thì thấy `onRefresh` nằm đó và tin
   * là đã xong — nên component cảnh báo ở chế độ dev.
   */
  it('bỏ qua onRefresh khi không cuộn, và cảnh báo cho người viết mã', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const screen = await renderScreen(
      <Screen scrollable={false} onRefresh={jest.fn()}>
        <Text>Nội dung</Text>
      </Screen>,
    );

    expect(findRefreshControl(screen.toJSON())).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('scrollable'));
    warn.mockRestore();
  });
});
