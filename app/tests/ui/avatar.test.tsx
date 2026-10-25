import { act, render } from '@testing-library/react-native';

import { Avatar, getInitials } from '@/shared/ui/avatar';

/**
 * Tìm phần tử ảnh của `expo-image` và trả về `onError` của nó.
 *
 * ⚠️ Phải đi bộ trên cây thay vì dùng query: RNTL 14 đã BỎ nhóm `UNSAFE_*`, mà
 * `Avatar` cố ý không nhận `testID` cho ô ảnh (một prop chỉ để test thì màn nào
 * cũng phải nhớ truyền). `fireEvent(node, 'error')` cũng không dùng được —
 * `ViewManagerAdapter_ExpoImage` không nằm trong sổ phần tử của RNTL nên
 * `fireEvent` im lặng KHÔNG làm gì, và test sẽ xanh giả nếu tin vào nó.
 */
type TreeNode = { props?: Record<string, unknown>; children?: unknown[] };

function findImageOnError(node: TreeNode): ((event: unknown) => void) | undefined {
  if (typeof node?.props?.onError === 'function') {
    return node.props.onError as (event: unknown) => void;
  }
  for (const child of node?.children ?? []) {
    if (child && typeof child === 'object') {
      const hit = findImageOnError(child as TreeNode);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * ⚠️ Chỉ test HÀNH VI. `className` KHÔNG thành `style` trong Jest (Metro mới
 * biên dịch Tailwind) — xem `docs/rules/testing.md`.
 *
 * ⚠️ `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
describe('getInitials', () => {
  /**
   * ⛔ Ca quan trọng nhất của cả nhóm component này.
   *
   * Người Việt gọi nhau bằng TÊN (từ cuối) chứ không phải bằng họ. Lấy hai từ
   * ĐẦU — thói quen phương Tây và cũng là thứ `name.split(' ').slice(0,2)` làm
   * — sẽ ra `NV`, tức là "Nguyễn Văn" cho MỌI người tên đệm Văn. Trong danh
   * sách người nhận tiền thì tất cả trông giống hệt nhau.
   */
  it('lấy chữ đầu của họ và của TÊN', () => {
    expect(getInitials('Nguyễn Văn Ánh')).toBe('NÁ');
  });

  /**
   * ⛔ Dấu tách rời (NFD). Chuỗi từ backend/JWT hay ở dạng `A` + dấu sắc RỜI
   * thay vì một ký tự `Á`. Không `normalize('NFC')` trước khi cắt thì ra `NA`
   * — mất dấu, không có lỗi nào báo, và trông "gần đúng" nên rất khó phát hiện.
   */
  it('giữ dấu khi tên ở dạng tổ hợp NFD', () => {
    const nfd = 'Nguyễn Văn Ánh'.normalize('NFD');

    expect(nfd).not.toBe('Nguyễn Văn Ánh'); // chắc chắn đầu vào đúng là NFD
    expect(getInitials(nfd)).toBe('NÁ');
  });

  it('viết hoa tên nhập bằng chữ thường', () => {
    expect(getInitials('nguyễn văn ánh')).toBe('NÁ');
  });

  it('tên một từ chỉ ra một chữ', () => {
    expect(getInitials('Ánh')).toBe('Á');
  });

  it('bỏ qua khoảng trắng thừa và chuỗi rỗng', () => {
    expect(getInitials('   Trần   Thị   Ổn  ')).toBe('TỔ');
    expect(getInitials('   ')).toBe('');
  });

  it('tôn trọng maxLength', () => {
    expect(getInitials('Nguyễn Văn Ánh', 1)).toBe('N');
    expect(getInitials('Nguyễn Văn Ánh', 3)).toBe('NVÁ');
  });
});

describe('Avatar', () => {
  it('hiện chữ viết tắt khi không có ảnh', async () => {
    const screen = await render(<Avatar name="Nguyễn Văn Ánh" />);

    expect(screen.getByText('NÁ')).toBeOnTheScreen();
  });

  /** Có ảnh thì ảnh THAY chữ, không chồng lên nhau. */
  it('KHÔNG hiện chữ viết tắt khi đã có ảnh', async () => {
    const screen = await render(
      <Avatar name="Nguyễn Văn Ánh" source={{ uri: 'https://example.test/a.png' }} />,
    );

    expect(screen.queryByText('NÁ')).toBeNull();
  });

  /**
   * Avatar không có nhãn thì trình đọc màn hình chỉ đọc "hình ảnh" — trong danh
   * sách chuyển tiền, người dùng khiếm thị không biết đang chọn ai.
   */
  it('đọc được tên qua nhãn a11y', async () => {
    const screen = await render(<Avatar name="Trần Thị Ổn" />);

    expect(screen.getByLabelText('Trần Thị Ổn')).toBeOnTheScreen();
  });

  it('không vẽ chữ nào khi không có cả ảnh lẫn tên', async () => {
    const screen = await render(<Avatar />);

    expect(screen.queryByText(/\S/)).toBeNull();
  });

  /**
   * ⛔ Ca này bảo vệ một lỗi ĐÃ XẢY RA và không lỗi nào báo.
   *
   * `expo-image` gặp URL 404 / link hết hạn / mất mạng thì vẽ TRONG SUỐT và im
   * lặng. Nhánh `source` được chọn trước nên chữ viết tắt không bao giờ có cơ
   * hội hiện ⇒ danh sách người nhận tiền thành một cột ô trống.
   */
  it('rơi về chữ viết tắt khi ảnh lỗi', async () => {
    const screen = await render(
      <Avatar name="Nguyễn Văn Ánh" source={{ uri: 'https://example.test/404.png' }} />,
    );

    expect(screen.queryByText('NÁ')).toBeNull();

    const onError = findImageOnError(screen.root as unknown as TreeNode);
    expect(onError).toBeDefined();
    await act(async () => {
      onError?.({ nativeEvent: { error: 'not found' } });
    });

    expect(screen.getByText('NÁ')).toBeOnTheScreen();
  });

  /** Ảnh lỗi mà KHÔNG có tên thì rơi tiếp về biểu tượng — không được vỡ. */
  it('ảnh lỗi và không có tên thì vẫn dựng được', async () => {
    const screen = await render(<Avatar source={{ uri: 'https://example.test/404.png' }} />);

    const onError = findImageOnError(screen.root as unknown as TreeNode);
    await act(async () => {
      onError?.({ nativeEvent: { error: 'not found' } });
    });

    expect(screen.toJSON()).not.toBeNull();
    expect(screen.queryByText(/\S/)).toBeNull();
  });

  it('vẽ được ở mọi cỡ và có chấm trạng thái', async () => {
    const screen = await render(<Avatar badge="success" name="Lê Minh" size="xs" />);

    expect(screen.getByText('LM')).toBeOnTheScreen();
  });

  /**
   * Có tên ⇒ ô avatar là MỘT phần tử "hình ảnh" có nhãn, không phải ba phần tử
   * rời (ảnh, chữ viết tắt, chấm trạng thái).
   */
  it('có tên thì là một phần tử hình ảnh có nhãn', async () => {
    const screen = await render(<Avatar name="Lê Minh" />);

    expect(screen.getByRole('image', { name: 'Lê Minh' })).toBeOnTheScreen();
  });

  /**
   * ⛔ Không có tên thì KHÔNG khai vai trò nào. Avatar không tên là hình giữ
   * chỗ; để lại `accessibilityRole="image"` thì vài trình đọc màn hình vẫn nhặt
   * được vai đó từ cây con và xướng "hình ảnh" cho một ô không có gì để nói.
   */
  it('không có tên thì không khai vai trò hình ảnh', async () => {
    const screen = await render(<Avatar />);

    expect(screen.queryByRole('image')).toBeNull();
  });
});
