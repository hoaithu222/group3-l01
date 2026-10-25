/**
 * `Callout.action` — hành động đi kèm nội dung (vd nút "Thử lại" của banner lỗi tải dữ liệu). Trước đây
 * từng màn tự bọc `description` bằng `<div className="flex flex-wrap …">` (lặp ở hơn chục chỗ).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, Callout } from '@/shared/ui';

describe('Callout — action', () => {
  it('hiện nội dung và hành động cùng một banner; bấm hành động chạy handler', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={onRetry}>
            Thử lại
          </Button>
        }
        description="Kiểm tra kết nối rồi thử lại."
        intent="error"
        title="Không tải được dữ liệu"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Không tải được dữ liệu');
    expect(alert).toHaveTextContent('Kiểm tra kết nối rồi thử lại.');
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('chỉ có action (không description) vẫn hiện hành động', () => {
    render(<Callout action={<Button size="sm">Làm mới</Button>} intent="warning" title="Cũ" />);
    expect(screen.getByRole('button', { name: 'Làm mới' })).toBeInTheDocument();
  });

  it('không có action → cấu trúc cũ: nội dung trần trong đúng một khối, không bọc thêm span/flex', () => {
    render(<Callout description="Nội dung" intent="info" />);
    const description = screen.getByText('Nội dung');
    expect(description.tagName).toBe('DIV');
    expect(description.querySelector('span')).toBeNull();
    expect(description.className).not.toContain('justify-between');
  });
});
