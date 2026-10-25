/**
 * `CopyableText` (kit2) — mã/ID bấm để chép, dùng chung cho cột "Mã" của nhóm chat và "Job ID" của hàng đợi.
 *
 * Hai bản viết tay trước đây (`ConversationCodeCell`, `CopyableId`) chỉ đổi icon sau khi chép — người dùng trình
 * đọc màn hình không biết lệnh có chạy hay không. Nay một vùng `aria-live` báo "Đã chép <tên>", và chép thất
 * bại thì không báo (không nói dối).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CopyableText } from '@/shared/ui';

const FULL_ID = '64a1b2c3d4e5f60718293a4b5c';

/** Vùng thông báo cho trình đọc màn hình — `aria-live`, không có role riêng (khỏi lẫn với `role=status` của trang). */
const liveRegion = () => {
  const el = document.querySelector('[aria-live="polite"]');
  if (!el) throw new Error('thiếu vùng aria-live');
  return el;
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CopyableText — hiển thị', () => {
  it('mặc định hiện chính `value`; `display` cho bản rút gọn; tên nút = chữ đang hiện', () => {
    const { rerender } = render(<CopyableText label="Job ID" value="mail.send:tpl:9f2c" />);
    expect(screen.getByRole('button', { name: 'mail.send:tpl:9f2c' })).toBeInTheDocument();

    rerender(<CopyableText display="#293a4b" label="mã hội thoại" value={FULL_ID} />);
    expect(screen.getByRole('button', { name: '#293a4b' })).toBeInTheDocument();
    expect(screen.queryByText(FULL_ID)).not.toBeInTheDocument();
  });

  it('title nêu giá trị đầy đủ và việc bấm sẽ làm gì (mô tả của nút cho trình đọc màn hình)', () => {
    render(<CopyableText display="#293a4b" label="mã hội thoại" value={FULL_ID} />);
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      `${FULL_ID} — bấm để chép mã hội thoại`,
    );
  });

  it('vùng aria-live có mặt từ lúc mount và còn rỗng (vùng live mount muộn thì không được đọc)', () => {
    render(<CopyableText label="Job ID" value="abc" />);
    expect(liveRegion()).toBeEmptyDOMElement();
  });
});

describe('CopyableText — chép', () => {
  it('bấm chép TOÀN BỘ `value` (không phải bản rút gọn) vào clipboard', async () => {
    const user = userEvent.setup();
    render(<CopyableText display="#293a4b" label="mã hội thoại" value={FULL_ID} />);

    await user.click(screen.getByRole('button', { name: '#293a4b' }));

    expect(await navigator.clipboard.readText()).toBe(FULL_ID);
  });

  it('chép xong: vùng aria-live báo "Đã chép <tên>", title đổi theo — trước khi chép thì im lặng', async () => {
    const user = userEvent.setup();
    render(<CopyableText label="Job ID" value="mail.send:tpl:9f2c" />);
    expect(liveRegion()).toHaveTextContent('');

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(liveRegion()).toHaveTextContent('Đã chép Job ID'));
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Đã chép Job ID');
  });

  it('thông báo tự tắt sau 2 giây (không đọc lại mãi), gợi ý trở về như cũ', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CopyableText label="Job ID" value="mail.send:tpl:9f2c" />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(liveRegion()).toHaveTextContent('Đã chép Job ID'));

    await vi.advanceTimersByTimeAsync(2100);
    await waitFor(() => expect(liveRegion()).toHaveTextContent(''));
    expect(screen.getByRole('button')).toHaveAttribute(
      'title',
      'mail.send:tpl:9f2c — bấm để chép Job ID',
    );
  });

  it('chép thất bại (không có quyền clipboard) → KHÔNG báo "Đã chép"', async () => {
    const user = userEvent.setup();
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValue(new Error('denied'));
    render(<CopyableText label="Job ID" value="abc" />);

    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('abc'));
    expect(liveRegion()).toHaveTextContent('');
    expect(screen.getByRole('button')).toHaveAttribute('title', 'abc — bấm để chép Job ID');
  });

  it('bấm chép KHÔNG nổi bọt lên phần tử chứa nó (vd hàng bảng bấm-để-mở-chi-tiết)', async () => {
    const onParentClick = vi.fn();
    const user = userEvent.setup();
    render(
      <div onClick={onParentClick}>
        <CopyableText label="Job ID" value="abc" />
      </div>,
    );

    await user.click(screen.getByRole('button'));

    expect(onParentClick).not.toHaveBeenCalled();
  });
});
