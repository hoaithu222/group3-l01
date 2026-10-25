/**
 * Màn lỗi cuối cùng của app (`RouteErrorBoundary`) và lỗi tải trang (`LazyErrorBoundary`).
 *
 * Người dùng cuối chỉ được thấy câu tiếng Việt cố định — KHÔNG được thấy `error.message` thô của thư viện
 * ("Cannot read properties of undefined…"): sai ngôn ngữ giữa app tiếng Việt và lộ chi tiết nội bộ.
 * Chi tiết vẫn phải có ở console (nếu không, lỗi biến mất không dấu vết), và lỗi axios phải đi qua
 * `toSafeLog` để không đưa mật khẩu/token ra console (`docs/rules/test-viewpoint.md §6`).
 */
import { render, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { LazyErrorBoundary } from '@/app/router/components/LazyErrorBoundary';
import RouteErrorBoundary from '@/app/router/components/RouteErrorBoundary';

const TECHNICAL = "Cannot read properties of undefined (reading 'name')";

function Boom({ error }: { error: Error }): never {
  throw error;
}

function axiosError(): AxiosError {
  const config = {
    method: 'get',
    url: '/users',
    headers: new AxiosHeaders({ Authorization: 'Bearer token-bi-mat' }),
  } as InternalAxiosRequestConfig;
  return new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', config);
}

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  // React in lỗi render ra console.error — chặn để log test sạch, đồng thời kiểm được lời gọi của ta.
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

function renderRouteError(error: Error) {
  const router = createMemoryRouter(
    [{ path: '/', element: <Boom error={error} />, errorElement: <RouteErrorBoundary /> }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('RouteErrorBoundary', () => {
  it('lỗi render: hiện câu tiếng Việt cố định, KHÔNG in error.message của thư viện', () => {
    renderRouteError(new Error(TECHNICAL));

    expect(screen.getByRole('heading', { name: 'Có lỗi xảy ra' })).toBeInTheDocument();
    expect(screen.getByText(/Đã xảy ra lỗi không mong muốn/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(TECHNICAL.slice(0, 20)))).not.toBeInTheDocument();
    // Vẫn có lối thoát.
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Về trang chủ' })).toBeInTheDocument();
  });

  it('ghi chi tiết ra console (errorElement không tự ghi log)', () => {
    renderRouteError(new Error(TECHNICAL));

    const logged = errorSpy.mock.calls.filter((c) => c[0] === '[RouteError]');
    expect(logged).toHaveLength(1);
    expect(String((logged[0][1] as Error).message)).toBe(TECHNICAL);
  });

  it('lỗi axios đi qua toSafeLog: không mang config/headers (token) ra console', () => {
    renderRouteError(axiosError());

    const logged = errorSpy.mock.calls.find((c) => c[0] === '[RouteError]');
    expect(logged).toBeDefined();
    const payload = logged?.[1] as Record<string, unknown>;
    expect(payload).toMatchObject({ name: 'AxiosError', code: 'ERR_BAD_RESPONSE', url: '/users' });
    expect(JSON.stringify(payload)).not.toContain('token-bi-mat');
    expect(payload).not.toHaveProperty('config');
  });
});

describe('LazyErrorBoundary', () => {
  it('lỗi thường: câu tiếng Việt cố định, KHÔNG in error.message; có Tải lại + Về trang chủ', () => {
    render(
      <LazyErrorBoundary>
        <Boom error={new Error(TECHNICAL)} />
      </LazyErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Có lỗi xảy ra' })).toBeInTheDocument();
    expect(screen.getByText(/Đã xảy ra lỗi khi tải trang/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(TECHNICAL.slice(0, 20)))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Về trang chủ' })).toBeInTheDocument();
  });

  it('lỗi tải chunk (deploy mới): báo "Phiên bản mới đã được cập nhật", chỉ còn nút Tải lại', () => {
    render(
      <LazyErrorBoundary>
        <Boom error={new Error('Failed to fetch dynamically imported module: /assets/x.js')} />
      </LazyErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', { name: 'Phiên bản mới đã được cập nhật' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Về trang chủ' })).not.toBeInTheDocument();
  });

  it('lỗi axios ném từ render: log qua toSafeLog (không lộ Authorization)', () => {
    render(
      <LazyErrorBoundary>
        <Boom error={axiosError()} />
      </LazyErrorBoundary>,
    );

    const logged = errorSpy.mock.calls.find((c) => c[0] === '[LazyLoad] Module load error:');
    expect(logged).toBeDefined();
    expect(JSON.stringify(logged?.[1])).not.toContain('token-bi-mat');
  });
});
