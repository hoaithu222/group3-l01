import type { ErrorInfo } from 'react';
import { isAxiosError } from 'axios';

import { appConfig } from '@/core/config';

import { scrubBreadcrumb, scrubEvent, scrubUrl } from './scrub';

/**
 * Giám sát lỗi Sentry cho admin (p0-11 admin.md §2). **Thiếu `VITE_SENTRY_DSN` ⇒ no-op tuyệt đối**: không nạp gói `@sentry/react` (dynamic import — ra chunk riêng `sentry`,
 * không vào bundle chính), không `Sentry.init`, mọi hàm ở đây thành no-op. Có DSN: SDK được nạp lười ngay sau lần vẽ đầu; sự kiện bắn trong lúc SDK đang nạp được xếp hàng rồi phát lại.
 *
 * ⛔ Không dùng `Sentry.*` trực tiếp ở nơi khác — đi qua file này để luôn có scrub (`scrub.ts`) và để test giả được một chỗ.
 */
type SentryModule = typeof import('@sentry/react');

export interface MonitoringContext {
  /** `error.requestId` của BE (hợp đồng lỗi) — tag để tra log phía server. */
  requestId?: string;
  /** Mã lỗi nghiệp vụ (`AUTH_001`…). */
  code?: string;
  /** Component stack của React (từ `componentDidCatch`). */
  componentStack?: string | null;
}

let sdk: SentryModule | null = null;
let loading: Promise<void> | null = null;
let pendingUser: { id: string } | null = null;
const queue: Array<(sentry: SentryModule) => void> = [];

/** Lỗi axios mang theo `config.data` (mật khẩu) và `Authorization` — chỉ giữ dấu vết vô hại (cùng tinh thần `toSafeLog`). */
function toSafeError(error: unknown): { error: Error; context: MonitoringContext } {
  if (!isAxiosError(error)) return { error: error instanceof Error ? error : new Error(String(error)), context: {} };
  const status = error.response?.status;
  const url = scrubUrl(error.config?.url ?? '');
  const safe = new Error(`${error.code ?? 'AxiosError'} ${(error.config?.method ?? 'get').toUpperCase()} ${url}${status ? ` → ${status}` : ''}`);
  safe.name = 'AxiosError';
  const body = error.response?.data as { requestId?: unknown; error?: { code?: unknown } } | undefined;
  return {
    error: safe,
    context: {
      requestId: typeof body?.requestId === 'string' ? body.requestId : undefined,
      code: typeof body?.error?.code === 'string' ? body.error.code : undefined,
    },
  };
}

function run(task: (sentry: SentryModule) => void): void {
  if (sdk) task(sdk);
  else if (loading) queue.push(task);
}

/** Bật giám sát nếu có DSN. Trả `true` khi đã lên lịch nạp SDK; `false` = no-op (thiếu DSN hoặc đã bật). Gọi MỘT lần lúc khởi động (`main.tsx`). */
export function initMonitoring(): boolean {
  if (loading || !appConfig.sentryDsn) return false;
  loading = import('@sentry/react')
    .then((sentry) => {
      const tracing = appConfig.sentryTracesSampleRate > 0;
      sentry.init({
        dsn: appConfig.sentryDsn,
        environment: appConfig.env,
        release: appConfig.release || undefined,
        sendDefaultPii: false,
        maxBreadcrumbs: 50,
        tracesSampleRate: appConfig.sentryTracesSampleRate,
        // Đo hiệu năng CHỈ khi bật rõ ràng; không tiêm header `sentry-trace`/`baggage` vào request nào (`tracePropagationTargets: []`).
        integrations: tracing ? [sentry.browserTracingIntegration({ enableInp: false })] : [],
        tracePropagationTargets: [],
        ignoreErrors: ['ResizeObserver loop limit exceeded', 'ResizeObserver loop completed with undelivered notifications'],
        beforeSend: (event) => scrubEvent(event),
        beforeSendTransaction: (event) => scrubEvent(event),
        beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
      });
      if (pendingUser) sentry.setUser(pendingUser);
      sdk = sentry;
      for (const task of queue.splice(0)) task(sentry);
    })
    .catch(() => {
      // Tải chunk thất bại (mạng/chặn quảng cáo): bỏ hàng đợi, giám sát coi như tắt — không được làm hỏng app.
      queue.length = 0;
    });
  return true;
}

/** Gửi một lỗi (đã lọc). Trả mã sự kiện nếu SDK đã sẵn sàng (để hiện cho người dùng báo hỗ trợ), `undefined` nếu chưa nạp/tắt. */
export function captureException(error: unknown, context: MonitoringContext = {}): string | undefined {
  const safe = toSafeError(error);
  const merged: MonitoringContext = { ...safe.context, ...context };
  let eventId: string | undefined;
  run((sentry) => {
    eventId = sentry.withScope((scope) => {
      if (merged.requestId) scope.setTag('requestId', merged.requestId);
      if (merged.code) scope.setTag('code', merged.code);
      if (merged.componentStack) scope.setContext('react', { componentStack: merged.componentStack });
      return sentry.captureException(safe.error);
    });
  });
  return eventId;
}

/** Tiện cho `componentDidCatch`. */
export function captureReactError(error: unknown, info: ErrorInfo): string | undefined {
  return captureException(error, { componentStack: info.componentStack });
}

/** Gắn `id` người dùng (không email) khi đăng nhập; `null` khi đăng xuất. Không có SDK ⇒ nhớ lại để gắn khi SDK nạp xong. */
export function setMonitoringUser(user: { id: string } | null): void {
  pendingUser = user;
  run((sentry) => sentry.setUser(user));
}

/** Test/chẩn đoán: đã sẵn sàng gửi chưa. */
export function isMonitoringReady(): boolean {
  return sdk !== null;
}

/** Test: chờ nạp xong SDK. */
export function whenMonitoringReady(): Promise<void> {
  return loading ?? Promise.resolve();
}

/** CHỈ dùng trong test. */
export function resetMonitoringForTests(): void {
  sdk = null;
  loading = null;
  pendingUser = null;
  queue.length = 0;
}
