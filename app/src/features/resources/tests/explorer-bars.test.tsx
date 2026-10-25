import { fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ExplorerToolbar } from '../components/ExplorerToolbar';
import { FolderBreadcrumb } from '../components/FolderBreadcrumb';
import { PreviewActionBar } from '../components/preview/PreviewActionBar';
import { DEFAULT_PREFS } from '../utils/explorer-prefs';

/**
 * Các dải điều khiển của FileExplorer/Preview sau đợt gọn bố cục: MỘT dải công cụ (lọc loại + menu "⋯"), breadcrumb chỉ
 * khi ở trong thư mục con, thanh dưới của Preview chỉ còn Tải về/Chia sẻ.
 */
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

function renderToolbar(overrides: Partial<React.ComponentProps<typeof ExplorerToolbar>> = {}) {
  const props = {
    onOpenTrash: jest.fn(),
    onSortChange: jest.fn(),
    onTypeChange: jest.fn(),
    onViewChange: jest.fn(),
    prefs: DEFAULT_PREFS,
    typeFilter: 'ALL' as const,
    ...overrides,
  };
  return { props, view: render(<ExplorerToolbar {...props} />, { wrapper: Wrapper }) };
}

const openMenu = () =>
  userEvent.press(screen.getByRole('button', { name: 'Sắp xếp, dạng hiển thị và thùng rác' }));

describe('ExplorerToolbar — một dải công cụ', () => {
  it('chỉ còn các chip LỌC LOẠI; sắp xếp/dạng/thùng rác không còn là chip', async () => {
    const { view } = renderToolbar();
    await view;

    expect(screen.getByText('Tất cả')).toBeOnTheScreen();
    expect(screen.getByText('Ảnh')).toBeOnTheScreen();
    expect(screen.queryByText(/^Sắp xếp:/)).toBeNull();
    expect(screen.queryByText(/^Dạng:/)).toBeNull();
    expect(screen.queryByText('Thùng rác')).toBeNull();
  });

  it('chọn chip loại gọi onTypeChange', async () => {
    const { props, view } = renderToolbar();
    await view;

    await fireEvent.press(screen.getByText('PDF'));

    expect(props.onTypeChange).toHaveBeenCalledWith('PDF');
  });

  it('menu "⋯" có Sắp xếp (kèm giá trị hiện tại bằng chữ) · dạng hiển thị · Thùng rác', async () => {
    const { view } = renderToolbar();
    await view;

    await openMenu();

    expect(await screen.findByText('Sắp xếp')).toBeOnTheScreen();
    expect(screen.getByText('Mới nhất')).toBeOnTheScreen();
    expect(screen.getByText('Xem dạng danh sách')).toBeOnTheScreen();
    expect(screen.getByText('Thùng rác')).toBeOnTheScreen();
  });

  it('đang ở lưới: "Xem dạng danh sách" đổi sang list; đang ở list: mục thành "Xem dạng lưới" và đổi về grid', async () => {
    const grid = renderToolbar();
    await grid.view;
    await openMenu();
    await userEvent.press(await screen.findByText('Xem dạng danh sách'));
    await waitFor(() => expect(grid.props.onViewChange).toHaveBeenCalledWith('list'));
  });

  it('đang ở list ⇒ mục menu là "Xem dạng lưới" và chọn thì đổi về grid', async () => {
    const list = renderToolbar({ prefs: { ...DEFAULT_PREFS, view: 'list' } });
    await list.view;
    await openMenu();
    await userEvent.press(await screen.findByText('Xem dạng lưới'));
    await waitFor(() => expect(list.props.onViewChange).toHaveBeenCalledWith('grid'));
  });

  it('"Thùng rác" mở màn thùng rác', async () => {
    const { props, view } = renderToolbar();
    await view;

    await openMenu();
    await userEvent.press(await screen.findByText('Thùng rác'));

    await waitFor(() => expect(props.onOpenTrash).toHaveBeenCalledTimes(1));
  });

  it('chọn "Sắp xếp" mở tấm chọn và đổi thứ tự qua onSortChange', async () => {
    const { props, view } = renderToolbar();
    await view;

    await openMenu();
    await userEvent.press(await screen.findByText('Sắp xếp'));
    await userEvent.press(await screen.findByText('Tên A → Z'));

    await waitFor(() =>
      expect(props.onSortChange).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'name:asc', order: 'asc', sort: 'name' }),
      ),
    );
  });
});

describe('FolderBreadcrumb — chỉ khi ở trong thư mục con', () => {
  it('ở GỐC (một cấp "Tài liệu" — trùng tiêu đề màn) ⇒ không vẽ gì', async () => {
    await render(
      <FolderBreadcrumb segments={[{ id: 'root', label: 'Tài liệu' }]} onNavigate={jest.fn()} />,
    );

    expect(screen.queryByText('Tài liệu')).toBeNull();
  });

  it('trong thư mục con ⇒ hiện đủ các cấp, cấp trên bấm được', async () => {
    const onNavigate = jest.fn();
    await render(
      <FolderBreadcrumb
        segments={[
          { id: 'root', label: 'Tài liệu' },
          { id: 'a', label: 'Slide' },
        ]}
        onNavigate={onNavigate}
      />,
    );

    await fireEvent.press(screen.getByText('Tài liệu'));
    expect(onNavigate).toHaveBeenCalledWith('root');
    expect(screen.getByText('Slide')).toBeOnTheScreen();
  });
});

describe('PreviewActionBar — hai nút, không tranh nhau', () => {
  it('chỉ có "Tải về" và "Chia sẻ" ("Mở bằng ứng dụng khác" ở menu "⋯" của thanh tiêu đề)', async () => {
    const onRun = jest.fn();
    await render(<PreviewActionBar busy={null} disabled={false} onRun={onRun} />, {
      wrapper: Wrapper,
    });

    expect(screen.queryByText('Mở ngoài')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Tải về' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Chia sẻ' }));
    expect(onRun).toHaveBeenNthCalledWith(1, 'download');
    expect(onRun).toHaveBeenNthCalledWith(2, 'share');
  });

  it('đang tải về ⇒ nút "Chia sẻ" khoá (không chạy hai thao tác cùng lúc); ngoại tuyến ⇒ khoá cả hai', async () => {
    const onRun = jest.fn();
    const view = await render(<PreviewActionBar busy="download" disabled={false} onRun={onRun} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole('button', { name: 'Chia sẻ' })).toBeDisabled();

    view.rerender(<PreviewActionBar busy={null} disabled onRun={onRun} />);
    expect(screen.getByRole('button', { name: 'Tải về' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chia sẻ' })).toBeDisabled();
  });
});
