import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';

import { SearchInput, useSearchInput } from '@/shared/ui/search';

/**
 * Ô tìm kiếm — test HÀNH VI, không phải hình thức.
 *
 * ⛔ Style của NativeWind KHÔNG có trong Jest (Metro mới là nơi biên dịch
 * Tailwind), nên `style` của element luôn rỗng — xem `docs/rules/testing.md`.
 *
 * ⚠️ `render()` / `fireEvent()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`. Quên
 * thì mọi truy vấn báo "`render` function has not been called".
 */
describe('SearchInput', () => {
  it('gọi onChangeText với đúng chữ người dùng gõ, kể cả chữ có dấu', async () => {
    const onChangeText = jest.fn();
    const screen = await render(<SearchInput onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByRole('search'), 'Đà Nẵng');

    expect(onChangeText).toHaveBeenCalledWith('Đà Nẵng');
  });

  /**
   * ⛔ Đây là lý do component này tồn tại thay vì một `TextInput` trần.
   *
   * Ô tìm kiếm controlled (`value={search}`) bị ghi đè lại nội dung mỗi lần
   * state đổi. Khi state đi qua một nhịp bất đồng bộ — debounce, cập nhật từ
   * query — cú ghi đè rơi đúng lúc bộ gõ Telex đang ghép dấu, và trên Android
   * chữ MẤT DẤU hoặc con trỏ nhảy về đầu.
   *
   * Test này khoá lại hợp đồng đó: ô nhập nhận `defaultValue`, KHÔNG nhận
   * `value`. Kiểu prop cũng đã bỏ `value`, nhưng kiểu không bảo vệ được người
   * viết thêm `value` bằng spread từ một object `any`.
   */
  it('luôn là ô nhập uncontrolled (defaultValue, không value)', async () => {
    const screen = await render(<SearchInput defaultValue="mét khối" />);
    const input = screen.getByRole('search');

    expect(input.props.defaultValue).toBe('mét khối');
    expect(input.props.value).toBeUndefined();
  });

  it('nút xoá chỉ hiện khi ô có chữ, và bấm thì xoá', async () => {
    const onChangeText = jest.fn();
    const onClear = jest.fn();
    const screen = await render(<SearchInput onChangeText={onChangeText} onClear={onClear} />);

    expect(screen.queryByLabelText('Xoá nội dung tìm kiếm')).toBeNull();

    await fireEvent.changeText(screen.getByRole('search'), 'vé máy bay');
    await fireEvent.press(screen.getByLabelText('Xoá nội dung tìm kiếm'));

    expect(onChangeText).toHaveBeenLastCalledWith('');
    expect(onClear).toHaveBeenCalledTimes(1);
    // Nút biến mất theo nội dung — nếu còn, người dùng bấm vào một nút không
    // làm gì và tưởng app đơ.
    expect(screen.queryByLabelText('Xoá nội dung tìm kiếm')).toBeNull();
  });

  it('bị vô hiệu hoá thì không nhận chữ và báo đúng trạng thái cho trình đọc màn hình', async () => {
    const onChangeText = jest.fn();
    const screen = await render(<SearchInput disabled onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByRole('search'), 'abc');

    expect(onChangeText).not.toHaveBeenCalled();
    expect(screen.getByRole('search')).toBeDisabled();
  });
});

describe('useSearchInput', () => {
  it('chỉ đưa từ khoá ra sau nhịp chờ, không đưa ngay từng phím', async () => {
    const hook = await renderHook(() => useSearchInput({ delay: 10 }));

    await act(async () => {
      hook.result.current.inputProps.onChangeText('mét khối');
    });

    // Ngay sau phím: tầng lọc CHƯA thấy gì — đó chính là tác dụng của debounce.
    expect(hook.result.current.value).toBe('');

    await waitFor(() => expect(hook.result.current.value).toBe('mét khối'));
  });

  it('clear() xoá từ khoá ngay, không đợi hết nhịp chờ', async () => {
    const hook = await renderHook(() => useSearchInput({ delay: 10, initialValue: 'cũ' }));

    await act(async () => {
      hook.result.current.clear();
    });

    expect(hook.result.current.value).toBe('');
  });

  /**
   * `inputProps` phải trải thẳng được vào `<SearchInput />`. Nếu hook lỡ trả ra
   * `value`, ô nhập thành controlled và lỗi mất dấu tiếng Việt quay lại — mà
   * lần này ESLint không bắt được vì tên biến nằm trong hook.
   */
  it('inputProps KHÔNG chứa value', async () => {
    const hook = await renderHook(() => useSearchInput());

    expect(hook.result.current.inputProps).not.toHaveProperty('value');
    expect(hook.result.current.inputProps.defaultValue).toBe('');
  });
});
