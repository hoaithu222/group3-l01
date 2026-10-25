/**
 * `AppErrorBoundary` (p0-11): lỗi render ở tầng provider → trang "Trang quản trị gặp lỗi" bằng câu tiếng Việt cố định + mã sự kiện rút gọn + nút "Tải lại"
 * (không in error.message của thư viện); lỗi được báo qua monitoring (đã lọc) và ghi console bằng `toSafeLog`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const captured = vi.hoisted(() => ({ calls: [] as Array<{ error: unknown; stack: string | null | undefined }>, eventId: 'abcdef1234567890' as string | undefined }));

vi.mock('@/core/monitoring/sentry', () => ({
  captureReactError: (error: unknown, info: { componentStack?: string | null }) => {
    captured.calls.push({ error, stack: info.componentStack });
    return captured.eventId;
  },
}));

import { AppErrorBoundary } from '@/core/monitoring/AppErrorBoundary';

const TECHNICAL = "Cannot read properties of undefined (reading 'name')";

function Boom(): never {
  throw new Error(TECHNICAL);
}

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  captured.calls.length = 0;
  captured.eventId = 'abcdef1234567890';
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('AppErrorBoundary', () => {
  it('không lỗi → render children nguyên vẹn', () => {
    render(
      <AppErrorBoundary>
        <p>nội dung bình thường</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('nội dung bình thường')).toBeInTheDocument();
  });

  it('lỗi render: hiện trang lỗi tiếng Việt + mã sự kiện rút gọn 8 ký tự + nút Tải lại; KHÔNG in error.message', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Trang quản trị gặp lỗi')).toBeInTheDocument();
    expect(screen.getByText(/Đã xảy ra lỗi không mong muốn/)).toBeInTheDocument();
    expect(screen.getByText(/mã abcdef12\b/)).toBeInTheDocument();
    expect(screen.queryByText(/abcdef1234567890/)).not.toBeInTheDocument();
    expect(screen.queryByText(new RegExp(TECHNICAL.slice(0, 20)))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tải lại' })).toBeInTheDocument();
  });

  it('báo lỗi lên monitoring kèm component stack và ghi console [AppError]', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(captured.calls).toHaveLength(1);
    expect((captured.calls[0].error as Error).message).toBe(TECHNICAL);
    expect(captured.calls[0].stack).toContain('Boom');
    expect(errorSpy.mock.calls.some((c) => c[0] === '[AppError]')).toBe(true);
  });

  it('SDK chưa sẵn sàng (không có mã sự kiện) → không hiện dòng mã', () => {
    captured.eventId = undefined;
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByText(/Đã xảy ra lỗi không mong muốn/)).toBeInTheDocument();
    expect(screen.queryByText(/cung cấp mã/)).not.toBeInTheDocument();
  });

  it('bấm Tải lại gọi window.location.reload', async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    try {
      render(
        <AppErrorBoundary>
          <Boom />
        </AppErrorBoundary>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
