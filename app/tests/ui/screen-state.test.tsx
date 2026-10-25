import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text } from 'react-native';

import { ScreenState, type ScreenStateKind } from '@/shared/ui/screen-state';

/**
 * `ScreenState` (p0-12): mỗi trạng thái (tải/rỗng/lỗi/ngoại tuyến/mất quyền) render đúng nội dung và nút. Chỉ test HÀNH VI;
 * `render()` của RNTL 14 phải `await`.
 */
describe('ScreenState — nội dung mặc định', () => {
  it.each<[Exclude<ScreenStateKind, 'loading'>, string, string]>([
    ['empty', 'Chưa có gì ở đây', 'Khi có nội dung, nó sẽ xuất hiện tại đây.'],
    ['error', 'Không tải được dữ liệu', 'Có lỗi xảy ra. Vui lòng thử lại sau ít phút.'],
    ['offline', 'Bạn đang ngoại tuyến', 'Kiểm tra kết nối mạng rồi thử lại.'],
    [
      'forbidden',
      'Bạn không có quyền xem nội dung này',
      'Nội dung không còn khả dụng hoặc bạn không được phép truy cập.',
    ],
  ])('%s ⇒ tiêu đề + mô tả tiếng Việt', async (state, title, description) => {
    const screen = await render(<ScreenState state={state} />);

    expect(screen.getByText(title)).toBeOnTheScreen();
    expect(screen.getByText(description)).toBeOnTheScreen();
  });

  it('tiêu đề là `header` cho trình đọc màn hình', async () => {
    const screen = await render(<ScreenState state="error" />);

    expect(screen.getByRole('header', { name: 'Không tải được dữ liệu' })).toBeOnTheScreen();
  });

  it('title/description ghi đè được', async () => {
    const screen = await render(
      <ScreenState description="Gửi tin đầu tiên nào." state="empty" title="Chưa có tin nhắn" />,
    );

    expect(screen.getByText('Chưa có tin nhắn')).toBeOnTheScreen();
    expect(screen.getByText('Gửi tin đầu tiên nào.')).toBeOnTheScreen();
    expect(screen.queryByText('Chưa có gì ở đây')).toBeNull();
  });
});

describe('ScreenState — nút hành động', () => {
  it('error + action ⇒ nút bấm được', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ScreenState action={{ label: 'Thử lại', onPress }} state="error" />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('offline + action ⇒ nút "Thử lại" kết nối', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ScreenState action={{ label: 'Tải lại', onPress }} state="offline" />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Tải lại' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each<ScreenStateKind>(['empty', 'error', 'forbidden', 'offline'])(
    '%s không truyền action ⇒ KHÔNG có nút (mất quyền: thử lại vẫn 403/404)',
    async (state) => {
      const screen = await render(<ScreenState state={state} />);

      expect(screen.queryByRole('button')).toBeNull();
    },
  );
});

describe('ScreenState — đang tải', () => {
  it('có nhãn "Đang tải…" và busy để người dùng khiếm thị biết đang chờ', async () => {
    const screen = await render(<ScreenState state="loading" />);

    const progress = screen.getByRole('progressbar', { name: 'Đang tải…' });
    expect(progress).toBeBusy();
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('vẽ khung xương riêng của nơi gọi (đúng hình dạng nội dung sắp hiện)', async () => {
    const screen = await render(
      <ScreenState skeleton={<Text>khung xương của tôi</Text>} state="loading" />,
    );

    expect(screen.getByText('khung xương của tôi')).toBeOnTheScreen();
  });

  it('loading KHÔNG vẽ nút dù có action', async () => {
    const screen = await render(
      <ScreenState action={{ label: 'Thử lại', onPress: jest.fn() }} state="loading" />,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });
});

/**
 * Hình minh hoạ (`EmptyState` `icon`/`tone`): lỗi/mất quyền/ngoại tuyến có hình MẶC ĐỊNH; `empty` mặc định không có nhưng
 * nhận prop `icon`. Kiểm bằng CẤU TRÚC (số khối con của khối gốc `summary`) vì hình là SVG + icon trang trí, không có chữ.
 */
describe('ScreenState — hình minh hoạ', () => {
  async function rootChildCount(ui: ReactElement): Promise<number> {
    const screen = await render(ui);
    const root = screen.toJSON();
    const node = Array.isArray(root) ? root[0] : root;
    return node?.children?.length ?? 0;
  }

  it('empty mặc định KHÔNG có hình; truyền `icon` thì thêm một khối hình', async () => {
    const plain = await rootChildCount(<ScreenState state="empty" />);
    const withIcon = await rootChildCount(<ScreenState icon="book" state="empty" />);

    expect(withIcon).toBe(plain + 1);
  });

  it.each<Exclude<ScreenStateKind, 'empty' | 'loading'>>(['error', 'forbidden', 'offline'])(
    '%s có hình mặc định',
    async (state) => {
      const plain = await rootChildCount(<ScreenState state="empty" />);
      const withArt = await rootChildCount(<ScreenState state={state} />);

      expect(withArt).toBe(plain + 1);
    },
  );
});
