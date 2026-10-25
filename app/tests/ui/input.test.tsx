import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import { z } from 'zod';

import { useZodForm } from '@/shared/form/useZodForm';
import { FormInput, Input } from '@/shared/ui/input';

/**
 * Ô nhập của bộ giao diện — test HÀNH VI.
 *
 * ⛔ Style của NativeWind KHÔNG có trong Jest (Metro mới biên dịch Tailwind),
 * nên `style` luôn rỗng — xem `docs/rules/testing.md`. Cái kiểm ở đây: chữ đi
 * ra đúng callback, trạng thái khoá có tác dụng, và trình đọc màn hình có đủ
 * thông tin.
 *
 * ⚠️ `render()` / `fireEvent()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('Input', () => {
  it('gọi onChangeText với đúng chữ người dùng gõ', async () => {
    const onChangeText = jest.fn();
    const screen = await render(<Input label="Họ tên" onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByLabelText('Họ tên'), 'Nguyễn Văn Ánh');

    expect(onChangeText).toHaveBeenCalledWith('Nguyễn Văn Ánh');
  });

  /**
   * Trình đọc màn hình KHÔNG nhìn thấy dấu `*` đỏ — nó đọc ra tiếng "sao" hoặc
   * bỏ qua hẳn. Thông tin "bắt buộc" vì vậy phải nằm trong nhãn của chính ô.
   */
  it('gấp thông tin "bắt buộc" vào nhãn cho trình đọc màn hình', async () => {
    const screen = await render(<Input label="Email" required />);

    expect(screen.getByLabelText('Email, bắt buộc')).toBeOnTheScreen();
  });

  it('hiện dòng chữ lỗi dưới ô', async () => {
    const screen = await render(<Input label="Email" message="Email không đúng định dạng" />);

    expect(screen.getByText('Email không đúng định dạng')).toBeOnTheScreen();
    // `alert` để trình đọc màn hình đọc ngay khi lỗi xuất hiện, không đợi
    // người dùng chạm lại vào ô.
    expect(screen.getByRole('alert')).toBeOnTheScreen();
  });

  it('bị vô hiệu hoá thì không nhận chữ', async () => {
    const onChangeText = jest.fn();
    const screen = await render(<Input disabled label="Email" onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.com');

    expect(onChangeText).not.toHaveBeenCalled();
  });

  /**
   * `readOnly` chỉ chặn SỬA — ô vẫn chọn/sao chép được, chữ vẫn đen (khác
   * `disabled`). Hình thức thì không kiểm được ở đây (NativeWind không biên
   * dịch trong Jest), nhưng phần XƯỚNG LÊN thì có: `AccessibilityState` không
   * có khoá `readonly` nên `Input` gộp vào `disabled`, nếu không thì người dùng
   * khiếm thị chạm vào, chờ bàn phím, và kết luận app treo.
   */
  it('readOnly chặn sửa nội dung và báo trạng thái cho trình đọc màn hình', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <Input label="Số tài khoản" readOnly onChangeText={onChangeText} />,
    );

    await fireEvent.changeText(screen.getByLabelText('Số tài khoản'), '123');

    expect(onChangeText).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Số tài khoản')).toBeDisabled();
  });

  /** Chú thích phải nhãn đi kèm biểu tượng ⓘ, nhưng chữ vẫn phải đọc ra được. */
  it('hiện chú thích phải nhãn', async () => {
    const screen = await render(<Input hint="Tối đa 50 ký tự" label="Ghi chú" />);

    expect(screen.getByText('Tối đa 50 ký tự')).toBeOnTheScreen();
  });

  /**
   * Nhãn nằm TRONG khung (kiểu "Text area" / "Money Form" của Figma) chỉ đổi bố
   * cục — nhãn cho trình đọc màn hình và luồng gõ chữ phải y hệt.
   */
  it('labelInside giữ nguyên nhãn và vẫn nhận chữ', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <Input label="Ghi chú" labelInside multiline onChangeText={onChangeText} />,
    );

    await fireEvent.changeText(screen.getByLabelText('Ghi chú'), 'Trả nợ');

    expect(onChangeText).toHaveBeenCalledWith('Trả nợ');
  });

  /**
   * ⚠️ Bàn phím chữ trên ô số là một cú chạm thừa ở MỌI ô số tài khoản / số
   * tiền. `digitsOnly` đã nói rõ ô này chỉ nhận chữ số nên bàn phím phải theo.
   */
  it('digitsOnly mở sẵn bàn phím số, nhưng caller vẫn ghi đè được', async () => {
    const screen = await render(<Input digitsOnly label="Số tài khoản" />);

    expect(screen.getByLabelText('Số tài khoản').props.keyboardType).toBe('number-pad');
  });

  /**
   * ⛔ Mặc định KHÔNG có nút xoá. `clearable` là prop THÊM, và test này khoá
   * lại điều đó: 30+ ô nhập trong bản vẽ không có nút nào, bật mặc định là mọc
   * thêm một biểu tượng bấm được trên tất cả.
   */
  it('không có nút xoá khi chưa bật clearable', async () => {
    const screen = await render(<Input label="Họ tên" />);

    await fireEvent.changeText(screen.getByLabelText('Họ tên'), 'Nguyễn Văn A');

    expect(screen.queryByLabelText('Xoá nội dung')).toBeNull();
  });

  it('clearable: nút xoá chỉ hiện khi ô có chữ, bấm thì xoá sạch', async () => {
    const onChangeText = jest.fn();
    const screen = await render(<Input clearable label="Họ tên" onChangeText={onChangeText} />);

    // Ô rỗng thì không có gì để xoá — một nút không làm gì là một nút gây hiểu lầm.
    expect(screen.queryByLabelText('Xoá nội dung')).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Họ tên'), 'Nguyễn Văn A');
    await fireEvent.press(screen.getByLabelText('Xoá nội dung'));

    // ⛔ Ô UNCONTROLLED nên nơi gọi phải được báo là giá trị nay là chuỗi rỗng;
    // thiếu bước này thì tầng lọc/form vẫn giữ chữ cũ trong khi ô đã trắng.
    expect(onChangeText).toHaveBeenLastCalledWith('');
    expect(screen.queryByLabelText('Xoá nội dung')).toBeNull();
  });

  /**
   * ⛔ `trailing` là khe của NƠI GỌI (đơn vị "VND", nút chọn danh bạ). Nút xoá
   * đứng SAU nó chứ không chiếm chỗ của nó — đẩy `trailing` ra là mọi ô số tiền
   * bật `clearable` đều mất chữ "VND" mà không có lỗi nào báo.
   */
  it('clearable không đẩy trailing của nơi gọi ra ngoài', async () => {
    const screen = await render(
      <Input clearable label="Số tiền" trailing={<Text>VND</Text>} onChangeText={jest.fn()} />,
    );

    await fireEvent.changeText(screen.getByLabelText('Số tiền'), '100000');

    expect(screen.getByText('VND')).toBeOnTheScreen();
    expect(screen.getByLabelText('Xoá nội dung')).toBeOnTheScreen();
  });

  /**
   * Form 9 ô mà nút nào cũng tên "Xoá nội dung" thì trình đọc màn hình đọc ra 9
   * lựa chọn không phân biệt được — nên nhãn phải đổi được từ nơi gọi.
   */
  it('clearLabel đổi được nhãn trợ năng của nút xoá', async () => {
    const screen = await render(
      <Input clearable clearLabel="Xoá số điện thoại" label="Số điện thoại" />,
    );

    await fireEvent.changeText(screen.getByLabelText('Số điện thoại'), '0900000000');

    expect(screen.getByLabelText('Xoá số điện thoại')).toBeOnTheScreen();
  });

  /** Ô khoá / chỉ-đọc nói "không sửa được" — một nút xoá trong đó nói ngược lại. */
  it('ô readOnly hoặc disabled không hiện nút xoá', async () => {
    const screen = await render(<Input clearable label="Số tài khoản" readOnly value="123456" />);

    expect(screen.queryByLabelText('Xoá nội dung')).toBeNull();
  });

  /**
   * Ô CONTROLLED (`FormInput` và mọi ô tự truyền `value`) suy nội dung thẳng từ
   * `value`, không từ state trong ô: `form.reset()` xoá giá trị mà nút × vẫn
   * còn đó thì người dùng bấm vào một nút không làm gì.
   */
  it('clearable trên ô controlled bám theo value', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <Input clearable label="Email" value="a@b.com" onChangeText={onChangeText} />,
    );

    await fireEvent.press(screen.getByLabelText('Xoá nội dung'));

    expect(onChangeText).toHaveBeenLastCalledWith('');
  });

  it('nút con mắt đổi giữa hiện và ẩn mật khẩu', async () => {
    const screen = await render(<Input label="Mật khẩu" secure />);

    await fireEvent.press(screen.getByLabelText('Hiện mật khẩu'));

    expect(screen.getByLabelText('Ẩn mật khẩu')).toBeOnTheScreen();
  });

  /**
   * ⚠️ `keyboardType="numeric"` KHÔNG đủ: bàn phím số của Android vẫn có dấu
   * chấm, phẩy và dấu trừ. Người dùng gõ "1.000" và giá trị gửi lên máy chủ
   * thành rác — lỗi chỉ lộ ra ở tận lúc gọi API.
   */
  it('digitsOnly lọc mọi thứ không phải chữ số', async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <Input digitsOnly keyboardType="numeric" label="Số tiền" onChangeText={onChangeText} />,
    );

    await fireEvent.changeText(screen.getByLabelText('Số tiền'), '1.000,5');

    expect(onChangeText).toHaveBeenCalledWith('10005');
    // Mặc định `number-pad` đặt TRƯỚC spread ⇒ khai của caller phải thắng.
    expect(screen.getByLabelText('Số tiền').props.keyboardType).toBe('numeric');
  });
});

