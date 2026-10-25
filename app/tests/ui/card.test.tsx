import { act, fireEvent, render, userEvent } from '@testing-library/react-native';
import { Text, View } from 'react-native';

import { LinkButton } from '@/shared/ui/button';
import { AccountCard, Card, MediaCard, Thumbnail } from '@/shared/ui/card';

/**
 * Gom CHỮ theo đúng thứ tự xuất hiện trong cây đã render.
 *
 * ⚠️ Cần cho khe `media`: thứ tự trên–dưới là thứ tự VẼ, mà `toBeOnTheScreen()`
 * không nói gì về thứ tự. ⛔ Không kiểm bằng `toHaveStyle` được (NativeWind
 * không biên dịch trong Jest) và RNTL 14 đã bỏ nhóm `UNSAFE_*` — nên tự đi bộ
 * trên cây JSON, cách `divider`/`bottom-nav` test đang làm.
 */
function textsInOrder(node: unknown, acc: string[] = []): string[] {
  if (typeof node === 'string') acc.push(node);
  else if (Array.isArray(node)) for (const child of node) textsInOrder(child, acc);
  else if (node !== null && typeof node === 'object' && 'children' in node) {
    const { children } = node as { children?: unknown };
    if (Array.isArray(children)) for (const child of children) textsInOrder(child, acc);
  }
  return acc;
}

/**
 * Gom mọi `aspectRatio` tìm được trong cây đã render.
 *
 * ⚠️ Đây KHÔNG phải `toHaveStyle` trá hình. Luật cấm `toHaveStyle` vì
 * `className` của NativeWind không được biên dịch trong Jest nên `style` do
 * class sinh ra luôn RỖNG. Còn tỉ lệ khung ảnh của `MediaCard` đi qua prop
 * `style` THẬT (`style={{ aspectRatio }}`) — React Native chỉ nhận một SỐ ở
 * `aspectRatio`, không nhận phân số CSS — nên nó có mặt trong cây và kiểm được.
 * Kiểm nó là kiểm đúng thứ dễ gõ nhầm nhất: 343/192 với 276/170.
 */
function aspectRatiosInTree(node: unknown, acc: number[] = []): number[] {
  if (Array.isArray(node)) {
    for (const child of node) aspectRatiosInTree(child, acc);
    return acc;
  }
  if (node === null || typeof node !== 'object') return acc;

  const { children, props } = node as { children?: unknown; props?: Record<string, unknown> };
  const style: unknown = props?.style;
  for (const entry of Array.isArray(style) ? style : [style]) {
    if (entry !== null && typeof entry === 'object' && 'aspectRatio' in entry) {
      const ratio = (entry as { aspectRatio?: unknown }).aspectRatio;
      if (typeof ratio === 'number') acc.push(ratio);
    }
  }
  if (Array.isArray(children)) for (const child of children) aspectRatiosInTree(child, acc);
  return acc;
}

/**
 * Gom props của mọi node tự ẩn khỏi trình đọc màn hình.
 *
 * ⚠️ Phải đi bộ trên cây: RNTL 14 đã bỏ nhóm `UNSAFE_*`, mà `MediaCard` cố ý
 * không nhận `testID` cho khung ảnh (một prop chỉ để test thì màn nào cũng phải
 * nhớ truyền).
 */
function hiddenFromScreenReader(
  node: unknown,
  acc: Record<string, unknown>[] = [],
): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const child of node) hiddenFromScreenReader(child, acc);
    return acc;
  }
  if (node === null || typeof node !== 'object') return acc;

  const { children, props } = node as { children?: unknown; props?: Record<string, unknown> };
  if (props?.accessibilityElementsHidden === true) acc.push(props);
  if (Array.isArray(children)) for (const child of children) hiddenFromScreenReader(child, acc);
  return acc;
}

