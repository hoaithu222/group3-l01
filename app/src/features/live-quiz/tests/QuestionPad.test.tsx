import { fireEvent, render, screen } from '@testing-library/react-native';

import { QuestionPad } from '../components/QuestionPad';
import type { AnswerState } from '../hooks/useQuizAnswer';

/**
 * app.md p5-01 §8: PlayerQuestionPad khoá sau khi chọn; nhãn CHỮ A/B/C/D + nội dung (không chỉ màu); "Đã chọn B — chờ
 * kết quả"; ack lỗi ⇒ thông điệp tiếng Việt, hết giờ (`QUIZ_005`) không cho thử lại.
 */

const OPTIONS = [
  { mediaAssetId: null, text: 'Hà Nội' },
  { mediaAssetId: null, text: 'Huế' },
  { mediaAssetId: null, text: 'Đà Nẵng' },
  { mediaAssetId: null, text: 'Cần Thơ' },
];

function pad(overrides: Partial<Parameters<typeof QuestionPad>[0]> = {}) {
  const onChoose = jest.fn();
  const onRetry = jest.fn();
  const props = {
    onChoose,
    onRetry,
    options: OPTIONS,
    selected: null as number | null,
    state: 'idle' as AnswerState,
    ...overrides,
  };
  return { onChoose, onRetry, ui: <QuestionPad {...props} /> };
}

it('mỗi lựa chọn có nhãn chữ A/B/C/D + nội dung', async () => {
  await render(pad().ui);

  ['A. Hà Nội', 'B. Huế', 'C. Đà Nẵng', 'D. Cần Thơ'].forEach((label) =>
    expect(screen.getByRole('button', { name: label })).toBeOnTheScreen(),
  );
});

it('chưa chọn ⇒ bấm B gọi onChoose(1)', async () => {
  const { onChoose, ui } = pad();
  await render(ui);

  await fireEvent.press(screen.getByRole('button', { name: 'B. Huế' }));

  expect(onChoose).toHaveBeenCalledWith(1);
});

it('đã chọn (gửi xong) ⇒ khoá cả bảng: bấm phương án khác KHÔNG gọi onChoose; hiện "Đã chọn B — chờ kết quả"', async () => {
  const { onChoose, ui } = pad({ selected: 1, state: 'sent' });
  await render(ui);

  expect(screen.getByText('Đã chọn B — chờ kết quả')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'A. Hà Nội' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'C. Đà Nẵng' })).toBeDisabled();

  await fireEvent.press(screen.getByRole('button', { name: 'A. Hà Nội' }));
  await fireEvent.press(screen.getByRole('button', { name: 'B. Huế' }));
  expect(onChoose).not.toHaveBeenCalled();
});

it('đang gửi ⇒ vẫn khoá (không cho bấm hai lần)', async () => {
  const { onChoose, ui } = pad({ selected: 2, state: 'sending' });
  await render(ui);

  await fireEvent.press(screen.getByRole('button', { name: 'A. Hà Nội' }));

  expect(onChoose).not.toHaveBeenCalled();
});

it('hết giờ (`disabled`) ⇒ khoá cả bảng dù chưa chọn', async () => {
  await render(pad({ disabled: true }).ui);

  OPTIONS.forEach((_, i) => expect(screen.getAllByRole('button')[i]).toBeDisabled());
});

it('mất ack ⇒ "Chưa gửi được — kiểm tra kết nối" + nút Thử lại gọi onRetry', async () => {
  const { onRetry, ui } = pad({ code: 'ACK_TIMEOUT', selected: 0, state: 'error' });
  await render(ui);

  expect(screen.getByText('Chưa gửi được — kiểm tra kết nối')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('`QUIZ_005` (hết giờ) ⇒ báo "Hết giờ", KHÔNG có nút Thử lại', async () => {
  await render(pad({ code: 'QUIZ_005', selected: 0, state: 'error' }).ui);

  expect(screen.getByText('Hết giờ')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
});
