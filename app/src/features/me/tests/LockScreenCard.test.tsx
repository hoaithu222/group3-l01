import { render, screen, userEvent } from '@testing-library/react-native';

import { LockScreenCard } from '../components/LockScreenCard';

/**
 * "Màn hình khoá": ba THẺ CHỌN (không phải Radio trơn) — chỉ test hành vi: mức đang chọn được đánh dấu cho trình đọc
 * màn hình, chọn mức khác gọi `onChange`, bấm lại mức đang chọn KHÔNG gọi, mất mạng (`disabled`) khoá cả ba.
 */

async function renderCard(props: { disabled?: boolean; value?: 'FULL' | 'HIDDEN' | 'SENDER' } = {}) {
  const onChange = jest.fn();
  await render(
    <LockScreenCard disabled={props.disabled ?? false} value={props.value ?? 'HIDDEN'} onChange={onChange} />,
  );
  return { onChange };
}

describe('LockScreenCard', () => {
  it('ba lựa chọn nằm trong nhóm radio; chỉ mức hiện hành là `selected`', async () => {
    await renderCard({ value: 'SENDER' });

    expect(screen.getByLabelText('Nội dung thông báo trên màn hình khoá')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Chỉ hiện tên người gửi' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Ẩn nội dung' })).not.toBeSelected();
    expect(screen.getByRole('radio', { name: 'Xem trước nội dung' })).not.toBeSelected();
  });

  it('mỗi thẻ có câu mô tả người khác thấy gì, và lời cảnh báo rủi ro nằm ngay dưới', async () => {
    await renderCard();

    expect(screen.getByText('Hiện cả tên người gửi và đoạn đầu tin nhắn.')).toBeOnTheScreen();
    expect(screen.getByText(/người khác nhìn thấy đoạn đầu tin nhắn/)).toBeOnTheScreen();
  });

  it('chọn mức khác → onChange đúng giá trị BE; bấm lại mức đang chọn → không gọi', async () => {
    const { onChange } = await renderCard({ value: 'HIDDEN' });

    await userEvent.press(screen.getByText('Xem trước nội dung'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith('FULL');

    await userEvent.press(screen.getByText('Ẩn nội dung'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('mất mạng (disabled) → bấm không gọi onChange', async () => {
    const { onChange } = await renderCard({ disabled: true });

    await userEvent.press(screen.getByText('Xem trước nội dung'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
