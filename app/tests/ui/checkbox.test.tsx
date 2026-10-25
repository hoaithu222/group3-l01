import { render, userEvent } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Text } from 'react-native';

import { Checkbox, type CheckboxProps } from '@/shared/ui/checkbox';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⚠️ `render()` của RNTL 14 phải `await`.
 */
describe('Checkbox', () => {
  it('bấm khi chưa chọn thì báo về `true`', async () => {
    const onChange = jest.fn();
    const screen = await render(<Checkbox checked={false} label="Đồng ý" onChange={onChange} />);

    await userEvent.press(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('bấm khi đang chọn thì báo về `false`', async () => {
    const onChange = jest.fn();
    const screen = await render(<Checkbox checked label="Đồng ý" onChange={onChange} />);

    await userEvent.press(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  /**
   * ⛔ Ô cha của một danh sách: bấm khi đang NỬA CHỌN phải CHỌN HẾT, không phải
   * đảo ngược. Đảo ngược thì `checked` đang là `false` nên nó lại bỏ chọn nốt
   * mấy mục con đang được chọn — đúng ngược ý người dùng.
   */
  it('bấm khi đang nửa chọn thì chọn hết', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Checkbox checked={false} indeterminate label="Chọn tất cả" onChange={onChange} />,
    );

    await userEvent.press(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  /**
   * ⛔ Đây là lý do `indeterminate` tồn tại như một trạng thái riêng.
   *
   * React Native cho `accessibilityState.checked` nhận `boolean | 'mixed'`. Báo
   * `true` cho trạng thái nửa chọn thì người dùng khiếm thị nghe "đã chọn", bấm
   * Gửi, và tưởng mình đã chọn cả danh sách. Màu sắc thì trình đọc màn hình
   * không thấy — `'mixed'` là tín hiệu DUY NHẤT.
   */
  it('trạng thái trợ năng của nửa chọn là "mixed", không phải "đã chọn"', async () => {
    const screen = await render(<Checkbox checked={false} indeterminate label="Chọn tất cả" />);

    const box = screen.getByRole('checkbox');

    expect(box).toBePartiallyChecked();
    expect(box).not.toBeChecked();
  });

  it('trạng thái trợ năng bám theo `checked`', async () => {
    const on = await render(<Checkbox checked label="Đồng ý" />);
    expect(on.getByRole('checkbox')).toBeChecked();

    const off = await render(<Checkbox checked={false} label="Đồng ý" />);
    expect(off.getByRole('checkbox')).not.toBeChecked();
  });

  it('bị khoá thì không bấm được và trình đọc màn hình biết', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Checkbox checked={false} disabled label="Đồng ý" onChange={onChange} />,
    );

    await userEvent.press(screen.getByRole('checkbox'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  /**
   * Checkbox không có nhãn nhìn thấy được (nằm trong một hàng danh sách đã có
   * chữ riêng) vẫn phải đọc được — nếu không trình đọc màn hình chỉ nói "hộp
   * kiểm", không nói hộp kiểm CỦA CÁI GÌ.
   */
  it('nhận nhãn trợ năng riêng khi không có nhãn nhìn thấy được', async () => {
    const screen = await render(
      <Checkbox accessibilityLabel="Chọn giao dịch ngày 12/09" checked={false} />,
    );

    expect(screen.getByLabelText('Chọn giao dịch ngày 12/09')).toBeOnTheScreen();
  });

  it('nhãn CHUỖI vẫn tự trở thành nhãn trợ năng — không phải khai hai lần', async () => {
    const screen = await render(<Checkbox checked={false} label="Đồng ý" />);

    expect(screen.getByLabelText('Đồng ý')).toBeOnTheScreen();
    expect(screen.getByText('Đồng ý')).toBeOnTheScreen();
  });
});

/**
 * Nhãn `ReactNode` — ca "Tôi đã đọc, đồng ý với các **Điều kiện, điều khoản**",
 * xuất hiện 7 lần trong bản vẽ. Link gạch chân nằm GIỮA câu nên không có cách
 * nào dựng bằng `label?: string`.
 */
describe('Checkbox — nhãn ReactNode', () => {
  const terms = (onPress: () => void) => (
    <Text className="text-body-md font-regular text-fg-1">
      Tôi đã đọc, đồng ý với các{' '}
      <Text className="text-link-md text-fg-brand underline" onPress={onPress}>
        Điều kiện, điều khoản
      </Text>{' '}
      giao dịch
    </Text>
  );

  it('dựng được câu có link lồng giữa', async () => {
    const screen = await render(
      <Checkbox
        accessibilityLabel="Tôi đã đọc và đồng ý với điều kiện, điều khoản giao dịch"
        checked={false}
        label={terms(jest.fn())}
      />,
    );

    expect(screen.getByText('Điều kiện, điều khoản')).toBeOnTheScreen();
  });

  /**
   * ⛔ Đây là lý do `accessibilityLabel` bị ép thành BẮT BUỘC ở nhánh này:
   * React không cho đọc chữ bên trong một element đã dựng, nên component không
   * tự rút nhãn ra được. Thiếu nó thì ở màn xác nhận giao dịch, trình đọc màn
   * hình chỉ nói "hộp kiểm" — người dùng khiếm thị không biết mình đồng ý cái gì.
   */
  it('đọc lên bằng `accessibilityLabel` mà nơi gọi truyền vào', async () => {
    const screen = await render(
      <Checkbox
        accessibilityLabel="Tôi đã đọc và đồng ý với điều kiện, điều khoản giao dịch"
        checked={false}
        label={terms(jest.fn())}
      />,
    );

    expect(
      screen.getByLabelText('Tôi đã đọc và đồng ý với điều kiện, điều khoản giao dịch'),
    ).toBeOnTheScreen();
  });

  it('bấm vào ô vẫn đảo trạng thái như thường', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Checkbox
        accessibilityLabel="Tôi đã đọc và đồng ý"
        checked={false}
        label={terms(jest.fn())}
        onChange={onChange}
      />,
    );

    await userEvent.press(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  /** Link phải mở được màn điều khoản — đó là toàn bộ lý do nhãn thành `ReactNode`. */
  it('bấm vào link chạy handler của chính link', async () => {
    const openTerms = jest.fn();
    const screen = await render(
      <Checkbox
        accessibilityLabel="Tôi đã đọc và đồng ý"
        checked={false}
        label={terms(openTerms)}
      />,
    );

    await userEvent.press(screen.getByText('Điều kiện, điều khoản'));

    expect(openTerms).toHaveBeenCalled();
  });

  /**
   * ⚠️ Mẫu quen tay `label={showTerms && <Terms />}` truyền xuống `false`. Không
   * chặn thì component dựng một lớp bọc `flex-1` RỖNG: ô checkbox bị đẩy dính
   * mép trái, phần còn lại của hàng trống trơn, và React không vẽ `false` nên
   * chẳng có lỗi nào báo.
   */
  it('`false` và chuỗi rỗng được coi là KHÔNG có nhãn', async () => {
    const screen = await render(
      <Checkbox accessibilityLabel="Điều khoản" checked={false} label={false} />,
    );

    expect(screen.getByLabelText('Điều khoản')).toBeOnTheScreen();
  });

  /**
   * ── Kiểm ở tầng KIỂU, không phải tầng chạy ─────────────────────────────────
   *
   * "`accessibilityLabel` bắt buộc khi nhãn không phải chuỗi" là một ràng buộc
   * của `tsc`, không phải hành vi lúc chạy — muốn thấy nó gãy thì phải viết ra
   * một lời gọi SAI, mà lời gọi sai thì `npm run typecheck` chặn ngay. Nên kiểm
   * bằng chính hệ kiểu: ba hằng số dưới đây chỉ biên dịch được khi union
   * `CheckboxA11yProps` phân loại đúng ba ca. `expect` chỉ để `noUnusedLocals`
   * không kêu — người gác thật là `tsc`.
   */
  it('kiểu: nhãn ReactNode mà thiếu `accessibilityLabel` thì KHÔNG hợp lệ', () => {
    type Accepts<P> = P extends CheckboxProps ? true : false;

    const stringLabelAlone: Accepts<{ checked: boolean; label: string }> = true;
    const nodeLabelWithA11y: Accepts<{
      accessibilityLabel: string;
      checked: boolean;
      label: ReactNode;
    }> = true;
    const nodeLabelAlone: Accepts<{ checked: boolean; label: ReactNode }> = false;

    expect([stringLabelAlone, nodeLabelWithA11y, nodeLabelAlone]).toEqual([true, true, false]);
  });
});
