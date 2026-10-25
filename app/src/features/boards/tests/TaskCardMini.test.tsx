import { render, userEvent } from '@testing-library/react-native';

import type { BoardLabel } from '../api/boards.types';
import { TaskCardMini } from '../components/kanban/TaskCardMini';
import { makeTask } from './fixtures';

const LABELS = new Map<string, BoardLabel>([
  ['l1', { color: 'red', id: 'l1', name: 'Gấp' }],
  ['l2', { color: 'blue', id: 'l2', name: 'Thiết kế' }],
]);

function setup(overrides: Parameters<typeof makeTask>[0], props: { disabled?: boolean; menuDisabled?: boolean } = {}) {
  const handlers = { onA11yAction: jest.fn(), onOpen: jest.fn(), onOpenMenu: jest.fn() };
  const task = makeTask(overrides);
  const view = render(
    <TaskCardMini columnTitle="Cần làm" labels={LABELS} task={task} {...handlers} {...props} />,
  );
  return { handlers, task, view };
}

describe('TaskCardMini', () => {
  it('quá hạn có CHỮ "Quá hạn" (không chỉ màu), nhãn có TÊN, checklist "2/4"', async () => {
    const { view } = setup({
      checklistDone: 2,
      checklistTotal: 4,
      dueDate: '2026-09-01T00:00:00.000Z',
      id: 't1',
      isOverdue: true,
      labelIds: ['l1', 'l2'],
    });
    const screen = await view;

    expect(screen.getByText(/Quá hạn/)).toBeOnTheScreen();
    expect(screen.getByText('Gấp')).toBeOnTheScreen();
    expect(screen.getByText('Thiết kế')).toBeOnTheScreen();
    expect(screen.getByText('2/4')).toBeOnTheScreen();
  });

  it('nhãn đã bị xoá khỏi bảng thì không vẽ; thẻ không checklist/hạn thì không có hàng dưới', async () => {
    const { view } = setup({ id: 't1', labelIds: ['l-da-xoa'] });
    const screen = await view;

    expect(screen.queryByText(/Quá hạn/)).toBeNull();
    expect(screen.queryByText(/\d+\/\d+/)).toBeNull();
  });

  it('avatar tối đa 3, phần còn lại gộp "+N"', async () => {
    const assignees = ['A', 'B', 'C', 'D', 'E'].map((name, index) => ({ avatarUrl: null, id: `u${index}`, name }));
    const { view } = setup({ assignees, id: 't1' });
    const screen = await view;

    // `AvatarGroup` ẩn các ô con (kể cả "+2") khỏi trình đọc màn hình và đọc MỘT câu cho cả nhóm ⇒ kiểm ô "+2" với
    // `includeHiddenElements`, và kiểm con số dư đọc được qua nhãn của nhóm.
    expect(screen.getByText('+2', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByLabelText('A, B, C và 2 người khác')).toBeOnTheScreen();
  });

  it('điểm · bình luận · tệp đính kèm hiện khi > 0 và có trong nhãn trợ năng của thẻ', async () => {
    const { view } = setup({ attachmentCount: 1, commentCount: 3, id: 't1', storyPoints: 5 });
    const screen = await view;

    expect(screen.getByText('5 điểm')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Thẻ t1. Cột Cần làm. 5 điểm. 3 bình luận. 1 tệp đính kèm'),
    ).toBeOnTheScreen();
  });

  it('chạm thân thẻ mở chi tiết; nút "…" mở menu chuyển', async () => {
    const { handlers, task, view } = setup({ id: 't1' });
    const screen = await view;

    await userEvent.press(screen.getByLabelText('Thẻ t1. Cột Cần làm'));
    expect(handlers.onOpen).toHaveBeenCalledWith(task);

    await userEvent.press(screen.getByLabelText(`Tuỳ chọn thẻ ${task.title}`));
    expect(handlers.onOpenMenu).toHaveBeenCalledWith(task);
  });

  it('offline (menuDisabled): vẫn MỞ được chi tiết nhưng menu chuyển bị khoá', async () => {
    const { handlers, task, view } = setup({ id: 't1' }, { menuDisabled: true });
    const screen = await view;

    await userEvent.press(screen.getByLabelText(`Tuỳ chọn thẻ ${task.title}`));
    expect(handlers.onOpenMenu).not.toHaveBeenCalled();

    await userEvent.press(screen.getByLabelText('Thẻ t1. Cột Cần làm'));
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
  });

  it('thẻ tạm (disabled): không mở, không mở menu', async () => {
    const { handlers, task, view } = setup({ id: 'tmp_x' }, { disabled: true });
    const screen = await view;

    await userEvent.press(screen.getByLabelText(`Tuỳ chọn thẻ ${task.title}`));
    await userEvent.press(screen.getByLabelText('Thẻ tmp_x. Cột Cần làm'));
    expect(handlers.onOpenMenu).not.toHaveBeenCalled();
    expect(handlers.onOpen).not.toHaveBeenCalled();
  });
});
