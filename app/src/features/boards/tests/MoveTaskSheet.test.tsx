import { render, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MoveTaskSheet } from '../components/MoveTaskSheet';
import { COLUMNS, makeData, makeTask } from './fixtures';

// `useSafeAreaInsets()` ném lỗi khi thiếu provider; `initialMetrics` bắt buộc trong Jest (xem tests/ui/bottom-sheet.test.tsx).
const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

const data = makeData();
const t2 = data.columns.c_todo?.[1] ?? makeTask({ id: 't2', position: 'a1' });

function setup(overrides: { disabled?: boolean } = {}) {
  const props = {
    columns: COLUMNS,
    disabled: overrides.disabled ?? false,
    onClose: jest.fn(),
    onMove: jest.fn(),
    onOpenTask: jest.fn(),
    task: t2,
    tasks: data.columns,
  };
  return { props, view: render(<MoveTaskSheet {...props} />, { wrapper: Wrapper }) };
}

describe('MoveTaskSheet — fallback của kéo thả', () => {
  it('không có thẻ ⇒ không dựng gì', async () => {
    const screen = await render(
      <MoveTaskSheet columns={COLUMNS} disabled={false} task={null} tasks={data.columns} onClose={jest.fn()} onMove={jest.fn()} onOpenTask={jest.fn()} />,
      { wrapper: Wrapper },
    );
    expect(screen.queryByText('Chuyển sang cột…')).toBeNull();
  });

  it('"Xuống cuối cột" gọi move với đúng hàng xóm (after = thẻ cuối, before = null)', async () => {
    const { props, view } = setup();
    const screen = await view;
    await userEvent.press(screen.getByText('Xuống cuối cột'));

    expect(props.onMove).toHaveBeenCalledTimes(1);
    expect(props.onMove).toHaveBeenCalledWith(
      expect.objectContaining({ afterTaskId: 't3', beforeTaskId: null, columnId: 'c_todo', columnKind: 'TODO' }),
    );
    expect(props.onClose).toHaveBeenCalled();
  });

  it('"Lên 1" gọi move với hàng xóm phía trên', async () => {
    const { props, view } = setup();
    const screen = await view;
    await userEvent.press(screen.getByText('Lên 1'));

    expect(props.onMove).toHaveBeenCalledWith(
      expect.objectContaining({ afterTaskId: null, beforeTaskId: 't1' }),
    );
  });

  it('chọn cột khác rồi "Cuối cột" ⇒ move sang cột đích với hàng xóm là thẻ cuối cột đích', async () => {
    const { props, view } = setup();
    const screen = await view;
    await userEvent.press(screen.getByText('Đang làm'));
    await userEvent.press(screen.getByText('Cuối cột'));

    expect(props.onMove).toHaveBeenCalledWith(
      expect.objectContaining({ afterTaskId: 'd1', beforeTaskId: null, columnId: 'c_doing', columnKind: 'IN_PROGRESS' }),
    );
  });

  it('chuyển vào cột Hoàn thành (rỗng) ⇒ after/before đều null, kind DONE', async () => {
    const { props, view } = setup();
    const screen = await view;
    await userEvent.press(screen.getByText('Hoàn thành'));
    await userEvent.press(screen.getByText('Đầu cột'));

    expect(props.onMove).toHaveBeenCalledWith(
      expect.objectContaining({ afterTaskId: null, beforeTaskId: null, columnId: 'c_done', columnKind: 'DONE' }),
    );
  });

  it('offline/không quyền ⇒ báo lý do và khoá mọi nút chuyển (vẫn mở được chi tiết)', async () => {
    const { props, view } = setup({ disabled: true });
    const screen = await view;

    expect(screen.getByText(/Cần kết nối mạng/)).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Xuống cuối cột'));
    expect(props.onMove).not.toHaveBeenCalled();

    await userEvent.press(screen.getByText('Mở chi tiết thẻ'));
    expect(props.onOpenTask).toHaveBeenCalledWith(t2);
  });

  it('thẻ đầu cột: "Lên đầu cột" bị khoá', async () => {
    const t1 = data.columns.c_todo?.[0];
    const props = {
      columns: COLUMNS,
      disabled: false,
      onClose: jest.fn(),
      onMove: jest.fn(),
      onOpenTask: jest.fn(),
      task: t1 ?? t2,
      tasks: data.columns,
    };
    const screen = await render(<MoveTaskSheet {...props} />, { wrapper: Wrapper });
    await userEvent.press(screen.getByText('Lên đầu cột'));
    expect(props.onMove).not.toHaveBeenCalled();
  });
});
