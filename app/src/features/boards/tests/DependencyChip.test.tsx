import { render } from '@testing-library/react-native';

import type { BoardLabel } from '../api/boards.types';
import { DependencyChip } from '../components/kanban/DependencyChip';
import { TaskCardMini } from '../components/kanban/TaskCardMini';
import { taskAccessibilityLabel } from '../utils/task-format';
import { makeTask } from './fixtures';

const LABELS = new Map<string, BoardLabel>();

describe('DependencyChip — chip "Bị chặn" / "Chặn N" trên thẻ Kanban', () => {
  it('không có phụ thuộc nào ⇒ không vẽ gì', async () => {
    const screen = await render(<DependencyChip blockedByCount={0} blockingCount={0} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('bị chặn: có CHỮ "Bị chặn" (không chỉ màu) và nhãn trợ năng nói đủ số thẻ chưa xong', async () => {
    const screen = await render(<DependencyChip blockedByCount={2} blockingCount={0} />);

    expect(screen.getByText('Bị chặn')).toBeOnTheScreen();
    expect(screen.getByLabelText('Bị chặn bởi 2 thẻ chưa xong')).toBeOnTheScreen();
    expect(screen.queryByText(/^Chặn /)).toBeNull();
  });

  it('đang chặn: "Chặn 3" + nhãn "Đang chặn 3 thẻ"', async () => {
    const screen = await render(<DependencyChip blockedByCount={0} blockingCount={3} />);

    expect(screen.getByText('Chặn 3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Đang chặn 3 thẻ')).toBeOnTheScreen();
    expect(screen.queryByText('Bị chặn')).toBeNull();
  });

  it('vừa bị chặn vừa đang chặn: hiện cả hai', async () => {
    const screen = await render(<DependencyChip blockedByCount={1} blockingCount={4} />);

    expect(screen.getByText('Bị chặn')).toBeOnTheScreen();
    expect(screen.getByText('Chặn 4')).toBeOnTheScreen();
  });

  it('nằm trên thẻ mini theo blockedByCount/blockingCount của thẻ', async () => {
    const task = makeTask({ blockedByCount: 1, blockingCount: 2, id: 't1' });
    const screen = await render(
      <TaskCardMini columnTitle="Cần làm" labels={LABELS} task={task} onOpen={jest.fn()} onOpenMenu={jest.fn()} />,
    );

    expect(screen.getByText('Bị chặn')).toBeOnTheScreen();
    expect(screen.getByText('Chặn 2')).toBeOnTheScreen();
    // Cả thẻ là MỘT ô trợ năng: nhãn của thẻ phải mang thông tin phụ thuộc.
    expect(screen.getByLabelText(/Bị chặn bởi 1 thẻ chưa xong\. Đang chặn 2 thẻ/)).toBeOnTheScreen();
  });

  it('nhãn đọc của thẻ không nhắc phụ thuộc khi không có', () => {
    expect(taskAccessibilityLabel(makeTask({ id: 't1' }), 'Cần làm')).not.toMatch(/chặn/);
  });
});
