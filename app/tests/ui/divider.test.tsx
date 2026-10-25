import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import { Divider } from '@/shared/ui/divider';

/**
 * ⚠️ Chỉ test HÀNH VI. Màu và hướng KHÔNG kiểm được ở đây: `className` không
 * thành `style` trong Jest — xem `docs/rules/testing.md`.
 *
 * ⚠️ Bề dày thì có kiểm, nhưng không phải để chép lại hằng số: cái được kiểm là
 * component CHỌN mức nào khi nơi gọi không truyền `thickness` — nét liền lấy
 * hairline, nét đứt lấy 1dp (hairline làm nét đứt gần như biến mất).
 *
 * Cái đáng kiểm là thứ HỎNG ÂM THẦM: đường kẻ trang trí có bị trình đọc màn
 * hình đọc thành một phần tử rỗng sau mỗi mục danh sách hay không, và bản có
 * chữ ("HOẶC") có còn đọc được hay không.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('Divider', () => {
  it('vẽ được ở cả hai hướng và cả hai lối vẽ', async () => {
    const screen = await render(
      <>
        <Divider />
        <Divider orientation="vertical" />
        <Divider variant="dashed" />
        <Divider thickness="thick" />
      </>,
    );

    expect(screen.toJSON()).not.toBeNull();
  });

  it('hiện chữ đặt giữa đường kẻ', async () => {
    const screen = await render(<Divider label="HOẶC" />);

    expect(screen.getByText('HOẶC')).toBeOnTheScreen();
  });

  it('nhận chữ dạng phần tử, không chỉ chuỗi', async () => {
    const screen = await render(<Divider label={<Text>Giao dịch hôm nay</Text>} />);

    expect(screen.getByText('Giao dịch hôm nay')).toBeOnTheScreen();
  });

  /**
   * ⛔ Đường kẻ DỌC không có chỗ đặt chữ.
   *
   * Chữ xoay 90° thì không đọc được, nên component bỏ qua `label` ở hướng dọc.
   * Nếu ngày nào đó ai đó "sửa cho nhất quán" bằng cách vẽ luôn, test này đỏ.
   */
  it('bỏ qua chữ khi đường kẻ nằm dọc', async () => {
    const screen = await render(<Divider label="HOẶC" orientation="vertical" />);

    expect(screen.queryByText('HOẶC')).toBeNull();
  });

  /**
   * ⛔ Ca này bảo vệ một lỗi ĐÃ XẢY RA: `inset` từng được cài bằng
   * `marginHorizontal`, mà trong Yoga `w-full` = 100% hộp nội dung của cha còn
   * `margin` cộng THÊM ra ngoài ⇒ đường kẻ rộng `100% + 2×inset` và THÒ ra khỏi
   * cha, tức là ngược hẳn với tên prop. `padding` mới trừ vào bên trong.
   *
   * ⚠️ Kiểm được ở Jest vì đây là `style` NỘI TUYẾN, không phải `className`
   * (class NativeWind không biên dịch trong Jest — xem `docs/rules/testing.md`).
   */
  it('thụt hai đầu bằng đệm trong, không phải lề ngoài', async () => {
    const screen = await render(<Divider inset={16} />);
    const root = screen.toJSON();
    const props = (Array.isArray(root) ? root[0]?.props : root?.props) as
      { style?: unknown } | undefined;
    const style = [props?.style].flat(Infinity).filter(Boolean);

    expect(style).toContainEqual(expect.objectContaining({ paddingHorizontal: 16 }));
    expect(style).not.toContainEqual(expect.objectContaining({ marginHorizontal: 16 }));
  });

  it('đường kẻ dọc thụt theo chiều dọc', async () => {
    const screen = await render(<Divider inset={16} orientation="vertical" />);
    const root = screen.toJSON();
    const props = (Array.isArray(root) ? root[0]?.props : root?.props) as
      { style?: unknown } | undefined;
    const style = [props?.style].flat(Infinity).filter(Boolean);

    expect(style).toContainEqual(expect.objectContaining({ paddingVertical: 16 }));
  });

  /**
   * ⛔ Nét ĐỨT phải dày ÍT NHẤT 1dp.
   *
   * `StyleSheet.hairlineWidth` là 0.33dp trên màn ×3; gạch `2 2` vẽ ở bề dày đó
   * ra một chuỗi chấm gần như không thấy — người dùng chỉ thấy khoảng trống và
   * tưởng khối bên dưới không liên quan gì tới khối bên trên. Nét LIỀN thì
   * ngược lại: hairline mới đúng độ mảnh của hệ điều hành.
   *
   * ⚠️ Kiểm được ở Jest vì bề dày đi qua `style` NỘI TUYẾN (SVG `strokeWidth`
   * và `height` của `View`), không phải className.
   */
  it('nét đứt mặc định dày hơn nét liền', async () => {
    const dashed = await render(<Divider variant="dashed" />);
    const dashedProps = (Array.isArray(dashed.toJSON()) ? null : dashed.toJSON()) as {
      children?: { props?: { style?: unknown } }[];
    } | null;
    const rule = [dashedProps?.children?.[0]?.props?.style].flat(Infinity).filter(Boolean);

    expect(rule).toContainEqual(expect.objectContaining({ height: 1 }));
  });

  it('nét liền vẫn mảnh đúng một pixel vật lý', async () => {
    const solid = await render(<Divider />);
    const solidProps = (Array.isArray(solid.toJSON()) ? null : solid.toJSON()) as {
      children?: { props?: { style?: unknown } }[];
    } | null;
    const rule = [solidProps?.children?.[0]?.props?.style].flat(Infinity).filter(Boolean);

    expect(rule).toContainEqual(expect.objectContaining({ height: StyleSheet.hairlineWidth }));
  });

  /**
   * Đường kẻ KHÔNG có chữ là trang trí thuần. Không ẩn khỏi trình đọc màn hình
   * thì người dùng khiếm thị phải vuốt qua một phần tử trống sau MỖI mục danh
   * sách — với danh sách 50 giao dịch là 50 lần vuốt vô nghĩa.
   *
   * ⚠️ Phải khai CẢ HAI prop: `accessibilityElementsHidden` chỉ iOS nghe,
   * `importantForAccessibility` chỉ Android nghe. Bỏ một cái là hở một nền.
   */
  it('ẩn khỏi trình đọc màn hình khi không có chữ', async () => {
    const screen = await render(<Divider />);
    const root = screen.toJSON();

    expect(root).not.toBeNull();
    expect(Array.isArray(root) ? root[0]?.props : root?.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});
