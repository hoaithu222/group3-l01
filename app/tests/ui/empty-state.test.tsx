import { render, userEvent } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text } from 'react-native';

import { EmptyState, type EmptyStateActionProps } from '@/shared/ui/empty-state';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). Cỡ `full`/`compact` và `fullscreen` chỉ khác nhau
 * ở `className` nên chỉ kiểm được là chúng vẫn dựng ra đủ nội dung.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('EmptyState', () => {
  it('vẽ được với bộ prop tối thiểu', async () => {
    const screen = await render(<EmptyState title="Chưa có giao dịch nào" />);

    expect(screen.getByText('Chưa có giao dịch nào')).toBeOnTheScreen();
  });

  it('vẽ được với bộ prop đầy đủ', async () => {
    const screen = await render(
      <EmptyState
        actions={[{ label: 'Tải lại', onPress: jest.fn() }]}
        className="mt-md"
        description="Giao dịch của bạn sẽ hiện ở đây."
        fullscreen
        illustration={<Text>Hình minh hoạ</Text>}
        size="compact"
        title="Chưa có giao dịch nào"
      />,
    );

    expect(screen.getByText('Chưa có giao dịch nào')).toBeOnTheScreen();
    expect(screen.getByText('Giao dịch của bạn sẽ hiện ở đây.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeOnTheScreen();
  });

  /**
   * ⛔ Ghi chú của nhà thiết kế trong file Figma: "Trường hợp empty state chỉ có
   * 1 thông điệp thì show description text". Bắt buộc `title` như trước là ép
   * thông điệp duy nhất vào kiểu 16/24 semibold, sai vai trò chữ của bản vẽ.
   *
   * ⚠️ Kiểu hợp (union) chặn ở tầng `tsc`: bỏ CẢ HAI là lỗi biên dịch, nên
   * không có ca "khối rỗng hoàn toàn" để test lúc chạy.
   */
  it('vẽ được khi chỉ có mô tả, không có tiêu đề', async () => {
    const screen = await render(<EmptyState description="Chưa có dữ liệu." />);

    expect(screen.getByText('Chưa có dữ liệu.')).toBeOnTheScreen();
    expect(screen.queryByRole('header')).toBeNull();
  });

  it('không có mô tả thì không vẽ dòng mô tả', async () => {
    const screen = await render(<EmptyState title="Chưa có giao dịch nào" />);

    expect(screen.queryByText('Giao dịch của bạn sẽ hiện ở đây.')).toBeNull();
  });

  /**
   * ⛔ `summary` là manh mối DUY NHẤT báo cho người khiếm thị biết danh sách
   * TRỐNG chứ không phải đang tải dở. ⚠️ Không tra được bằng `getByRole`: RNTL
   * chỉ tìm phần tử có cờ `accessible`, mà cờ đó cố ý KHÔNG đặt ở đây — đặt vào
   * là nó nuốt luôn hàng nút bên dưới và người dùng hết đường bấm. Nên kiểm
   * thẳng trên node gốc.
   */
  it('gắn vai `summary` cho cả khối', async () => {
    const screen = await render(<EmptyState title="Chưa có giao dịch nào" />);
    const root = screen.toJSON();

    expect(root).not.toBeNull();
    expect(Array.isArray(root) ? root[0]?.props : root?.props).toMatchObject({
      accessibilityRole: 'summary',
    });
  });

  it('tiêu đề được gắn vai `header`', async () => {
    const screen = await render(<EmptyState title="Chưa có giao dịch nào" />);

    expect(screen.getByRole('header', { name: 'Chưa có giao dịch nào' })).toBeOnTheScreen();
  });

  /**
   * ⛔ Hình minh hoạ là trang trí thuần. Không giấu thì trình đọc màn hình dừng
   * lại ở một phần tử không nói lên điều gì, ngay trước câu duy nhất có nghĩa.
   *
   * ⚠️ RNTL mặc định BỎ QUA phần tử bị giấu khỏi trợ năng — nên "không tìm thấy
   * theo cách thường, tìm thấy khi bật `includeHiddenElements`" chính là bằng
   * chứng nó đã bị giấu đúng.
   */
  it('giấu hình minh hoạ khỏi trình đọc màn hình', async () => {
    const screen = await render(
      <EmptyState illustration={<Text>Hình minh hoạ</Text>} title="Chưa có giao dịch nào" />,
    );

    expect(screen.queryByText('Hình minh hoạ')).toBeNull();
    expect(screen.getByText('Hình minh hoạ', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  /** Không truyền minh hoạ thì KHÔNG vẽ ô giữ chỗ nào — xem ghi chú trong component. */
  it('không có minh hoạ thì không vẽ gì thay thế', async () => {
    const screen = await render(<EmptyState title="Chưa có giao dịch nào" />);

    expect(screen.queryByText('Hình minh hoạ', { includeHiddenElements: true })).toBeNull();
  });

  it('không có nút thì không vẽ hàng nút', async () => {
    const screen = await render(<EmptyState title="Chưa có giao dịch nào" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('mảng nút rỗng cũng không vẽ hàng nút', async () => {
    const screen = await render(<EmptyState actions={[]} title="Chưa có giao dịch nào" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('một nút: bấm gọi đúng một lần', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <EmptyState actions={[{ label: 'Tải lại', onPress }]} title="Không tải được" />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);

    await userEvent.press(screen.getByRole('button', { name: 'Tải lại' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  /** Hai nút: bấm nút nào thì CHỈ nút đó bắn — chỗ hay lẫn khi dựng hàng bằng `.map()`. */
  it('hai nút: chỉ nút được bấm mới bắn', async () => {
    const onRetry = jest.fn();
    const onSupport = jest.fn();
    const actions: EmptyStateActionProps[] = [
      // `secondary` = nút viền của `Button` chung. ⚠️ Trước đây chỗ này là
      // `outline` — tên của cái nút tự dựng cũ, nay đã bị thay bằng `Button`.
      { label: 'Liên hệ hỗ trợ', variant: 'secondary', onPress: onSupport },
      { label: 'Tải lại', onPress: onRetry },
    ];

    const screen = await render(<EmptyState actions={actions} title="Không tải được" />);

    expect(screen.getAllByRole('button')).toHaveLength(2);

    await userEvent.press(screen.getByRole('button', { name: 'Tải lại' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onSupport).not.toHaveBeenCalled();
  });

  it('nút bị khoá thì KHÔNG gọi onPress và báo `disabled`', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <EmptyState
        actions={[{ disabled: true, label: 'Tải lại', onPress }]}
        title="Không tải được"
      />,
    );

    const button = screen.getByRole('button', { name: 'Tải lại' });
    await userEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  /** Nút cao 48dp cố định: nhãn xuống dòng là chữ tràn ra ngoài viền bo. */
  it('khoá nhãn nút ở một dòng', async () => {
    const screen = await render(
      <EmptyState
        actions={[{ label: 'Liên hệ tổng đài hỗ trợ khách hàng', onPress: jest.fn() }]}
        title="Không tải được"
      />,
    );

    expect(screen.getByText('Liên hệ tổng đài hỗ trợ khách hàng').props.numberOfLines).toBe(1);
  });

  /** Mô tả chặn 3 dòng: dài hơn thì hàng nút bị đẩy khỏi vùng nhìn thấy. */
  it('khoá mô tả ở ba dòng', async () => {
    const screen = await render(
      <EmptyState description="Một dòng mô tả." title="Chưa có giao dịch nào" />,
    );

    expect(screen.getByText('Một dòng mô tả.').props.numberOfLines).toBe(3);
  });
});

/**
 * Hình minh hoạ từ prop `icon`/`tone` (vòng tròn mờ đồng tâm + icon lớn, dựng bằng SVG). Kiểm bằng CẤU TRÚC cây (số
 * khối con của gốc) vì hình là SVG + icon trang trí — không có chữ để `getByText`, và bị giấu khỏi trình đọc màn hình.
 */
describe('EmptyState — minh hoạ từ `icon`', () => {
  /** Số khối con trực tiếp của khối gốc `summary` (minh hoạ? · chữ · nút?). */
  async function rootChildCount(ui: ReactElement): Promise<number> {
    const screen = await render(ui);
    const root = screen.toJSON();
    const node = Array.isArray(root) ? root[0] : root;
    return node?.children?.length ?? 0;
  }

  it('có `icon` thì thêm MỘT khối minh hoạ; không có thì giữ nguyên như cũ', async () => {
    const without = await rootChildCount(<EmptyState title="Chưa có bộ học" />);
    const withIcon = await rootChildCount(<EmptyState icon="book" title="Chưa có bộ học" />);

    expect(withIcon).toBe(without + 1);
  });

  it('vẫn đủ chữ + nút, và hình bị giấu khỏi trình đọc màn hình', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <EmptyState
        actions={[{ label: 'Tạo bộ học', onPress }]}
        description="Tạo bộ đầu tiên."
        icon="book"
        title="Chưa có bộ học"
        tone="info"
      />,
    );

    expect(screen.getByRole('header', { name: 'Chưa có bộ học' })).toBeOnTheScreen();
    expect(screen.getByText('Tạo bộ đầu tiên.')).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Tạo bộ học' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    // Icon không nhãn ⇒ không có phần tử `image` nào lộ ra cho TalkBack.
    expect(screen.queryAllByRole('image')).toHaveLength(0);
  });

  /** API cũ giữ nguyên nghĩa: `illustration` tuỳ ý thắng `icon`, không vẽ chồng hai hình. */
  it('có cả `illustration` lẫn `icon` thì `illustration` thắng', async () => {
    const custom = await rootChildCount(
      <EmptyState illustration={<Text>Hình riêng</Text>} title="Chưa có bộ học" />,
    );
    const both = await rootChildCount(
      <EmptyState icon="book" illustration={<Text>Hình riêng</Text>} title="Chưa có bộ học" />,
    );
    expect(both).toBe(custom);

    const screen = await render(
      <EmptyState icon="book" illustration={<Text>Hình riêng</Text>} title="Chưa có bộ học" />,
    );
    expect(screen.getByText('Hình riêng', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it.each(['brand', 'info', 'success', 'warning', 'accent', 'danger', 'neutral'] as const)(
    'tông %s và cỡ compact vẽ được',
    async (tone) => {
      const screen = await render(
        <EmptyState icon="lock" size="compact" title="Không có quyền" tone={tone} />,
      );

      expect(screen.getByText('Không có quyền')).toBeOnTheScreen();
    },
  );
});
