import { useEffect, useState, type ReactNode } from 'react';
import { fireEvent, render, userEvent } from '@testing-library/react-native';
import { useForm } from 'react-hook-form';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FormSelect, Select, SelectSheet, type SelectOption } from '@/shared/ui/select';

/**
 * ⛔ Bắt buộc. `SelectSheet` mượn vỏ `BottomSheet`, mà tấm đó dùng
 * `react-native-keyboard-controller` — gói gọi thẳng xuống module native ngay
 * lúc NẠP MODULE, nên không mock thì cả suite chết trước khi render dòng nào.
 *
 * ⚠️ Viết SAU phần `import` vẫn đúng: `babel-plugin-jest-hoist` nâng mọi lời gọi
 * `jest.mock` lên trên các import. Đặt trước import thì `import/first` báo lỗi.
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

/**
 * ⛔ `useSafeAreaInsets()` NÉM LỖI khi không có provider; `initialMetrics` là
 * bắt buộc vì trong Jest không tầng native nào đo được và tấm trượt sẽ không
 * bao giờ render xong.
 */
const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const OPTIONS: readonly SelectOption[] = [
  { label: 'Thành phố Hà Nội', value: 'HN' },
  { description: 'Miền Trung', label: 'Thành phố Đà Nẵng', value: 'DN' },
  { disabled: true, label: 'Tỉnh Hưng Yên', value: 'HY' },
];

/** Nhãn trợ năng của chính ô chọn — dùng lại ở gần hết các ca. */
const FIELD = 'Tỉnh/Thành, bắt buộc';

/**
 * Ghép đúng cặp `Select` + `SelectSheet` như một màn hình thật: ô chọn không tự
 * mở tấm, nơi gọi giữ state `open` và state giá trị.
 */
