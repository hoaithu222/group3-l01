import { render, userEvent } from '@testing-library/react-native';
import { Keyboard, Text } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';

import { KeyboardBar } from '@/shared/ui/keyboard';

/**
 * `useKeyboardState` là một `jest.fn` đến từ bản mock CHÍNH THỨC của thư viện
 * (`jest.setup.js` nối `react-native-keyboard-controller/jest`), và mặc định nó
 * báo bàn phím ĐANG ĐÓNG.
 *
 * ⚠️ Phải ép kiểu qua `unknown`: hàm thật là generic (`<T>(selector?) => T`) nên
 * `jest.mocked` suy ra kiểu trả về là cả object trạng thái, trong khi
 * `KeyboardBar` chỉ lấy `state.isVisible` (một `boolean`). ⛔ Không dùng `any`.
 *
 * ⚠️ Sửa xong phải TRẢ LẠI bản cài đặt gốc — mock này dùng chung cho mọi test
 * trong file, quên khôi phục là mọi ca sau đó ngầm chạy với "bàn phím đang mở".
 */
const keyboardState = useKeyboardState as unknown as jest.Mock;
const defaultKeyboardState = keyboardState.getMockImplementation();

afterEach(() => {
  if (defaultKeyboardState) keyboardState.mockImplementation(defaultKeyboardState);
});

/** Giả lập bàn phím đang mở cho ĐÚNG ca đang chạy. */
function withKeyboardOpen() {
  keyboardState.mockReturnValue(true);
}

/**
 * ⚠️ Chỉ test HÀNH VI. `className` KHÔNG thành `style` trong Jest (Metro mới
 * biên dịch Tailwind) — xem `docs/rules/testing.md`. Chiều cao 48, đệm 8 và
 * đường kẻ trên nằm trong `className` nên chúng được `npm run check:classes` và
 * mắt người soát, không phải file này.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('KeyboardBar', () => {
  /**
   * ⛔ Ca mặc định, và là ca quan trọng nhất: thanh này KHÔNG chừa vùng an toàn
   * đáy (nó sống trên bàn phím, xem `KeyboardBar.tsx`). Hiện lúc bàn phím đóng
   * là nằm đè lên vạch gạt ngang của iPhone — hệ điều hành nuốt cú chạm và
   * người dùng bấm mãi không được.
   */
  it('bàn phím đang đóng thì không vẽ gì', async () => {
    const screen = await render(<KeyboardBar />);

    expect(screen.toJSON()).toBeNull();
  });

  it('bàn phím mở thì tự hiện, không cần truyền visible', async () => {
    withKeyboardOpen();

    const screen = await render(<KeyboardBar />);

    expect(screen.getByRole('button', { name: 'Xong' })).toBeOnTheScreen();
  });

  it('visible ép hiện được kể cả khi bàn phím đóng', async () => {
    const screen = await render(<KeyboardBar visible />);

    expect(screen.getByRole('button', { name: 'Xong' })).toBeOnTheScreen();
  });

  /** `visible={false}` phải THẮNG cả trạng thái bàn phím — nơi gọi có quyền tắt. */
  it('visible={false} ẩn được cả khi bàn phím đang mở', async () => {
    withKeyboardOpen();

    const screen = await render(<KeyboardBar visible={false} />);

    expect(screen.toJSON()).toBeNull();
  });

  it('vẽ nội dung khe leading bên cạnh nút', async () => {
    const screen = await render(<KeyboardBar leading={<Text>1.000.000</Text>} visible />);

    expect(screen.getByText('1.000.000')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Xong' })).toBeOnTheScreen();
  });

  /** Bản vẽ dùng cả "Xong" lẫn "Kiểm tra" cho cùng chỗ ⇒ nhãn phải đổi được. */
  it('doneLabel đổi được nhãn nút', async () => {
    const screen = await render(<KeyboardBar doneLabel="Kiểm tra" visible />);

    expect(screen.getByRole('button', { name: 'Kiểm tra' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Xong' })).toBeNull();
  });

  it('bấm nút thì gọi onDone đúng một lần', async () => {
    const onDone = jest.fn();
    const screen = await render(<KeyboardBar visible onDone={onDone} />);

    await userEvent.press(screen.getByRole('button', { name: 'Xong' }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Không truyền `onDone` thì nút vẫn phải LÀM GÌ ĐÓ.
   *
   * Đây là lý do cả thanh tồn tại: bàn phím số không có phím "return", nên nếu
   * nút này không đóng bàn phím thì người dùng nhập xong bị kẹt — không thấy
   * được nút xác nhận đang nằm dưới bàn phím.
   */
  it('không truyền onDone thì nút đóng bàn phím', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const screen = await render(<KeyboardBar visible />);

    await userEvent.press(screen.getByRole('button', { name: 'Xong' }));

    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });
});
