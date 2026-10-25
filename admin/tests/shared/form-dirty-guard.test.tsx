/**
 * `Form` — chặn rời trang khi dữ liệu chưa lưu (`dirtyGuard`) và KHÔNG được đăng ký blocker khi không bật.
 *
 * Trước đây `Form` gọi `useBlocker` vô điều kiện (kể cả khi không truyền `dirtyGuard`), nên:
 *   1. trang có ≥ 2 form (vd tab "Giới hạn" của cấu hình hệ thống: mỗi nhóm một `<Form>`) làm router
 *      ghi `console.warn("A router only supports one blocker at a time")` ở MỌI lần điều hướng;
 *   2. router chỉ hỏi blocker đăng ký SAU CÙNG ⇒ `dirtyGuard` của một form bị bỏ qua nếu form khác
 *      mount sau nó;
 *   3. `Form` không dùng được ngoài data router dù chẳng cần guard.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Form, TextField } from '@/shared/ui/form';

interface Values {
  name: string;
}

const noop = () => {};

function PlainForm({ label }: { label: string }) {
  const form = useForm<Values>({ defaultValues: { name: '' } });
  return (
    <Form form={form} onSubmit={noop}>
      <TextField label={label} name="name" />
    </Form>
  );
}

function GuardedForm() {
  const form = useForm<Values>({ defaultValues: { name: '' } });
  return (
    <Form dirtyGuard form={form} onSubmit={noop}>
      <TextField label="Tên nhóm" name="name" />
    </Form>
  );
}

function renderInRouter(element: React.ReactNode) {
  const router = createMemoryRouter(
    [
      { path: '/', element },
      { path: '/khac', element: <p>Trang khác</p> },
    ],
    { initialEntries: ['/'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => vi.restoreAllMocks());

describe('Form không bật dirtyGuard', () => {
  it('nhiều form trên một trang: điều hướng KHÔNG làm router cảnh báo "one blocker at a time"', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const router = renderInRouter(
      <>
        <PlainForm label="Ô một" />
        <PlainForm label="Ô hai" />
      </>,
    );

    await act(async () => {
      await router.navigate('/khac');
    });

    expect(await screen.findByText('Trang khác')).toBeInTheDocument();
    expect(warn.mock.calls.flat().join(' ')).not.toContain('one blocker at a time');
  });

  it('dùng được ngoài data router (không cần useBlocker)', () => {
    render(<PlainForm label="Ô độc lập" />);
    expect(screen.getByLabelText('Ô độc lập')).toBeInTheDocument();
  });
});

describe('Form dirtyGuard', () => {
  it('form chưa sửa: rời trang bình thường, không hỏi', async () => {
    const router = renderInRouter(<GuardedForm />);

    await act(async () => {
      await router.navigate('/khac');
    });

    expect(await screen.findByText('Trang khác')).toBeInTheDocument();
    expect(screen.queryByText('Bỏ thay đổi?')).not.toBeInTheDocument();
  });

  it('form đã sửa: rời trang bị chặn + hỏi; "Ở lại" giữ nguyên trang và dữ liệu', async () => {
    const user = userEvent.setup();
    const router = renderInRouter(<GuardedForm />);

    await user.type(screen.getByLabelText('Tên nhóm'), 'Nhóm A');
    await act(async () => {
      void router.navigate('/khac');
    });

    expect(await screen.findByText('Bỏ thay đổi?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ở lại' }));

    expect(screen.queryByText('Bỏ thay đổi?')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByLabelText('Tên nhóm')).toHaveValue('Nhóm A');
  });

  it('form đã sửa: "Rời đi" cho qua', async () => {
    const user = userEvent.setup();
    const router = renderInRouter(<GuardedForm />);

    await user.type(screen.getByLabelText('Tên nhóm'), 'Nhóm A');
    await act(async () => {
      void router.navigate('/khac');
    });
    await user.click(await screen.findByRole('button', { name: 'Rời đi' }));

    expect(await screen.findByText('Trang khác')).toBeInTheDocument();
  });

  it('bật dirtyGuard ở một form thì vẫn hoạt động dù có form khác (không guard) mount sau nó', async () => {
    const user = userEvent.setup();
    const router = renderInRouter(
      <>
        <GuardedForm />
        <PlainForm label="Ô phụ" />
      </>,
    );

    await user.type(screen.getByLabelText('Tên nhóm'), 'Nhóm A');
    await act(async () => {
      void router.navigate('/khac');
    });

    expect(await screen.findByText('Bỏ thay đổi?')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