/**
 * Có glyph giữ chỗ (`<Icon name="image">`) trong cây không?
 *
 * ⚠️ Không query được bằng nhãn: glyph này CỐ Ý không có `label` (nó là hình
 * trang trí, xem `Thumbnail.tsx`), nên trình đọc màn hình không thấy nó và
 * `getByLabelText` cũng vậy. Nhưng `SvgXml` để lại prop `xml` trên node host
 * `RNSVGSvgView`, và đó là dấu hiệu tĩnh, kiểm được — ⛔ không phải `toHaveStyle`
 * trá hình: `xml` là prop THẬT do `Icon` truyền xuống, không phải style sinh từ
 * `className`.
 */
function hasPlaceholderGlyph(node: unknown): boolean {
  if (Array.isArray(node)) return node.some((child) => hasPlaceholderGlyph(child));
  if (node === null || typeof node !== 'object') return false;

  const { children, props } = node as { children?: unknown; props?: Record<string, unknown> };
  if (typeof props?.xml === 'string') return true;
  return Array.isArray(children) && children.some((child) => hasPlaceholderGlyph(child));
}

/**
 * `onError` của phần tử ảnh `expo-image`, để giả lập một URL 404.
 *
 * ⚠️ Phải đi bộ trên `screen.root`: RNTL 14 đã bỏ nhóm `UNSAFE_*`, và
 * `fireEvent(node, 'error')` KHÔNG dùng được — `ViewManagerAdapter_ExpoImage`
 * không nằm trong sổ phần tử của RNTL nên `fireEvent` im lặng không làm gì và
 * test sẽ xanh GIẢ. (Cùng cách `tests/ui/avatar.test.tsx` đang làm.)
 */
type TreeNode = { children?: unknown[]; props?: Record<string, unknown> };

