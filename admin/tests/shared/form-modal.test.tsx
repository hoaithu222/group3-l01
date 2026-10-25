/**
 * FormModal — ném lỗi trong `onConfirm` là API ĐƯỢC TÀI LIỆU HOÁ.
 *
 * `docs/rules/form-validation.md §4` dạy: kiểm trùng mã thì gọi
 * `form.setError(...)` rồi `throw` để modal KHÔNG đóng. Vậy nên đường "ném lỗi"
 * là đường chạy bình thường, không phải ngoại lệ hiếm.
 *
 * Trước khi sửa, nhánh CÓ form không bắt lỗi: `handleSubmit` của react-hook-form
 * ném tiếp ra ngoài → unhandled promise rejection. Modal vẫn ở nguyên (đúng ý),
 * nhưng console đỏ mỗi lần người dùng nhập trùng mã — tức là mỗi lần dùng đúng
 * tính năng.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FormModal, TextField } from '@/shared/ui';

interface Values {
  code: string;
}

function Harness({ onConfirm }: { onConfirm: (data?: Values) => Promise<void> }) {
  const form = useForm<Values>({ defaultValues: { code: 'ABC' } });
  return (
    <FormModal form={form} open title="Thêm mục" onConfirm={onConfirm} onOpenChange={vi.fn()}>
      <TextField label="Mã" name="code" />
    </FormModal>
  );
}

describe('FormModal — onConfirm ném lỗi', () => {
  let rejections: unknown[] = [];
  const collect = (e: PromiseRejectionEvent) => {
    rejections.push(e.reason);
    e.preventDefault();
  };

  beforeEach(() => {
    rejections = [];
    window.addEventListener('unhandledrejection', collect);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    window.removeEventListener('unhandledrejection', collect);
    vi.restoreAllMocks();
  });

  it('modal KHÔNG đóng và KHÔNG sinh unhandled rejection', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValue(new Error('duplicate_code'));

    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: /xác nhận|lưu|thêm/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());

    // Modal vẫn còn trên màn hình — đó chính là điều bên gọi muốn khi ném lỗi.
    expect(screen.getByText('Thêm mục')).toBeInTheDocument();

    // Cho vòng lặp sự kiện chạy hết để rejection (nếu có) kịp nổi lên.
    await new Promise((r) => setTimeout(r, 0));
    expect(rejections).toHaveLength(0);
  });

  it('onConfirm chạy trót lọt thì yêu cầu đóng modal', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    function OkHarness() {
      const f = useForm<Values>({ defaultValues: { code: 'ABC' } });
      return (
        <FormModal
          form={f}
          open
          title="Thêm mục"
          onConfirm={async () => {}}
          onOpenChange={onOpenChange}
        >
          <TextField label="Mã" name="code" />
        </FormModal>
      );
    }

    render(<OkHarness />);
    await user.click(screen.getByRole('button', { name: /xác nhận|lưu|thêm/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
