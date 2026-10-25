import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MoveTaskSheet } from '../components/MoveTaskSheet';
import { COLUMNS, makeData, makeTask } from './fixtures';

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const data = makeData();
const task = data.columns.c_todo?.[1] ?? makeTask({ id: 't2', position: 'a1' });

function renderSheet(extra: Partial<Parameters<typeof MoveTaskSheet>[0]> = {}) {
  const onClose = jest.fn();
  return {
    onClose,
    view: render(
      <MoveTaskSheet
        columns={COLUMNS}
        disabled={false}
        task={task}
        tasks={data.columns}
        onClose={onClose}
        onMove={jest.fn()}
        {...extra}
      />,
      { wrapper: Wrapper },
    ),
  };
}

/** p3-03 nối "Giao cho tôi" và "Xoá thẻ" vào menu thẻ của p3-02 (đúng hai mục p3-02 để chờ endpoint). */
describe('MoveTaskSheet — hành động của p3-03', () => {
  it('không truyền handler thì KHÔNG có nút Giao cho tôi / Xoá thẻ (không quyền hoặc offline)', async () => {
    await renderSheet({ onOpenTask: jest.fn() }).view;

    expect(screen.queryByText('Giao cho tôi')).toBeNull();
    expect(screen.queryByText('Xoá thẻ')).toBeNull();
    expect(screen.getByText('Mở chi tiết thẻ')).toBeOnTheScreen();
  });

  it('"Giao cho tôi" gọi handler với đúng thẻ rồi đóng menu', async () => {
    const onAssignToMe = jest.fn();
    const { onClose, view } = renderSheet({ onAssignToMe });
    await view;

    await userEvent.press(screen.getByText('Giao cho tôi'));

    expect(onAssignToMe).toHaveBeenCalledWith(task);
    expect(onClose).toHaveBeenCalled();
  });

  it('"Xoá thẻ" gọi handler (xác nhận do hộp thoại riêng) rồi đóng menu', async () => {
    const onDelete = jest.fn();
    const { onClose, view } = renderSheet({ onDelete });
    await view;

    await userEvent.press(screen.getByText('Xoá thẻ'));

    expect(onDelete).toHaveBeenCalledWith(task);
    expect(onClose).toHaveBeenCalled();
  });

  it('mở từ màn chi tiết (không truyền onOpenTask): không có nút "Mở chi tiết thẻ" vô nghĩa', async () => {
    await renderSheet().view;

    expect(screen.queryByText('Mở chi tiết thẻ')).toBeNull();
    expect(screen.getByText('Chuyển sang cột…')).toBeOnTheScreen();
  });
});
