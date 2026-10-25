import { fireEvent, render, userEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ListItem, ListItemDefaultsProvider } from '@/shared/ui/list';
import { listItemStyles } from '@/shared/ui/list/list-item.styles';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⛔ Cạm bẫy lớn nhất của component này — hai cột
 * đều `flex-1` để nhãn dài không bóp giá trị về 0px — nằm hoàn toàn trong
 * `className`, nên KHÔNG kiểm được ở đây; nó phải nghiệm thu bằng mắt trên máy
 * 360dp với một nhãn thật dài.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('ListItem', () => {
  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(<ListItem label="Số tiền" />);

    expect(screen.getByText('Số tiền')).toBeOnTheScreen();
  });

  it('vẽ được với bộ prop đầy đủ', async () => {
    const screen = await render(
      <ListItem
        align="stacked"
        className="mt-md"
        description="Đã bao gồm phí"
        divider
        emphasis="strong"
        label="Số tiền"
        labelNumberOfLines={2}
        leading={<Text>₫</Text>}
        tone="warning"
        trailing={<Text>›</Text>}
        value="200.000 VND"
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByText('₫')).toBeOnTheScreen();
    expect(screen.getByText('Số tiền')).toBeOnTheScreen();
    expect(screen.getByText('Đã bao gồm phí')).toBeOnTheScreen();
    expect(screen.getByText('200.000 VND')).toBeOnTheScreen();
    expect(screen.getByText('›')).toBeOnTheScreen();
  });

  /**
   * ⛔ Lý do tồn tại của `spokenLabel`.
   *
   * Để rời, TalkBack đọc "Số tiền đề nghị vay" — dừng — người dùng vuốt tiếp —
   * "200.000.000 đồng". Giữa hai nhịp đó họ đã quên đang nghe số của dòng nào,
   * mà ở màn xác nhận giao dịch thì nhầm dòng là nhầm tiền.
   */
  it('gộp nhãn và giá trị thành MỘT câu', async () => {
    const screen = await render(<ListItem label="Số tiền" value="200.000 VND" />);

    expect(screen.getByLabelText('Số tiền: 200.000 VND')).toBeOnTheScreen();
  });

  it('có ghi chú thì ghi chú nằm cuối câu', async () => {
    const screen = await render(
      <ListItem description="Đã bao gồm phí" label="Số tiền" value="200.000 VND" />,
    );

    expect(screen.getByLabelText('Số tiền: 200.000 VND. Đã bao gồm phí')).toBeOnTheScreen();
  });

  /**
   * ⚠️ `0` là giá trị THẬT, không phải "không có giá trị". Viết
   * `value ? … : null` là dòng "Phí: 0 VND" biến mất — và người dùng không biết
   * giao dịch này miễn phí hay chưa tính phí.
   */
  it('giá trị bằng 0 vẫn hiện và vẫn vào câu đọc', async () => {
    const screen = await render(<ListItem label="Phí" value={0} />);

    expect(screen.getByText('0')).toBeOnTheScreen();
    expect(screen.getByLabelText('Phí: 0')).toBeOnTheScreen();
  });

  it('không có giá trị thì chỉ vẽ nhãn', async () => {
    const screen = await render(<ListItem label="Ghi chú" />);

    expect(screen.getByText('Ghi chú')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Ghi chú:')).toBeNull();
  });

  /**
   * Giá trị là phần tử React (huy hiệu trạng thái, ô nhập) thì KHÔNG được ép
   * vào một nhãn chuỗi: cờ `accessible` đã khiến hệ điều hành tự nối chữ của
   * các con lại thành một câu. Đặt nhãn cứng ở đây là che mất nội dung thật của
   * huy hiệu — và nó sẽ lệch ngay khi trạng thái đổi.
   */
  it('giá trị dạng phần tử thì không tự dựng nhãn a11y', async () => {
    const screen = await render(<ListItem label="Trạng thái" value={<Text>Đã duyệt</Text>} />);
    const root = screen.toJSON();

    expect(screen.getByText('Đã duyệt')).toBeOnTheScreen();
    expect(root).not.toBeNull();
    expect(
      (Array.isArray(root) ? root[0]?.props : root?.props)?.accessibilityLabel,
    ).toBeUndefined();
  });

  it('có onPress thì hàng thành nút, giữ nguyên câu đọc và gọi đúng một lần', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ListItem label="Tài khoản nguồn" value="2611 0002" onPress={onPress} />,
    );

    const row = screen.getByRole('button', { name: 'Tài khoản nguồn: 2611 0002' });
    await userEvent.press(row);

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('không có onPress thì không có vai `button`', async () => {
    const screen = await render(<ListItem label="Số tiền" value="200.000 VND" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  /**
   * ⚠️ Cờ khoá đặt ở CỘT GIỮA — đó mới là node mang vai `button` (`Pressable`
   * ngoài cố ý `accessible={false}` để khe `trailing` còn lia tới được).
   */
  it('disabled thì hàng không bấm được và trình đọc màn hình nghe được', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ListItem disabled label="Tài khoản nguồn" value="2611 0002" onPress={onPress} />,
    );

    const row = screen.getByRole('button', { name: 'Tài khoản nguồn: 2611 0002' });
    expect(row).toBeDisabled();
    await fireEvent.press(row);

    expect(onPress).not.toHaveBeenCalled();
  });

  /**
   * ⛔ Cắt NHÃN thì được, cắt GIÁ TRỊ thì không. "20.000.0…" đọc thành hai mươi
   * triệu hay hai trăm triệu đều được, và người dùng vẫn bấm Xác nhận. Nhãn
   * thiếu chữ cuối thì người ta vẫn đoán ra.
   */
  it('cắt được số dòng của nhãn, và KHÔNG cắt giá trị', async () => {
    const screen = await render(
      <ListItem
        label="Số tiền đề nghị vay tối đa theo hạn mức"
        labelNumberOfLines={1}
        value="200.000.000 VND"
      />,
    );

    expect(screen.getByText('Số tiền đề nghị vay tối đa theo hạn mức').props.numberOfLines).toBe(1);
    expect(screen.getByText('200.000.000 VND').props.numberOfLines).toBeUndefined();
  });

  it('kiểu xếp dọc vẫn hiện đủ nhãn và giá trị', async () => {
    const screen = await render(
      <ListItem align="stacked" label="Khoản vay" value="100.000.000 VND" />,
    );

    expect(screen.getByText('Khoản vay')).toBeOnTheScreen();
    expect(screen.getByText('100.000.000 VND')).toBeOnTheScreen();
    expect(screen.getByLabelText('Khoản vay: 100.000.000 VND')).toBeOnTheScreen();
  });

  /**
   * Mật độ `sm` — hàng thông số của thẻ sản phẩm (`259:125365`): 14/20, nhịp 24
   * thay cho 32. ⚠️ Cỡ chữ và đệm nằm trong `className` nên KHÔNG kiểm được ở
   * đây (`docs/rules/testing.md`); cái kiểm được — và cũng là cái hay hỏng khi
   * thêm một biến thể vào `tv()` — là hàng vẫn dựng đủ nội dung và câu đọc
   * không đổi.
   */
  it('size="sm" vẫn hiện đủ nhãn, giá trị và câu đọc', async () => {
    const screen = await render(<ListItem label="Hàm lượng kim loại" size="sm" value="24K" />);

    expect(screen.getByText('Hàm lượng kim loại')).toBeOnTheScreen();
    expect(screen.getByText('24K')).toBeOnTheScreen();
    expect(screen.getByLabelText('Hàm lượng kim loại: 24K')).toBeOnTheScreen();
  });

  it('size="sm" đi kèm được với mọi prop cũ', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ListItem
        align="stacked"
        description="Theo bảng giá niêm yết"
        label="Định lượng (chỉ)"
        size="sm"
        tone="warning"
        trailing={<Text>›</Text>}
        value="5"
        onPress={onPress}
      />,
    );

    await userEvent.press(
      screen.getByRole('button', { name: 'Định lượng (chỉ): 5. Theo bảng giá niêm yết' }),
    );

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Theo bảng giá niêm yết')).toBeOnTheScreen();
  });

  /**
   * ⛔ Lý do `selected` tồn tại. `SelectSheet` dựng dòng lựa chọn bằng
   * `ListItem`; nếu trạng thái "đang chọn" chỉ là NỀN TINT thì với TalkBack cả
   * 63 dòng tỉnh/thành đọc lên y hệt nhau và người khiếm thị không có cách nào
   * biết mình đã chọn cái nào.
   *
   * ⚠️ Cờ phải nằm ở CỘT GIỮA — node mang vai `button`. Đặt ở `Pressable` ngoài
   * (cố ý `accessible={false}`) là nó rơi vào một node trình đọc màn hình không
   * bao giờ dừng lại, và test này sẽ đỏ.
   */
  it('selected được báo cho trình đọc màn hình', async () => {
    const screen = await render(<ListItem label="Hà Nội" selected onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Hà Nội' })).toBeSelected();
  });

  /** Mặc định KHÔNG chọn — thêm prop mới không được đổi hành vi của chỗ đang dùng. */
  it('mặc định thì hàng không ở trạng thái đang chọn', async () => {
    const screen = await render(<ListItem label="Hà Nội" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Hà Nội' })).not.toBeSelected();
  });

  /** Hàng chỉ để đọc cũng phải báo được `selected` — ô trợ năng nằm ở cột giữa. */
  it('hàng không bấm được vẫn báo được selected', async () => {
    const screen = await render(<ListItem label="Hà Nội" selected value="Đang chọn" />);

    expect(screen.getByLabelText('Hà Nội: Đang chọn')).toBeSelected();
  });

  /**
   * Khe mô tả DƯỚI GIÁ TRỊ (Figma `I259:97607;245:1922`) — dòng phụ của số tiền:
   * tỉ giá quy đổi, ngày hiệu lực.
   *
   * ⛔ Nó phải chui vào CÙNG một câu đọc với nhãn và giá trị. Để rời thì TalkBack
   * đọc "500 USD" — dừng — vuốt — "≈ 12.750.000 VND", và giữa hai nhịp đó người
   * dùng đã không còn chắc hai con số này nói về cùng một dòng.
   */
  it('mô tả dưới giá trị hiện ra và nằm trong cùng câu đọc', async () => {
    const screen = await render(
      <ListItem label="Số tiền" value="500 USD" valueDescription="≈ 12.750.000 VND" />,
    );

    expect(screen.getByText('≈ 12.750.000 VND')).toBeOnTheScreen();
    expect(screen.getByLabelText('Số tiền: 500 USD. ≈ 12.750.000 VND')).toBeOnTheScreen();
  });

  /** ⛔ Dòng phụ của giá trị mà không có giá trị thì không ai hiểu nó nói về gì. */
  it('không vẽ mô tả dưới giá trị khi hàng không có giá trị', async () => {
    const screen = await render(<ListItem label="Số tiền" valueDescription="≈ 12.750.000 VND" />);

    expect(screen.queryByText('≈ 12.750.000 VND')).toBeNull();
  });
});

