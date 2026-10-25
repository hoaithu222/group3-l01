import { fireEvent, render, userEvent } from '@testing-library/react-native';

import type { BoardColumn } from '../api/boards.types';
import { QuickAddTask } from '../components/kanban/QuickAddTask';

const COLUMN: BoardColumn = { id: 'c_todo', kind: 'TODO', order: 0, title: 'Cần làm', wipLimit: null };
const INPUT_LABEL = 'Tiêu đề thẻ mới trong cột Cần làm';

async function openBox() {
  const onSubmit = jest.fn();
  const screen = await render(<QuickAddTask column={COLUMN} disabled={false} onSubmit={onSubmit} />);
  await userEvent.press(screen.getByLabelText('Thêm thẻ vào cột Cần làm'));
  return { onSubmit, screen };
}

describe('QuickAddTask', () => {
  it('thêm liên tiếp: ô vẫn mở và CÙNG một ô nhập (không dựng lại ⇒ bàn phím không sập), mỗi thẻ một Idempotency-Key', async () => {
    const { onSubmit, screen } = await openBox();
    const input = screen.getByLabelText(INPUT_LABEL);

    await userEvent.type(input, 'Thẻ một');
    await userEvent.press(screen.getByText('Thêm'));
    // `clear()` xoá chữ ở NATIVE; bản giả `TextInput` của Jest không có tầng đó (RNTL vẫn nhớ "Thẻ một") ⇒ gõ tiếp bằng `changeText`
    // (giá trị MỚI của ô), đúng như trên máy sau khi ô đã được xoá.
    await fireEvent.changeText(screen.getByLabelText(INPUT_LABEL), 'Thẻ hai');
    await fireEvent(screen.getByLabelText(INPUT_LABEL), 'submitEditing');

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls.map(([arg]) => arg.title)).toEqual(['Thẻ một', 'Thẻ hai']);
    const [first, second] = onSubmit.mock.calls.map(([arg]) => arg.idempotencyKey);
    expect(first).not.toBe(second);
    // Không đổi `key` của ô nhập sau mỗi thẻ: vẫn là đúng phần tử đó.
    expect(screen.getByLabelText(INPUT_LABEL)).toBe(input);
  });

  it('disabled (mất mạng / hết quyền) khi ô đang mở: phím Enter của bàn phím KHÔNG tạo thẻ, nút "Thêm" bị khoá', async () => {
    const { onSubmit, screen } = await openBox();
    await userEvent.type(screen.getByLabelText(INPUT_LABEL), 'Thẻ offline');

    await screen.rerender(<QuickAddTask column={COLUMN} disabled onSubmit={onSubmit} />);
    await fireEvent(screen.getByLabelText(INPUT_LABEL), 'submitEditing');
    await userEvent.press(screen.getByText('Thêm'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('tiêu đề chỉ có khoảng trắng ⇒ không tạo thẻ', async () => {
    const { onSubmit, screen } = await openBox();
    await userEvent.type(screen.getByLabelText(INPUT_LABEL), '   ');
    await fireEvent(screen.getByLabelText(INPUT_LABEL), 'submitEditing');

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