function Harness({ onPick }: { onPick?: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | undefined>(undefined);
  const selected = OPTIONS.find((option) => option.value === value);

  return (
    <>
      <Select
        label="Tỉnh/Thành"
        placeholder="Chọn Tỉnh/ Thành phố"
        required
        value={selected?.label}
        onPress={() => setOpen(true)}
      />
      <SelectSheet
        options={OPTIONS}
        searchable
        title="Danh sách Tỉnh/Thành"
        value={value}
        visible={open}
        onChange={(next) => {
          setValue(next);
          onPick?.(next);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/**
 * Test HÀNH VI.
 *
 * ⛔ Không kiểm màu/khoảng cách: NativeWind biên dịch class bằng Metro mà Jest
 * không chạy Metro ⇒ `style` luôn rỗng (xem `docs/rules/testing.md`).
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ — phải `await`.
 */
describe('Select', () => {
  it('bấm ô chọn thì mở tấm trượt', async () => {
    const screen = await render(<Harness />, { wrapper: Wrapper });

    // Tấm chưa mở ⇒ `<Modal visible={false}>` không dựng con nào.
    expect(screen.queryByText('Danh sách Tỉnh/Thành')).toBeNull();

    await userEvent.press(screen.getByRole('button', { name: FIELD }));

    expect(screen.getByText('Danh sách Tỉnh/Thành')).toBeOnTheScreen();
    expect(screen.getByText('Thành phố Hà Nội')).toBeOnTheScreen();
  });

  it('KHÔNG gọi onPress khi bị vô hiệu hoá, và báo `disabled` cho trình đọc màn hình', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Select disabled label="Tỉnh/Thành" placeholder="Chọn Tỉnh/ Thành phố" onPress={onPress} />,
      { wrapper: Wrapper },
    );

    const field = screen.getByRole('button', { name: 'Tỉnh/Thành' });
    await userEvent.press(field);

    expect(onPress).not.toHaveBeenCalled();
    expect(field).toBeDisabled();
  });

  it('hiện câu lỗi dưới ô, và trình đọc màn hình nghe được câu đó', async () => {
    const screen = await render(
      <Select
        label="Tỉnh/Thành"
        message="Vui lòng chọn Tỉnh/Thành"
        messageTone="error"
        required
        onPress={jest.fn()}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('Vui lòng chọn Tỉnh/Thành')).toBeOnTheScreen();
    /* ⛔ Câu lỗi phải vào `accessibilityHint` của chính ô: người dùng khiếm thị
       lia tới ô mà không nghe được vì sao form không gửi đi được thì họ chỉ có
       cách bấm "Tiếp tục" lặp lại. */
    expect(screen.getByRole('button', { name: FIELD }).props.accessibilityHint).toBe(
      'Vui lòng chọn Tỉnh/Thành',
    );
  });

  it('nhãn trợ năng nói được đang chọn gì, cả lúc chưa chọn lẫn sau khi chọn', async () => {
    const screen = await render(<Harness />, { wrapper: Wrapper });

    expect(screen.getByRole('button', { name: FIELD })).toHaveAccessibilityValue({
      text: 'Chưa chọn. Chọn Tỉnh/ Thành phố',
    });

    await userEvent.press(screen.getByRole('button', { name: FIELD }));
    await userEvent.press(screen.getByRole('button', { name: 'Thành phố Hà Nội' }));

    expect(screen.getByRole('button', { name: FIELD })).toHaveAccessibilityValue({
      text: 'Thành phố Hà Nội',
    });
  });
});

describe('SelectSheet', () => {
  it('chọn một mục thì gọi onChange rồi đóng tấm', async () => {
    const onPick = jest.fn();
    const screen = await render(<Harness onPick={onPick} />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: FIELD }));
    await userEvent.press(screen.getByRole('button', { name: 'Thành phố Hà Nội' }));

    expect(onPick).toHaveBeenCalledWith('HN');
    // Không có `footer` ⇒ bấm một dòng là xong, tấm tự đóng.
    expect(screen.queryByText('Danh sách Tỉnh/Thành')).toBeNull();
  });

  it('mục `disabled` bấm không ăn', async () => {
    const onPick = jest.fn();
    const screen = await render(<Harness onPick={onPick} />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: FIELD }));
    await fireEvent.press(screen.getByRole('button', { name: 'Tỉnh Hưng Yên' }));

    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText('Danh sách Tỉnh/Thành')).toBeOnTheScreen();
  });

  it('dòng đang chọn có dấu hiệu KHÔNG CHỈ bằng màu', async () => {
    const screen = await render(<Harness />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: FIELD }));
    await userEvent.press(screen.getByRole('button', { name: 'Thành phố Hà Nội' }));
    await userEvent.press(screen.getByRole('button', { name: FIELD }));

    /* Dấu tick có `label` ⇒ nó là một node trợ năng đọc lên được, chứ không phải
       một mảng màu mà người mù màu (và trình đọc màn hình) không thấy. */
    expect(screen.getByLabelText('Đang chọn')).toBeOnTheScreen();
  });

  it('ô tìm kiếm lọc danh sách và BỎ DẤU tiếng Việt', async () => {
    const screen = await render(<Harness />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: FIELD }));
    await fireEvent.changeText(screen.getByRole('search'), 'da nang');

    expect(screen.getByText('Thành phố Đà Nẵng')).toBeOnTheScreen();
    expect(screen.queryByText('Thành phố Hà Nội')).toBeNull();
  });

  it('lọc không còn mục nào thì hiện câu trạng thái rỗng', async () => {
    const screen = await render(<Harness />, { wrapper: Wrapper });

    await userEvent.press(screen.getByRole('button', { name: FIELD }));
    await fireEvent.changeText(screen.getByRole('search'), 'khong-co-tinh-nao');

    expect(screen.getByText('Không tìm thấy lựa chọn phù hợp.')).toBeOnTheScreen();
  });
});

/** Form nhỏ nhất đủ để kiểm hai việc của `FormSelect`: đổi mã → tên, và nối lỗi. */
function FormHarness({ error }: { error?: string }) {
  const form = useForm<{ provinceCode: string }>({ defaultValues: { provinceCode: 'HN' } });

  useEffect(() => {
    if (error) form.setError('provinceCode', { message: error });
  }, [error, form]);

  return (
    <FormSelect
      control={form.control}
      format={(code) => OPTIONS.find((option) => option.value === code)?.label ?? ''}
      label="Tỉnh/Thành"
      name="provinceCode"
      required
      onPress={jest.fn()}
    />
  );
}

describe('FormSelect', () => {
  it('hiện TÊN suy ra từ MÃ đang nằm trong form', async () => {
    const screen = await render(<FormHarness />, { wrapper: Wrapper });

    expect(screen.getByText('Thành phố Hà Nội')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: FIELD })).toHaveAccessibilityValue({
      text: 'Thành phố Hà Nội',
    });
  });

  it('nối lỗi của react-hook-form vào dòng thông báo', async () => {
    const screen = await render(<FormHarness error="Vui lòng chọn Tỉnh/Thành" />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('Vui lòng chọn Tỉnh/Thành')).toBeOnTheScreen();
  });
});
