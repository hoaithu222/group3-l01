/**
 * `ImagePreview` (kit2) tương tác được (`preview` / `onClick`) là một `div` — phải thao tác được bằng
 * bàn phím và có vai trò/tên cho trình đọc màn hình, chứ không chỉ chuột. Trước đây khung này chỉ có
 * `onClick`: người dùng bàn phím không tab tới được, không mở được lightbox.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ImagePreview } from '@/shared/ui';

const SRC = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

describe('ImagePreview — bàn phím & trợ năng', () => {
  it('có onClick: là nút tab tới được, tên = alt; Enter và Space đều gọi onClick', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ImagePreview alt="Huy hiệu Chăm chỉ" src={SRC} onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Huy hiệu Chăm chỉ' });
    expect(button).toHaveAttribute('tabindex', '0');

    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('preview: Enter mở lightbox (hộp thoại)', async () => {
    const user = userEvent.setup();
    render(<ImagePreview alt="Ảnh bằng chứng" preview src={SRC} />);

    const button = screen.getByRole('button', { name: 'Ảnh bằng chứng' });
    expect(button).toHaveAttribute('aria-haspopup', 'dialog');

    button.focus();
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('không tương tác (chỉ hiển thị): KHÔNG là nút, không tab tới', () => {
    render(<ImagePreview alt="Biểu tượng" src={SRC} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Biểu tượng' })).toBeInTheDocument();
  });

  it('không có ảnh (placeholder) dù truyền onClick: không giả làm nút', () => {
    render(<ImagePreview alt="Trống" onClick={() => undefined} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
