import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TrashRow } from '../components/TrashRow';
import type { TrashEntry } from '../utils/trash-entries';

/** `ActionMenu` mở `BottomSheet`: thư viện bàn phím gọi native lúc nạp module và `useSafeAreaInsets` cần provider. */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

/**
 * Thùng rác: MỖI hàng có "Khôi phục" và menu "⋯" chứa "Xoá vĩnh viễn". Trình đọc màn hình duyệt nút theo thứ tự nên
 * mười hàng cùng đọc "Khôi phục, nút" / "Thêm thao tác, nút" — người khiếm thị không biết nút nào của tệp nào, mà xoá
 * vĩnh viễn thì không hoàn tác được. Nhãn nút nêu TÊN mục.
 */
const entry = (overrides: Partial<TrashEntry> = {}): TrashEntry => ({
  canPurge: true,
  canRestore: true,
  daysLabel: 'Còn 12 ngày',
  icon: 'document',
  id: 'r-1',
  key: 'resource:r-1',
  kind: 'resource',
  name: 'bao-cao.pdf',
  subtitle: 'PDF · 2 KB',
  tone: 'brand',
  ...overrides,
});

describe('TrashRow — nhãn nút nêu TÊN mục', () => {
  it('"Khôi phục" nêu mục nào; "Xoá vĩnh viễn" nằm trong menu "⋯" của đúng mục đó, và gọi đúng callback', async () => {
    const onPurge = jest.fn();
    const onRestore = jest.fn();
    const item = entry();
    await render(
      <TrashRow busy={false} canPurge canRestore entry={item} onPurge={onPurge} onRestore={onRestore} />,
      { wrapper: Wrapper },
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Khôi phục bao-cao.pdf' }));
    expect(onRestore).toHaveBeenCalledWith(item);

    // Xoá vĩnh viễn KHÔNG còn là nút đứng sát "Khôi phục": phải mở menu rồi mới chọn.
    expect(screen.queryByText('Xoá vĩnh viễn')).toBeNull();
    await userEvent.press(screen.getByRole('button', { name: 'Thêm thao tác cho bao-cao.pdf' }));
    await userEvent.press(await screen.findByText('Xoá vĩnh viễn'));

    await waitFor(() => expect(onPurge).toHaveBeenCalledWith(item));
  });

  it('hai hàng cạnh nhau không trùng nhãn nút', async () => {
    const noop = jest.fn();
    await render(
      <>
        <TrashRow busy={false} canPurge canRestore entry={entry({ key: 'a', name: 'a.pdf' })} onPurge={noop} onRestore={noop} />
        <TrashRow busy={false} canPurge canRestore entry={entry({ key: 'b', name: 'b.pdf' })} onPurge={noop} onRestore={noop} />
      </>,
      { wrapper: Wrapper },
    );

    expect(screen.getByRole('button', { name: 'Khôi phục a.pdf' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Khôi phục b.pdf' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm thao tác cho a.pdf' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Thêm thao tác cho b.pdf' })).toBeOnTheScreen();
  });

  it('không có quyền xoá hẳn (MEMBER) hoặc là thư mục ⇒ không có nút "⋯"; chỉ còn "Khôi phục"', async () => {
    const noop = jest.fn();
    await render(
      <>
        <TrashRow busy={false} canPurge={false} canRestore entry={entry({ key: 'a', name: 'a.pdf' })} onPurge={noop} onRestore={noop} />
        <TrashRow
          busy={false}
          canPurge
          canRestore
          entry={entry({ id: 'f-1', key: 'folder:f-1', kind: 'folder', name: 'Thư mục' })}
          onPurge={noop}
          onRestore={noop}
        />
      </>,
      { wrapper: Wrapper },
    );

    expect(screen.queryByRole('button', { name: /^Thêm thao tác cho/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Khôi phục a.pdf' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Khôi phục Thư mục' })).toBeOnTheScreen();
  });
});
