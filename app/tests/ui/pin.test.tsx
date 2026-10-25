import { fireEvent, render } from '@testing-library/react-native';

import { PinInput } from '@/shared/ui/pin';

/**
 * Ô nhập mã PIN/OTP — test HÀNH VI.
 *
 * ⛔ Style của NativeWind KHÔNG có trong Jest, nên không kiểm màu viền của ô
 * lỗi ở đây; cái kiểm được là mã đi ra đúng, callback bắn đúng lúc, và trình
 * đọc màn hình có gì để đọc. Xem `docs/rules/testing.md`.
 *
 * ⚠️ `render()` / `fireEvent()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('PinInput', () => {
  const LABEL = 'Mã gồm 6 chữ số';

  it('gọi onChange mỗi lần mã đổi và onComplete ĐÚNG MỘT LẦN khi đủ số', async () => {
    const onChange = jest.fn();
    const onComplete = jest.fn();
    const screen = await render(<PinInput onChange={onChange} onComplete={onComplete} />);

    await fireEvent.changeText(screen.getByLabelText(LABEL), '12345');
    expect(onChange).toHaveBeenLastCalledWith('12345');
    expect(onComplete).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText(LABEL), '123456');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  /**
   * ⚠️ Không thừa: bàn phím `number-pad` của Android VẪN có dấu chấm, phẩy và
   * dấu trừ, còn mã dán từ tin nhắn thì kéo theo cả dấu cách. Không lọc thì mã
   * gửi lên máy chủ có rác mà không có lỗi nào báo.
   */
  it('bỏ mọi ký tự không phải chữ số và cắt theo số ô', async () => {
    const onChange = jest.fn();
    const screen = await render(<PinInput length={4} onChange={onChange} />);

    await fireEvent.changeText(screen.getByLabelText('Mã gồm 4 chữ số'), '1a2 3-4567');

    expect(onChange).toHaveBeenLastCalledWith('1234');
  });

  it('hiện chữ số vào từng ô khi không che', async () => {
    const screen = await render(<PinInput length={4} />);

    await fireEvent.changeText(screen.getByLabelText('Mã gồm 4 chữ số'), '2468');

    // ⚠️ `includeHiddenElements`: hàng ô bị ẩn khỏi TRÌNH ĐỌC MÀN HÌNH có chủ ý
    // (chỉ là hình vẽ), mà RNTL mặc định bỏ qua đúng những element như vậy.
    expect(screen.getByText('2', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText('8', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  /**
   * `secure` thay chữ số bằng chấm tròn. Chấm là hình vẽ, không phải chữ — nên
   * cái kiểm được là chữ số KHÔNG còn lọt ra màn hình (và cũng không lọt vào
   * trình đọc màn hình).
   */
  it('che chữ số khi bật secure', async () => {
    const screen = await render(<PinInput length={4} secure />);

    await fireEvent.changeText(screen.getByLabelText('Mã gồm 4 chữ số'), '2468');

    expect(screen.queryByText('2', { includeHiddenElements: true })).toBeNull();
  });

  /**
   * Figma vẽ dấu `–` (hoặc một chấm mờ khi che) trong MỌI ô chưa điền — đó là
   * tín hiệu duy nhất cho biết còn thiếu bao nhiêu chữ số. Hàng ô trắng trơn
   * thì người dùng phải tự đếm ô rỗng.
   */
  it('ô chưa điền có ký tự giữ chỗ, ô đã điền thì không', async () => {
    const screen = await render(<PinInput length={4} />);
    const options = { includeHiddenElements: true } as const;

    expect(screen.getAllByText('–', options)).toHaveLength(4);

    await fireEvent.changeText(screen.getByLabelText('Mã gồm 4 chữ số'), '12');

    expect(screen.getAllByText('–', options)).toHaveLength(2);
  });

  /**
   * Kiểu `dot` (màn nhập PIN đăng nhập) chỉ có chấm tròn — KHÔNG chữ số, KHÔNG
   * dấu giữ chỗ. Lọt chữ số ra màn hình là lộ luôn mã PIN cho người đứng cạnh.
   */
  it('variant="dot" không để chữ số nào lọt ra màn hình', async () => {
    const screen = await render(<PinInput length={4} variant="dot" />);
    const options = { includeHiddenElements: true } as const;

    await fireEvent.changeText(screen.getByLabelText('Mã gồm 4 chữ số'), '2468');

    expect(screen.queryByText('2', options)).toBeNull();
    expect(screen.queryByText('–', options)).toBeNull();
  });

  it('bị vô hiệu hoá thì không nhận chữ số', async () => {
    const onChange = jest.fn();
    const screen = await render(<PinInput disabled onChange={onChange} />);

    await fireEvent.changeText(screen.getByLabelText(LABEL), '123456');

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText(LABEL)).toBeDisabled();
  });

  it('hiện dòng chữ lỗi khi error là chuỗi', async () => {
    const screen = await render(<PinInput error="Mã xác thực không đúng" />);

    expect(screen.getByText('Mã xác thực không đúng')).toBeOnTheScreen();
  });

  /** `error` dạng boolean chỉ tô đỏ — không được tự bịa ra chữ lỗi. */
  it('error dạng boolean thì không thêm dòng chữ nào', async () => {
    const screen = await render(<PinInput error />);

    expect(screen.toJSON()).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('nhận nhãn riêng cho trình đọc màn hình', async () => {
    const screen = await render(<PinInput label="Mã PIN đăng nhập" length={4} secure />);

    expect(screen.getByLabelText('Mã PIN đăng nhập')).toBeOnTheScreen();
  });
});
