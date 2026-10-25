/**
 * Trợ năng hệ form — NHÃN PHẢI NỐI ĐƯỢC VỚI Ô NHẬP.
 *
 * Trước khi sửa: `FormItem` vẽ `<label>` nhưng không field nào truyền `htmlFor`,
 * và control bên trong không có `id`. Hậu quả: trình đọc màn hình đọc ra một ô
 * KHÔNG TÊN, bấm vào nhãn không nhảy vào ô, và mọi test viết theo cách chuẩn
 * (`getByLabelText`) đều không tìm ra ô.
 *
 * Bài kiểm này đi đúng con đường của người dùng khiếm thị: tìm control BẰNG
 * NHÃN. Nó đỏ lại ngay khi ai đó gỡ mắt nối nhãn ↔ ô ở bất kỳ field nào dưới đây.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import {
  AsyncSelectField,
  CheckboxField,
  DateField,
  Form,
  SelectField,
  TextField,
  ToggleField,
} from '@/shared/ui/form';

interface Values {
  fullName: string;
  unit: string;
  dept: string;
  startDate: string;
  agree: boolean;
  notify: boolean;
}

const DEPT_OPTIONS = [
  { value: 'eng', label: 'Kỹ thuật' },
  { value: 'ops', label: 'Vận hành' },
];

const noop = () => {};

/**
 * Gom các dạng control KHÁC NHAU về cơ chế nối nhãn:
 *   - `TextField`        → `<input>` thật, nối bằng `<label htmlFor>`
 *   - `SelectField`      → Radix Select, `<button role="combobox">`
 *   - `AsyncSelectField` → `<button>` mở popover, nối bằng `aria-labelledby`
 *   - `DateField`        → `<input>` nằm trong `PickerTrigger` (chế độ gõ tay)
 *   - `CheckboxField`    → `<input type="checkbox">` thật, nối bằng `htmlFor`
 *   - `ToggleField`      → `<button role="switch">` của Radix, `aria-labelledby`
 */
function Harness() {
  const form = useForm<Values>({
    defaultValues: { fullName: '', unit: '', dept: '', startDate: '', agree: false, notify: false },
  });

  return (
    <>
      <Form form={form} onSubmit={noop}>
        <TextField
          description="Ghi đúng như trên giấy tờ tuỳ thân"
          label="Họ và tên"
          name="fullName"
        />
        <AsyncSelectField fetchOptions={async () => []} label="Đơn vị" name="unit" />
        <SelectField
          description="Chọn phòng ban đang công tác"
          label="Phòng ban"
          name="dept"
          options={DEPT_OPTIONS}
        />
        <DateField label="Ngày bắt đầu" name="startDate" />
        <CheckboxField label="Đồng ý điều khoản" name="agree" />
        <ToggleField label="Nhận thông báo" name="notify" />
      </Form>

      <button type="button" onClick={() => form.setError('fullName', { message: 'Chưa nhập tên' })}>
        Gây lỗi
      </button>
    </>
  );
}

/**
 * `<Form>` gọi `useDirtyGuard` → `useBlocker`, thứ CHỈ chạy trong data router.
 * Bọc bằng memory router để bài kiểm dựng đúng cây provider mà app thật dùng.
 */
function renderHarness() {
  const router = createMemoryRouter([{ path: '/', element: <Harness /> }], {
    initialEntries: ['/'],
  });
  return render(<RouterProvider router={router} />);
}

describe('trợ năng hệ form', () => {
  it('tìm được mọi control bằng NHÃN của nó', () => {
    renderHarness();

    expect(screen.getByLabelText('Họ và tên')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Đơn vị')).toHaveAttribute('aria-labelledby');
    expect(screen.getByLabelText('Đồng ý điều khoản')).toHaveAttribute('type', 'checkbox');
    expect(screen.getByLabelText('Nhận thông báo')).toHaveAttribute('role', 'switch');

    // Hai nhóm mở sau cùng: Radix Select và bộ chọn ngày. Trước khi mở prop,
    // cả hai đều là control KHÔNG TÊN — `getByLabelText` không tìm ra.
    expect(screen.getByLabelText('Phòng ban')).toHaveAttribute('role', 'combobox');
    expect(screen.getByLabelText('Ngày bắt đầu')).toHaveAttribute('type', 'text');
  });

  it('bấm vào nhãn thì con trỏ nhảy vào ô (hành vi native của <label for>)', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByText('Họ và tên'));

    expect(screen.getByLabelText('Họ và tên')).toHaveFocus();
  });

  it('mô tả của field được nối bằng aria-describedby', () => {
    renderHarness();

    const input = screen.getByLabelText('Họ và tên');
    const describedBy = input.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      'Ghi đúng như trên giấy tờ tuỳ thân',
    );
  });

  it('control KHÔNG phải input thật cũng nhận được mô tả (Radix Select)', () => {
    renderHarness();

    const trigger = screen.getByLabelText('Phòng ban');
    const describedBy = trigger.getAttribute('aria-describedby');

    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy as string)).toHaveTextContent(
      'Chọn phòng ban đang công tác',
    );
  });

  it('khi có lỗi thì ô báo aria-invalid và aria-describedby trỏ vào dòng lỗi', async () => {
    const user = userEvent.setup();
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'Gây lỗi' }));

    const input = screen.getByLabelText('Họ và tên');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    // Lỗi đứng TRƯỚC mô tả — trình đọc màn hình đọc theo đúng thứ tự này.
    const [errorId] = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(document.getElementById(errorId)).toHaveTextContent('Chưa nhập tên');
  });
});
