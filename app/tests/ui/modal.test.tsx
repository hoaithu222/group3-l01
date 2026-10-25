import { Text } from 'react-native';
import { render, userEvent } from '@testing-library/react-native';

import { Dialog } from '@/shared/ui/modal';

/**
 * ⚠️ Style của NativeWind KHÔNG có trong test (Jest không chạy Metro nên
 * Tailwind không được biên dịch — xem `tests/shared/rendering.test.tsx`). Nên
 * ở đây chỉ kiểm HÀNH VI: mở/đóng, callback, nhãn cho trình đọc màn hình.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`.
 *
 * `Dialog` KHÔNG cần `SafeAreaProvider` bọc ngoài (khác `BottomSheet`): hộp
 * thoại nằm giữa màn hình nên không đụng tới vạch gạt ngang, và cũng không đọc
 * `useSafeAreaInsets()`.
 */
describe('Dialog', () => {
  it('không dựng nội dung khi visible = false', async () => {
    const screen = await render(
      <Dialog
        description="Số dư không đủ."
        title="Thông báo"
        visible={false}
        onClose={jest.fn()}
      />,
    );

    expect(screen.queryByText('Thông báo')).toBeNull();
  });

  it('dựng tiêu đề và mô tả khi visible = true', async () => {
    const screen = await render(
      <Dialog description="Số dư không đủ." title="Thông báo" visible onClose={jest.fn()} />,
    );

    expect(screen.getByText('Thông báo')).toBeOnTheScreen();
    expect(screen.getByText('Số dư không đủ.')).toBeOnTheScreen();
  });

  it('gọi onClose khi bấm nền mờ', async () => {
    const onClose = jest.fn();
    const screen = await render(<Dialog title="Thông báo" visible onClose={onClose} />);

    await userEvent.press(screen.getByLabelText('Đóng'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Ca này là lý do `dismissOnBackdrop` tồn tại. Hộp thoại "Huỷ giao dịch?"
   * mà đóng được bằng cách chạm ra ngoài thì người dùng chạm nhầm rồi đinh ninh
   * mình đã huỷ — trong khi giao dịch vẫn chạy tiếp.
   */
  it('KHÔNG dựng nút nền mờ khi dismissOnBackdrop = false', async () => {
    const screen = await render(
      <Dialog dismissOnBackdrop={false} title="Thông báo" visible onClose={jest.fn()} />,
    );

    // Nền mờ không còn là nút — nếu không trình đọc màn hình đọc ra một nút
    // "Đóng" mà bấm vào không có gì xảy ra.
    expect(screen.queryByLabelText('Đóng')).toBeNull();
  });

  it('nút chính gọi đúng callback của nó', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    const screen = await render(
      <Dialog
        primaryAction={{ label: 'Xác nhận', onPress: onPrimary }}
        secondaryAction={{ label: 'Huỷ', onPress: onSecondary }}
        title="Thông báo"
        visible
        onClose={jest.fn()}
      />,
    );

    await userEvent.press(screen.getByText('Xác nhận'));

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).not.toHaveBeenCalled();
  });

  it('nút phụ gọi đúng callback của nó', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    const screen = await render(
      <Dialog
        primaryAction={{ label: 'Xác nhận', onPress: onPrimary }}
        secondaryAction={{ label: 'Huỷ', onPress: onSecondary }}
        title="Thông báo"
        visible
        onClose={jest.fn()}
      />,
    );

    await userEvent.press(screen.getByText('Huỷ'));

    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  /**
   * Không khoá thì người dùng bấm lần thứ hai vì lần đầu chưa thấy gì xảy ra —
   * và backend nhận hai lệnh chuyển tiền.
   */
  it('nút bị khoá thì không gọi callback và được báo là disabled', async () => {
    const onPrimary = jest.fn();
    const screen = await render(
      <Dialog
        primaryAction={{ disabled: true, label: 'Xác nhận', onPress: onPrimary }}
        title="Thông báo"
        visible
        onClose={jest.fn()}
      />,
    );

    await userEvent.press(screen.getByText('Xác nhận'));

    expect(onPrimary).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeDisabled();
  });

  /**
   * ⛔ Ca CHẮC CHẮN gặp: mô tả do backend trả về, dài hơn một màn. Thẻ nay có
   * trần chiều cao + `ScrollView` quanh phần chữ — nếu ai đó gỡ `ScrollView`
   * hoặc quên `shrink`, hai nút bị đẩy ra ngoài màn và người dùng KHÔNG có cách
   * nào chạm tới. Ở tầng Jest không đo được vị trí, nên phần kiểm được là: mô tả
   * dài KHÔNG nuốt mất hai nút khỏi cây.
   */
  it('mô tả dài vẫn giữ đủ hai nút', async () => {
    const screen = await render(
      <Dialog
        description={'Điều khoản dịch vụ. '.repeat(120)}
        primaryAction={{ label: 'Đồng ý', onPress: jest.fn() }}
        secondaryAction={{ label: 'Huỷ', onPress: jest.fn() }}
        title="Điều khoản"
        visible
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Đồng ý' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeOnTheScreen();
  });

  /**
   * ⛔ `actionsDirection="column"` không chỉ đổi `flexDirection` — nó đổi cả
   * THỨ TỰ hai nút. Hàng ngang: phụ TRÁI, chính PHẢI. Cột dọc: nút CHÍNH lên
   * TRÊN, đúng mock trong section Modals. Giữ nguyên thứ tự khi xếp dọc là nút
   * "Huỷ" nằm trên nút "Xác nhận" — ngược cả hai bản vẽ, mà `style` thì Jest
   * không đọc được nên chỉ thứ tự cây mới bắt được lỗi này.
   */
  it('xếp dọc thì nút CHÍNH đứng trước', async () => {
    const screen = await render(
      <Dialog
        actionsDirection="column"
        primaryAction={{ label: 'Xác nhận và tiếp tục', onPress: jest.fn() }}
        secondaryAction={{ label: 'Huỷ', onPress: jest.fn() }}
        title="Thông báo"
        visible
        onClose={jest.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');

    expect(
      buttons.indexOf(screen.getByRole('button', { name: 'Xác nhận và tiếp tục' })),
    ).toBeLessThan(buttons.indexOf(screen.getByRole('button', { name: 'Huỷ' })));
  });

  it('xếp ngang (mặc định) thì nút PHỤ đứng trái', async () => {
    const screen = await render(
      <Dialog
        primaryAction={{ label: 'Xác nhận và tiếp tục', onPress: jest.fn() }}
        secondaryAction={{ label: 'Huỷ', onPress: jest.fn() }}
        title="Thông báo"
        visible
        onClose={jest.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');

    expect(buttons.indexOf(screen.getByRole('button', { name: 'Huỷ' }))).toBeLessThan(
      buttons.indexOf(screen.getByRole('button', { name: 'Xác nhận và tiếp tục' })),
    );
  });

  it('dựng nội dung phụ truyền qua children', async () => {
    const screen = await render(
      <Dialog title="Thông báo" variant="loading" visible onClose={jest.fn()}>
        <Text>Thời gian xác thực còn lại: 180s</Text>
      </Dialog>,
    );

    expect(screen.getByText('Thời gian xác thực còn lại: 180s')).toBeOnTheScreen();
  });
});
