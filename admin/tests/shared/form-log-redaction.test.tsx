/**
 * `Form` / `FormModal` bắt lỗi ném ra từ `onSubmit` rồi ghi `console.error`. Với lỗi HTTP của axios,
 * ghi nguyên đối tượng là in luôn `config.data` (mật khẩu người dùng vừa gõ) và
 * `config.headers.Authorization` (access token) ra console — thứ dễ lọt vào ảnh chụp màn hình,
 * screen-share, báo cáo lỗi (`docs/rules/test-viewpoint.md §6`).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { Button, Form, TextField, useZodForm } from '@/shared/ui';
import { toSafeLog } from '@/shared/utils/error-log.utils';

const SECRET_PASSWORD = 'mat-khau-bi-mat-123';
const SECRET_TOKEN = 'access-token-bi-mat';

function loginError(): AxiosError {
  const config = {
    method: 'post',
    url: '/auth/login',
    data: JSON.stringify({ email: 'an@congty.vn', password: SECRET_PASSWORD }),
    headers: new AxiosHeaders({ Authorization: `Bearer ${SECRET_TOKEN}` }),
  } as InternalAxiosRequestConfig;
  return new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, null, {
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config,
    data: { success: false },
  });
}

/** Gom mọi chuỗi trong giá trị (kể cả thuộc tính lồng nhau) để tìm bí mật. */
function flatten(value: unknown, seen = new WeakSet<object>(), depth = 0): string {
  if (typeof value === 'string') return value;
  if (value === null || typeof value !== 'object' || depth > 6) return String(value);
  if (seen.has(value)) return '';
  seen.add(value);
  return Object.getOwnPropertyNames(value)
    .map((key) => {
      try {
        return `${key}=${flatten((value as Record<string, unknown>)[key], seen, depth + 1)}`;
      } catch {
        return '';
      }
    })
    .join(' ');
}

const schema = z.object({ name: z.string() });

function FailingForm() {
  const form = useZodForm<{ name: string }>(schema, { defaultValues: { name: 'x' } });
  return (
    <Form
      form={form}
      onSubmit={async () => {
        throw loginError();
      }}
    >
      <TextField label="Tên" name="name" />
      <Button type="submit">Gửi</Button>
    </Form>
  );
}

afterEach(() => vi.restoreAllMocks());

describe('ghi log lỗi của form', () => {
  it('toSafeLog: lỗi axios chỉ còn trường vô hại, không mang config/headers/body', () => {
    const safe = toSafeLog(loginError());

    expect(safe).toEqual({
      name: 'AxiosError',
      message: 'Request failed with status code 401',
      code: 'ERR_BAD_REQUEST',
      status: 401,
      method: 'post',
      url: '/auth/login',
    });
    expect(flatten(safe)).not.toContain(SECRET_PASSWORD);
    expect(flatten(safe)).not.toContain(SECRET_TOKEN);
  });

  it('lỗi không phải axios được giữ nguyên (còn nguyên stack để gỡ lỗi)', () => {
    const error = new Error('duplicate_code');
    expect(toSafeLog(error)).toBe(error);
  });

  it('⛔ `Form` gặp onSubmit ném lỗi axios ⇒ có ghi log NHƯNG không chứa mật khẩu/token', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // `Form` cần data router (useDirtyGuard → useBlocker).
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <FailingForm /> }])} />);

    await userEvent.click(screen.getByRole('button', { name: 'Gửi' }));

    await waitFor(() => expect(errors).toHaveBeenCalled());
    const printed = errors.mock.calls.map((args) => args.map((a) => flatten(a)).join(' ')).join('\n');
    expect(printed).toContain('/auth/login');
    expect(printed).not.toContain(SECRET_PASSWORD);
    expect(printed).not.toContain(SECRET_TOKEN);
  });
});