function findImageOnError(node: TreeNode): ((event: unknown) => void) | undefined {
  if (typeof node.props?.onError === 'function') {
    return node.props.onError as (event: unknown) => void;
  }
  for (const child of node.children ?? []) {
    if (child && typeof child === 'object') {
      const hit = findImageOnError(child as TreeNode);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). Bo góc, nền và chuyện thẻ KHÔNG đổ bóng đều nằm
 * trong `className` nên không kiểm được ở đây; chúng nhìn bằng mắt trên máy.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('Card', () => {
  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(
      <Card>
        <Text>Nội dung thẻ</Text>
      </Card>,
    );

    expect(screen.getByText('Nội dung thẻ')).toBeOnTheScreen();
  });

  it('vẽ được với bộ prop đầy đủ', async () => {
    const screen = await render(
      <Card
        className="mt-md"
        footer={<Text>Xem tất cả</Text>}
        padded={false}
        title="Giao dịch gần đây"
        onPress={jest.fn()}
      >
        <Text>Nội dung thẻ</Text>
      </Card>,
    );

    expect(screen.getByText('Giao dịch gần đây')).toBeOnTheScreen();
    expect(screen.getByText('Nội dung thẻ')).toBeOnTheScreen();
    expect(screen.getByText('Xem tất cả')).toBeOnTheScreen();
  });

  /**
   * ⛔ Tiêu đề dạng chuỗi PHẢI có vai `header`. Nó là cái mốc để trình đọc màn
   * hình nhảy giữa các nhóm; thiếu nó thì người dùng khiếm thị phải vuốt qua
   * từng dòng của mọi thẻ mới tới được nhóm mình cần.
   */
  it('tiêu đề dạng chuỗi được gắn vai `header`', async () => {
    const screen = await render(<Card title="Thông tin khoản vay" />);

    expect(screen.getByRole('header', { name: 'Thông tin khoản vay' })).toBeOnTheScreen();
  });

  /**
   * Tiêu đề dạng phần tử thì nơi gọi tự lo trợ năng — thẻ KHÔNG được tự bọc
   * thêm một lớp `header` quanh cả cụm (tiêu đề + nút phụ), vì như vậy nút phụ
   * bị nuốt vào trong tiêu đề và hết bấm được.
   */
  it('tiêu đề dạng phần tử thì KHÔNG tự bọc vai `header`', async () => {
    const screen = await render(
      <Card
        title={
          <View>
            <Text>Tài khoản thanh toán</Text>
          </View>
        }
      />,
    );

    expect(screen.getByText('Tài khoản thanh toán')).toBeOnTheScreen();
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('có onPress thì cả thẻ thành nút và gọi đúng một lần', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Card title="Tài khoản nguồn" onPress={onPress}>
        <Text>2611 0002 1234</Text>
      </Card>,
    );

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Không có `onPress` thì KHÔNG được có vai `button`. Một thẻ tự xưng là nút
   * mà bấm vào không có gì xảy ra khiến người dùng kết luận app treo.
   */
  it('không có onPress thì không có vai `button`', async () => {
    const screen = await render(
      <Card>
        <Text>Chỉ để đọc</Text>
      </Card>,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  /**
   * ⛔ Cờ khoá phải nằm CÙNG CHỖ với vai `button`. Thẻ có tiêu đề chuỗi thì vai
   * nằm ở TIÊU ĐỀ (xem chú thích `splitAction` trong `Card.tsx`), nên đặt
   * `accessibilityState` ở mỗi `Pressable` là trình đọc màn hình xướng "nút" mà
   * không xướng "đã tắt" — người dùng bấm rồi ngồi đợi một phản hồi không tới.
   */
  it('disabled thì không bấm được và trình đọc màn hình nghe được', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Card disabled title="Tài khoản nguồn" onPress={onPress}>
        <Text>2611 0002 1234</Text>
      </Card>,
    );

    const button = screen.getByRole('button', { name: 'Tài khoản nguồn' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
  });

  /** Mặc định KHÔNG khoá — thêm prop mới không được đổi hành vi của mọi chỗ đang dùng. */
  it('mặc định thì thẻ bấm được vẫn bấm được', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Card title="Tài khoản nguồn" onPress={onPress}>
        <Text>2611 0002 1234</Text>
      </Card>,
    );

    const button = screen.getByRole('button', { name: 'Tài khoản nguồn' });
    expect(button).not.toBeDisabled();
    await userEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ `media` phải nằm TRƯỚC `title`. Trong bản vẽ, huy hiệu biểu tượng
   * (`822:32149`, nút tròn 42×42) và ảnh bìa (slide `193:25737`) luôn ở trên
   * tiêu đề. Vẽ sau tiêu đề là sai bố cục mà không có lỗi nào báo.
   */
  it('media được vẽ TRƯỚC title', async () => {
    const screen = await render(
      <Card media={<Text>Huy hiệu Zalo</Text>} title="Chat qua Zalo">
        <Text>Hỗ trợ qua ứng dụng Zalo</Text>
      </Card>,
    );

    const order = textsInOrder(screen.toJSON());

    expect(order).toContain('Huy hiệu Zalo');
    expect(order.indexOf('Huy hiệu Zalo')).toBeLessThan(order.indexOf('Chat qua Zalo'));
  });

  /**
   * Ca ẢNH BÌA dán sát mép — chính là lý do `padded={false}` tồn tại. Và nó
   * phải giữ nguyên nhánh `splitAction`: `title` vẫn là CHUỖI nên vai `button`
   * nằm ở tiêu đề, mọi thứ bấm được bên trong thẻ vẫn còn. ⛔ Đó là thứ mà mẹo
   * cũ `title={<>…</>}` làm mất.
   */
  it('media sống được với padded={false} và không phá vai trợ năng của title', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Card
        media={<Text>Ảnh sản phẩm</Text>}
        padded={false}
        title="Kim Gia Bảo - 1 chỉ"
        onPress={onPress}
      >
        <Text>17.000.000 VND</Text>
      </Card>,
    );

    const button = screen.getByRole('button', { name: 'Kim Gia Bảo - 1 chỉ' });
    await userEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ảnh sản phẩm')).toBeOnTheScreen();
    expect(screen.getByText('17.000.000 VND')).toBeOnTheScreen();
  });

  /** Không truyền `media` thì thẻ không mọc thêm ô giữ chỗ nào. */
  it('không truyền media thì không vẽ gì thay thế', async () => {
    const screen = await render(<Card title="Thông tin đơn hàng" />);

    expect(textsInOrder(screen.toJSON())).toEqual(['Thông tin đơn hàng']);
  });
});

describe('AccountCard', () => {
  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(<AccountCard value="2611 0002 1234" />);

    expect(screen.getByText('2611 0002 1234')).toBeOnTheScreen();
  });

  it('vẽ được với bộ prop đầy đủ', async () => {
    const screen = await render(
      <AccountCard
        className="mt-md"
        label="TK nguồn:"
        leading={<Text>BIDV</Text>}
        secondaryLabel="Số dư:"
        secondaryValue="1.500.000 VND"
        trailing={<Text>Đổi</Text>}
        value="2611 0002 1234"
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('BIDV')).toBeOnTheScreen();
    expect(screen.getByText('TK nguồn:')).toBeOnTheScreen();
    expect(screen.getByText('1.500.000 VND')).toBeOnTheScreen();
    expect(screen.getByText('Đổi')).toBeOnTheScreen();
  });

  /**
   * ⛔ Đây là lý do thẻ này tự dựng `accessibilityLabel`.
   *
   * Để rời, TalkBack phát ra bốn mẩu — "TK nguồn", "2611…", "Số dư",
   * "1.500.000 VND" — ở bốn lần vuốt, và người dùng phải tự nhớ số nào của nhãn
   * nào. Ở màn chuyển tiền, nhầm dòng là nhầm tài khoản nguồn.
   */
  it('gộp cả thẻ thành MỘT câu cho trình đọc màn hình', async () => {
    const screen = await render(
      <AccountCard
        label="TK nguồn:"
        secondaryLabel="Số dư:"
        secondaryValue="1.500.000 VND"
        value="2611 0002 1234"
      />,
    );

    expect(
      screen.getByLabelText('TK nguồn: 2611 0002 1234. Số dư: 1.500.000 VND'),
    ).toBeOnTheScreen();
  });

  it('bỏ nhãn thì câu đọc chỉ còn phần giá trị', async () => {
    const screen = await render(
      <AccountCard secondaryValue="1.500.000 VND" value="2611 0002 1234" />,
    );

    expect(screen.getByLabelText('2611 0002 1234. 1.500.000 VND')).toBeOnTheScreen();
  });

  it('không có giá trị dòng hai thì thẻ chỉ còn một dòng', async () => {
    const screen = await render(
      <AccountCard label="TK nguồn:" secondaryLabel="Số dư:" value="2611 0002 1234" />,
    );

    expect(screen.queryByText('Số dư:')).toBeNull();
    expect(screen.getByLabelText('TK nguồn: 2611 0002 1234')).toBeOnTheScreen();
  });

  it('có onPress thì thẻ thành nút, giữ nguyên câu đọc và gọi đúng một lần', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <AccountCard label="TK nguồn:" value="2611 0002 1234" onPress={onPress} />,
    );

    const card = screen.getByRole('button', { name: 'TK nguồn: 2611 0002 1234' });
    await userEvent.press(card);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('không có onPress thì không có vai `button`', async () => {
    const screen = await render(<AccountCard value="2611 0002 1234" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  /**
   * Khe `trailing` đè lên mũi tên mặc định — nơi gọi cần một nút "Đổi" thay cho
   * mũi tên thì không phải dựng lại cả thẻ.
   */
  it('khe trailing đè lên mũi tên mặc định', async () => {
    const screen = await render(
      <AccountCard trailing={<Text>Đổi</Text>} value="2611 0002 1234" onPress={jest.fn()} />,
    );

    expect(screen.getByText('Đổi')).toBeOnTheScreen();
  });

  it('disabled thì không bấm được và trình đọc màn hình nghe được', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <AccountCard disabled label="TK nguồn:" value="2611 0002 1234" onPress={onPress} />,
    );

    const card = screen.getByRole('button', { name: 'TK nguồn: 2611 0002 1234' });
    expect(card).toBeDisabled();
    await fireEvent.press(card);

    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('MediaCard', () => {
  const SOURCE = { uri: 'https://example.test/kim-gia-bao.png' };

  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(<MediaCard source={SOURCE} title="Kim Gia Bảo - 1 chỉ" />);

    expect(screen.getByText('Kim Gia Bảo - 1 chỉ')).toBeOnTheScreen();
  });

  it('vẽ được tiêu đề, mô tả và chân thẻ', async () => {
    const screen = await render(
      <MediaCard
        aspect="wide"
        className="mt-md"
        description="17.000.000 VND"
        footer={<Text>Còn hàng</Text>}
        source={SOURCE}
        title="Kim Gia Bảo - 1 chỉ"
      />,
    );

    expect(screen.getByText('Kim Gia Bảo - 1 chỉ')).toBeOnTheScreen();
    expect(screen.getByText('17.000.000 VND')).toBeOnTheScreen();
    expect(screen.getByText('Còn hàng')).toBeOnTheScreen();
  });

  it('không truyền mô tả thì không vẽ dòng rỗng', async () => {
    const screen = await render(<MediaCard source={SOURCE} title="Ưu đãi tháng 9" />);

    expect(textsInOrder(screen.toJSON())).toEqual(['Ưu đãi tháng 9']);
  });

  /**
   * ⛔ Ảnh phải nằm TRƯỚC khối chữ — bản vẽ (`259:123597`, slide `193:25737`)
   * dán ảnh sát mép TRÊN của thẻ. Đây cũng là bằng chứng `MediaCard` dùng đúng
   * khe `media` của `Card` chứ không nhét ảnh vào `children`.
   */
  it('ảnh bìa được vẽ TRƯỚC khối chữ', async () => {
    const screen = await render(
      <MediaCard description="17.000.000 VND" source={SOURCE} title="Kim Gia Bảo - 1 chỉ" />,
    );
    const order = textsInOrder(screen.toJSON());

    expect(order).toEqual(['Kim Gia Bảo - 1 chỉ', '17.000.000 VND']);
  });

  it('có onPress thì cả thẻ thành nút và gọi đúng một lần', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <MediaCard source={SOURCE} title="Kim Gia Bảo - 1 chỉ" onPress={onPress} />,
    );

    await userEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('không có onPress thì không có vai `button`', async () => {
    const screen = await render(<MediaCard source={SOURCE} title="Kim Gia Bảo - 1 chỉ" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  /**
   * ⛔ Ca hồi quy của lỗi đã sửa: thẻ vừa bấm được vừa CÓ nút riêng bên trong.
   *
   * Bản vẽ có thật ca này — slide `193:25737` vẽ thẻ "Ví dụ minh hoạ" với một
   * `Divider` rồi một `Button/bt link` ("Đổi quà ngay") nằm trong thẻ. Trước
   * đây `MediaCard` gộp cả thẻ thành MỘT ô trợ năng nên `Pressable` nuốt mất
   * cái nút: TalkBack chỉ thấy một nút "mở chi tiết", còn hành động đổi quà
   * biến mất hoàn toàn — và không có lỗi nào báo, vì bằng ngón tay thì vẫn bấm
   * được cả hai.
   */
  it('có onPress VÀ nút trong chân thẻ thì cả hai đều là ô riêng, bấm đúng cái mình bấm', async () => {
    const onCard = jest.fn();
    const onRedeem = jest.fn();
    const screen = await render(
      <MediaCard
        description="Ưu đãi đến: 31/12/2024"
        footer={<LinkButton label="Đổi quà ngay" onPress={onRedeem} />}
        source={SOURCE}
        title="Giảm 100,000 VND"
        onPress={onCard}
      />,
    );

    await userEvent.press(screen.getByRole('button', { name: 'Đổi quà ngay' }));
    expect(onRedeem).toHaveBeenCalledTimes(1);
    expect(onCard).not.toHaveBeenCalled();

    await userEvent.press(screen.getByRole('button', { name: 'Giảm 100,000 VND' }));
    expect(onCard).toHaveBeenCalledTimes(1);
    expect(onRedeem).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Mặt kia của cùng một quyết định: KHÔNG có nút trong chân thẻ thì thẻ phải
   * giữ nguyên kiểu gộp một ô. Lưới quà tặng có 8 ô; tách ô vô cớ là bắt người
   * dùng trình đọc màn hình vuốt 2–3 lần cho MỖI ô thay vì nghe gọn một câu.
   */
  it('không có chân thẻ thì vẫn gộp cả thẻ thành MỘT ô', async () => {
    const screen = await render(
      <MediaCard
        description="17.000.000 VND"
        source={SOURCE}
        title="Kim Gia Bảo - 1 chỉ"
        onPress={jest.fn()}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    /* Tiêu đề KHÔNG được tự mang vai nút ở nhánh này — vai nằm ở `Pressable`. */
    expect(screen.queryByRole('button', { name: 'Kim Gia Bảo - 1 chỉ' })).toBeNull();
  });

  it('disabled thì không bấm được và trình đọc màn hình nghe được', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <MediaCard disabled source={SOURCE} title="Kim Gia Bảo - 1 chỉ" onPress={onPress} />,
    );

    const card = screen.getByRole('button');
    expect(card).toBeDisabled();
    await fireEvent.press(card);

    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * ⛔ Ba tỉ lệ là QUY ĐỊNH của bản vẽ, không phải thẩm mỹ: `square` cho lưới 2
   * cột, `wide` (276×170) cho rail cuộn ngang — cả hai ở slide `193:25737` — và
   * `banner` (343×192) ở slide `193:25366`. Gõ nhầm một con số thì ảnh vẫn hiện,
   * chỉ là cao sai vài chục pixel và lưới lệch nhịp; không có lỗi nào báo.
   */
  it.each([
    ['square', 1],
    ['banner', 343 / 192],
    ['wide', 276 / 170],
  ] as const)('aspect="%s" khoá khung ảnh ở đúng tỉ lệ', async (aspect, ratio) => {
    const screen = await render(
      <MediaCard aspect={aspect} source={SOURCE} title="Kim Gia Bảo - 1 chỉ" />,
    );

    expect(aspectRatiosInTree(screen.toJSON())).toEqual([ratio]);
  });

  /** Không truyền `aspect` thì rơi về lưới 2 cột — ca xuất hiện nhiều nhất. */
  it('mặc định là ảnh vuông 1:1', async () => {
    const screen = await render(<MediaCard source={SOURCE} title="Kim Gia Bảo - 1 chỉ" />);

    expect(aspectRatiosInTree(screen.toJSON())).toEqual([1]);
  });

  /**
   * ⛔ Ảnh bìa là TRANG TRÍ: nội dung của nó đã nằm trong `title`. Không ẩn thì
   * trình đọc màn hình xướng thêm một ô trống trước MỖI thẻ — 8 ô rác trong một
   * lưới 8 sản phẩm. Phải khai CẢ HAI cờ: iOS nghe cờ này, Android nghe cờ kia.
   */
  it('ảnh bìa bị ẩn khỏi trình đọc màn hình trên CẢ HAI nền tảng', async () => {
    const screen = await render(<MediaCard source={SOURCE} title="Kim Gia Bảo - 1 chỉ" />);

    const hidden = hiddenFromScreenReader(screen.toJSON());

    expect(hidden).toHaveLength(1);
    expect(hidden[0]?.importantForAccessibility).toBe('no-hide-descendants');
  });
});

describe('Thumbnail', () => {
  const SOURCE = { uri: 'https://example.test/banner.png' };

  it('vẽ được với bộ prop tối thiểu và hiện ô giữ chỗ khi chưa có ảnh', async () => {
    const screen = await render(<Thumbnail />);

    expect(hasPlaceholderGlyph(screen.toJSON())).toBe(true);
  });

  /**
   * ⛔ Ca này bảo vệ đúng cái bẫy mà component tồn tại để gói lại.
   *
   * `expo-image` gặp URL 404 / link hết hạn / mất mạng thì vẽ TRONG SUỐT và im
   * lặng: không lỗi, không cảnh báo. Không có nhánh dự phòng thì banner hỏng
   * trông y hệt một khoảng trống trong bố cục, và không có gì đỏ ở đâu cả.
   */
  it('ảnh lỗi thì quay về ô giữ chỗ', async () => {
    const screen = await render(<Thumbnail source={SOURCE} />);
    expect(hasPlaceholderGlyph(screen.toJSON())).toBe(false);

    const onError = findImageOnError(screen.root as unknown as TreeNode);
    expect(onError).toBeDefined();
    await act(async () => {
      onError?.({ nativeEvent: { error: 'not found' } });
    });

    expect(hasPlaceholderGlyph(screen.toJSON())).toBe(true);
  });

  /**
   * ⛔ Nhớ chính `source` đã hỏng, KHÔNG phải một cờ `boolean`.
   *
   * Ô ảnh được tái sử dụng (banner xoay vòng, danh sách cuộn lại): một cờ
   * boolean sẽ kẹt ở trạng thái "hỏng" cho tới lúc unmount, nên ảnh MỚI không
   * bao giờ có cơ hội hiện. Cùng lý do đã ghi ở `Avatar.tsx`.
   */
  it('đổi sang ảnh khác sau khi lỗi thì thử lại ảnh mới', async () => {
    const screen = await render(<Thumbnail source={SOURCE} />);

    await act(async () => {
      findImageOnError(screen.root as unknown as TreeNode)?.({ nativeEvent: {} });
    });
    expect(hasPlaceholderGlyph(screen.toJSON())).toBe(true);

    await screen.rerender(<Thumbnail source={{ uri: 'https://example.test/khac.png' }} />);

    expect(hasPlaceholderGlyph(screen.toJSON())).toBe(false);
  });

  /**
   * ⛔ Mặc định là ảnh TRANG TRÍ: banner lặp lại thông tin đã có bằng chữ ngay
   * bên cạnh. Không ẩn thì mỗi ô đẻ thêm một chặng vuốt xướng "hình ảnh" mà
   * không nói được gì. Phải khai CẢ HAI cờ — iOS nghe cờ này, Android cờ kia.
   */
  it('không có alt thì ẩn khỏi trình đọc màn hình trên CẢ HAI nền tảng', async () => {
    const screen = await render(<Thumbnail source={SOURCE} />);

    const hidden = hiddenFromScreenReader(screen.toJSON());

    expect(hidden).toHaveLength(1);
    expect(hidden[0]?.importantForAccessibility).toBe('no-hide-descendants');
  });

  /** Có `alt` thì ảnh mang nghĩa: đọc được nhãn và KHÔNG còn bị ẩn. */
  it('có alt thì ảnh mang nghĩa và đọc được nhãn', async () => {
    const screen = await render(<Thumbnail alt="Biểu đồ lãi suất 2024" source={SOURCE} />);

    expect(screen.getByLabelText('Biểu đồ lãi suất 2024')).toBeOnTheScreen();
    expect(hiddenFromScreenReader(screen.toJSON())).toHaveLength(0);
  });

  /**
   * ⛔ Tỉ lệ khoá chiều cao của khung NGAY TỪ khung hình đầu tiên — đó là thứ
   * giữ cho bố cục không nhảy lúc ảnh tải xong. Gõ nhầm con số thì ảnh vẫn
   * hiện, chỉ là cao sai vài chục pixel; không có lỗi nào báo.
   */
  it.each([
    ['banner-slim', 343 / 163],
    ['square', 1],
    ['banner', 343 / 192],
  ] as const)('aspect="%s" khoá khung ở đúng tỉ lệ', async (aspect, ratio) => {
    const screen = await render(<Thumbnail aspect={aspect} source={SOURCE} />);

    expect(aspectRatiosInTree(screen.toJSON())).toEqual([ratio]);
  });

  /** Mặc định là banner 343×163 của `259:123593` — ô xuất hiện nhiều nhất. */
  it('mặc định là banner 343×163', async () => {
    const screen = await render(<Thumbnail source={SOURCE} />);

    expect(aspectRatiosInTree(screen.toJSON())).toEqual([343 / 163]);
  });

  /** Ca một lần (bản vẽ riêng của feature) thì nhận thẳng một SỐ. */
  it('nhận thẳng một số làm tỉ lệ', async () => {
    const screen = await render(<Thumbnail aspect={4 / 3} source={SOURCE} />);

    expect(aspectRatiosInTree(screen.toJSON())).toEqual([4 / 3]);
  });
});
