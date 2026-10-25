/**
 * `Pagination` (kit2) — dùng ở MỌI bảng của admin nên nhãn phải là tiếng Việt và đủ cho trình đọc màn hình:
 * vùng `nav` có tên, nút Trước/Sau và từng số trang có tên riêng ("Previous page"/"Next page" tiếng Anh
 * và số trang trần "1", "2" là lỗi cũ), tổng số đọc được ("1.234").
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from '@/shared/ui';

function setup(overrides: Partial<React.ComponentProps<typeof Pagination>> = {}) {
  const onPageChange = vi.fn();
  render(
    <Pagination
      pageCount={5}
      pageIndex={1}
      pageSize={10}
      total={1234}
      onPageChange={onPageChange}
      onPageSizeChange={() => undefined}
      {...overrides}
    />,
  );
  return { onPageChange };
}

describe('Pagination — trợ năng & định dạng', () => {
  it('là vùng điều hướng có tên "Phân trang"', () => {
    setup();
    expect(screen.getByRole('navigation', { name: 'Phân trang' })).toBeInTheDocument();
  });

  it('nút Trước/Sau bằng tiếng Việt, số trang có tên "Trang N", trang hiện tại aria-current', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Trang 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Trang 3' })).not.toHaveAttribute('aria-current');
    expect(screen.queryByRole('button', { name: /Previous page|Next page/ })).not.toBeInTheDocument();
  });

  it('bấm "Trang 3" / "Trang trước" / "Trang sau" gọi onPageChange đúng chỉ số 0-based', async () => {
    const user = userEvent.setup();
    const { onPageChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Trang 3' }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
    await user.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(onPageChange).toHaveBeenLastCalledWith(0);
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it('trang đầu: "Trang trước" bị khoá; trang cuối: "Trang sau" bị khoá', () => {
    const { rerender } = render(
      <Pagination
        pageCount={3}
        pageIndex={0}
        pageSize={10}
        total={25}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();

    rerender(
      <Pagination
        pageCount={3}
        pageIndex={2}
        pageSize={10}
        total={25}
        onPageChange={() => undefined}
        onPageSizeChange={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('tổng số dùng dấu phân cách hàng nghìn kiểu Việt ("1.234")', () => {
    setup({ total: 1234 });
    expect(screen.getByText('1.234')).toBeInTheDocument();
  });
});
