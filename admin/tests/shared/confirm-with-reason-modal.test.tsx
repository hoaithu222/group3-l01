/**
 * `ConfirmWithReasonModal` — lý do bắt buộc ≥ 10 ký tự (khớp `reasonSchema`
 * phía BE), và giá trị gửi lên đã qua `.trim()`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmWithReasonModal } from '@/shared/ui';

describe('ConfirmWithReasonModal', () => {
  it('submit rỗng → báo lỗi, KHÔNG gọi onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmWithReasonModal
        impact="Tài khoản sẽ bị khoá ngay lập tức."
        open
        title="Khoá tài khoản"
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    // Schema chỉ khai MỘT ngưỡng `.min(10, ...)` (không `.min(1)` riêng) nên
    // rỗng và "ngắn hơn 10 ký tự" cùng rơi vào một thông điệp.
    await waitFor(() => {
      expect(screen.getByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('lý do dưới 10 ký tự → báo lỗi độ dài, KHÔNG gọi onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmWithReasonModal
        impact="Tài khoản sẽ bị khoá ngay lập tức."
        open
        title="Khoá tài khoản"
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/Lý do/i), 'ngan qua');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => {
      expect(screen.getByText('Lý do tối thiểu 10 ký tự')).toBeInTheDocument();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('lý do ≥ 10 ký tự (có khoảng trắng thừa) → gọi onConfirm với chuỗi đã trim', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <ConfirmWithReasonModal
        impact="Tài khoản sẽ bị khoá ngay lập tức."
        open
        title="Khoá tài khoản"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    await user.type(screen.getByLabelText(/Lý do/i), '  Vi phạm điều khoản sử dụng  ');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('Vi phạm điều khoản sử dụng');
    });
    // FormModal tự đóng sau khi onConfirm chạy trót lọt.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('minReasonLength/maxReasonLength tuỳ chỉnh → thông điệp và ngưỡng theo props (mặc định 10/500)', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <ConfirmWithReasonModal
        impact="Tác động."
        maxReasonLength={40}
        minReasonLength={20}
        open
        title="Ngưỡng riêng"
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
      />,
    );

    // 15 ký tự: qua ngưỡng mặc định 10 nhưng KHÔNG qua ngưỡng 20 của nơi gọi.
    await user.type(screen.getByLabelText(/Lý do/i), 'mười lăm ký tự ơi');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    expect(await screen.findByText('Lý do tối thiểu 20 ký tự')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    // Ô nhập chặn ở trần tuỳ chỉnh.
    expect(screen.getByLabelText(/Lý do/i)).toHaveAttribute('maxlength', '40');
  });

  it('confirmTone="danger" → nút xác nhận đỏ; mặc định (primary) thì không', () => {
    const { rerender } = render(
      <ConfirmWithReasonModal
        confirmLabel="Khoá"
        confirmTone="danger"
        impact="Tác động."
        open
        title="Khoá tài khoản"
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Khoá' }).className).toContain('bg-red-6');

    rerender(
      <ConfirmWithReasonModal
        confirmLabel="Khoá"
        impact="Tác động."
        open
        title="Khoá tài khoản"
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Khoá' }).className).not.toContain('bg-red-6');
  });

  it('đang xử lý (onConfirm chưa xong) → nút hiện "Đang xử lý..." và bị khoá; xong thì modal đóng', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const onOpenChange = vi.fn();

    render(
      <ConfirmWithReasonModal
        impact="Tác động."
        open
        title="Xử lý chậm"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    await user.type(screen.getByLabelText(/Lý do/i), 'Lý do đủ dài để gửi');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    const busy = await screen.findByRole('button', { name: /Đang xử lý/ });
    expect(busy).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalled();

    finish();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('onConfirm ném lỗi → modal GIỮ MỞ để thử lại (không gọi onOpenChange(false))', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error('server từ chối'));
    const onOpenChange = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <ConfirmWithReasonModal
        impact="Tác động."
        open
        title="Lỗi từ server"
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    );

    await user.type(screen.getByLabelText(/Lý do/i), 'Lý do đủ dài để gửi');
    await user.click(screen.getByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeEnabled();
    errorSpy.mockRestore();
  });
});