/**
 * ⚠️ ĐÂY KHÔNG PHẢI `toHaveStyle` — luật cấm nó vì NativeWind không biên dịch
 * trong Jest nên `style` của phần tử luôn rỗng. `listItemStyles` thì khác: nó là
 * một hàm THUẦN của `tv()` trả về CHUỖI class, không đi qua NativeWind, nên gọi
 * thẳng và so chuỗi là kiểm được thật.
 *
 * Lý do phải kiểm ở tầng này: thứ tự khai báo biến thể trong `tv()` quyết định
 * class nào sống sót sau `tailwind-merge`, và khai nhầm chỗ thì màu chữ im lặng
 * rơi về giá trị cũ — không `tsc`, `eslint` hay test hành vi nào thấy được.
 */
describe('listItemStyles — thứ tự biến thể quyết định màu nhãn', () => {
  /**
   * Nhãn dòng ĐANG CHỌN của bản vẽ là #1A1A1A (`fg-1`), không phải #666666
   * (`fg-2`) của các dòng thường — đo trên `700:27218` và `365:30369`.
   */
  it('dòng đang chọn lấy màu nhãn `fg-1`', () => {
    expect(listItemStyles({ selected: true }).label()).toContain('text-fg-1');
    expect(listItemStyles({ selected: true }).label()).not.toContain('text-fg-2');
  });

  it('dòng thường vẫn giữ `fg-2`', () => {
    expect(listItemStyles({ selected: false }).label()).toContain('text-fg-2');
  });

  /** ⛔ `selected` khai SAU `emphasis`, nếu không dòng tổng tiền đang chọn tụt về `fg-2`. */
  it('đang chọn thắng được màu nhãn của emphasis="strong"', () => {
    expect(listItemStyles({ emphasis: 'strong', selected: true }).label()).toContain('text-fg-1');
  });

  /** ⛔ `disabled` khai SAU `selected`: hàng bị khoá phải xám kể cả khi đang chọn. */
  it('hàng bị khoá vẫn xám dù đang chọn', () => {
    const label = listItemStyles({ disabled: true, selected: true }).label();

    expect(label).toContain('text-action-disabled-fg');
    expect(label).not.toContain('text-fg-1');
  });

  /** ⛔ Đổi màu nhãn KHÔNG được kéo theo cỡ chữ — `text-body-lg` của `align` phải sống. */
  it('không đánh rơi cỡ chữ của biến thể align', () => {
    expect(listItemStyles({ align: 'row', selected: true }).label()).toContain('text-body-lg');
  });
});

describe('ListItemDefaultsProvider', () => {
  it('hàng nằm trong nhóm vẫn vẽ đủ nhãn/mô tả và bấm được; prop `emphasis` truyền thẳng vẫn hợp lệ', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ListItemDefaultsProvider emphasis="title">
        <ListItem description="Mô tả" label="Đã lưu" onPress={onPress} />
        <ListItem emphasis="strong" label="Tổng" value="10" />
      </ListItemDefaultsProvider>,
    );

    expect(screen.getByText('Đã lưu')).toBeOnTheScreen();
    expect(screen.getByText('Mô tả')).toBeOnTheScreen();
    expect(screen.getByText('Tổng')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Đã lưu'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
