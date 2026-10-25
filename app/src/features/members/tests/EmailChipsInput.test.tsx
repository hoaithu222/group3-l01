import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { EmailChipsInput } from '../components/EmailChipsInput';
import { hasInvalidEmail, mergeEmails, splitEmailTokens } from '../utils/email.utils';

/**
 * `EmailChipsInput` (app.md p3-04 §8): tách "a@x.com, b@y.com" thành hai chip; chip sai
 * định dạng vẫn hiện NHƯNG kèm lỗi cho trình đọc màn hình (chữ + nhãn trợ năng, không
 * chỉ màu). Test hành vi qua bàn phím thật (`changeText`/`blur`), không đọc style.
 */

const PLACEHOLDER = 'ten@congty.com, ten2@congty.com';

/** Nơi gọi giữ danh sách email (component không tự giữ) — harness tối thiểu để thấy kết quả. */
function Harness({ initial = [] as string[], onChangeSpy }: { initial?: string[]; onChangeSpy?: (emails: string[]) => void }) {
  const [emails, setEmails] = useState(initial);
  return (
    <EmailChipsInput
      emails={emails}
      onChange={(next) => {
        onChangeSpy?.(next);
        setEmails(next);
      }}
    />
  );
}

describe('EmailChipsInput', () => {
  it('tách chuỗi "a@x.com, b@y.com" thành hai chip và xoá ô nhập', async () => {
    await render(<Harness />);
    const input = screen.getByPlaceholderText(PLACEHOLDER);

    await fireEvent.changeText(input, 'a@x.com, b@y.com');

    expect(screen.getByText('a@x.com')).toBeOnTheScreen();
    expect(screen.getByText('b@y.com')).toBeOnTheScreen();
    expect(input.props.value).toBe('');
    // Bộ đếm "2/20" nằm ở gợi ý bên phải nhãn.
    expect(screen.getByText('2/20')).toBeOnTheScreen();
  });

  it('chip SAI định dạng có chữ "sai định dạng" và nhãn trợ năng riêng — không chỉ đổi màu', async () => {
    await render(<Harness />);

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'khong-phai-email, ok@x.com');

    expect(screen.getByLabelText('khong-phai-email · sai định dạng')).toBeOnTheScreen();
    expect(screen.getByText('khong-phai-email · sai định dạng')).toBeOnTheScreen();
    // Chip hợp lệ KHÔNG mang cảnh báo.
    expect(screen.queryByLabelText('ok@x.com · sai định dạng')).toBeNull();
    expect(screen.getByLabelText('ok@x.com')).toBeOnTheScreen();
  });

  it('commit cả khi MẤT FOCUS — gõ địa chỉ cuối rồi bấm thẳng nút Gửi vẫn không rơi mất', async () => {
    const spy = jest.fn();
    await render(<Harness onChangeSpy={spy} />);
    const input = screen.getByPlaceholderText(PLACEHOLDER);

    await fireEvent.changeText(input, 'cuoi@x.com');
    expect(spy).not.toHaveBeenCalled();

    await fireEvent(input, 'blur');
    expect(spy).toHaveBeenLastCalledWith(['cuoi@x.com']);
  });

  it('khử trùng không phân biệt hoa/thường, giữ cách viết lần đầu', async () => {
    await render(<Harness initial={['a@x.com']} />);

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'A@X.com, b@y.com');

    expect(screen.getByText('a@x.com')).toBeOnTheScreen();
    expect(screen.queryByText('A@X.com')).toBeNull();
    expect(screen.getByText('b@y.com')).toBeOnTheScreen();
  });

  it('nút "Bỏ …" gỡ đúng chip đó', async () => {
    await render(<Harness initial={['a@x.com', 'b@y.com']} />);

    await fireEvent.press(screen.getByLabelText('Bỏ a@x.com'));

    expect(screen.queryByText('a@x.com')).toBeNull();
    expect(screen.getByText('b@y.com')).toBeOnTheScreen();
  });

  it('vượt trần thì báo "Tối đa N email" thay vì lặng lẽ bỏ bớt', async () => {
    await render(
      <EmailChipsInput emails={['a@x.com', 'b@x.com']} max={2} onChange={jest.fn()} />,
    );

    await fireEvent.changeText(screen.getByPlaceholderText(PLACEHOLDER), 'c@x.com ');

    expect(screen.getByText('Tối đa 2 email mỗi lần gửi.')).toBeOnTheScreen();
  });
});

describe('email.utils', () => {
  it('splitEmailTokens tách theo dấu phẩy, chấm phẩy, khoảng trắng, xuống dòng', () => {
    expect(splitEmailTokens('a@x.com,b@y.com;c@z.com\nd@w.com  e@v.com')).toEqual([
      'a@x.com',
      'b@y.com',
      'c@z.com',
      'd@w.com',
      'e@v.com',
    ]);
    expect(splitEmailTokens('  , ;  ')).toEqual([]);
  });

  it('mergeEmails giữ mục sai định dạng (để hiện chip lỗi) và đánh dấu tràn', () => {
    const result = mergeEmails(['a@x.com'], 'sai, b@y.com, c@z.com', 3);

    expect(result.emails).toEqual(['a@x.com', 'sai', 'b@y.com']);
    expect(result.overflow).toBe(true);
    expect(hasInvalidEmail(result.emails)).toBe(true);
    expect(hasInvalidEmail(['a@x.com', 'b@y.com'])).toBe(false);
  });
});