const emailSchema = z.object({ email: z.string().min(1, 'Chưa nhập e-mail') });

function EmailForm({ onSubmit }: { onSubmit: (values: { email: string }) => void }) {
  const form = useZodForm(emailSchema, { defaultValues: { email: '' } });

  return (
    <View>
      <FormInput control={form.control} label="Email" name="email" />
      <Pressable accessibilityRole="button" onPress={form.handleSubmit(onSubmit)}>
        <Text>Gửi</Text>
      </Pressable>
    </View>
  );
}

describe('FormInput', () => {
  it('đưa chữ đã gõ vào giá trị form', async () => {
    const onSubmit = jest.fn();
    const screen = await render(<EmailForm onSubmit={onSubmit} />);

    await fireEvent.changeText(screen.getByLabelText('Email'), 'a@b.com');
    await fireEvent.press(screen.getByRole('button'));

    // `handleSubmit` gọi kèm cả sự kiện chạm ở tham số thứ hai — chỉ đối chiếu
    // tham số ĐẦU, nếu không assertion đỏ vì một thứ không liên quan.
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ email: 'a@b.com' });
  });

  /**
   * Lỗi lấy từ `fieldState` chứ không phải từ `formState.errors[name]` — chỗ
   * đó rất dễ gõ sai tên trường và lỗi thì "không hiện" một cách im lặng.
   */
  it('hiện lỗi kiểm dữ liệu ngay dưới ô', async () => {
    const onSubmit = jest.fn();
    const screen = await render(<EmailForm onSubmit={onSubmit} />);

    await fireEvent.press(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText('Chưa nhập e-mail')).toBeOnTheScreen());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
