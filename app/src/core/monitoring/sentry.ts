import * as Sentry from '@sentry/react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import type { ComponentType } from 'react';

import { apiClient } from '@/core/api/client';
import { onSessionEnded } from '@/core/api/session-end';
import { appConfig } from '@/core/config/env.config';
import { addLogSink } from '@/shared/utils/logger';

import { attachApiBreadcrumbs, describeApiError } from './api-breadcrumbs';
import { scrubBreadcrumb, scrubEvent } from './scrub';

/**
 * Giám sát lỗi Sentry cho app (p0-11 app.md §4). **Thiếu `EXPO_PUBLIC_SENTRY_DSN` ⇒ no-op tuyệt đối**: không `Sentry.init`, không gắn interceptor/ống xả log, `wrapRootComponent`
 * trả nguyên component, mọi hàm ở đây thoát ngay. ⛔ Không dùng `Sentry.*` trực tiếp ở nơi khác — đi qua file này để luôn có scrub (`scrub.ts`).
 *
 * ⚠️ `@sentry/react-native` là module NATIVE — bản dev-client cài từ TRƯỚC khi thêm gói phải build lại. Chưa có native thì JS vẫn nạp được (chỉ thiếu tính năng native) và không sập.
 */
let active = false;
/** Hàm gỡ những thứ  đã gắn (ống xả log, interceptor, người nghe phiên) — chỉ test dùng. */
const teardown: (() => void)[] = [];

export interface MonitoringContext {
  /** Component stack của React (từ `componentDidCatch`). */
  componentStack?: string | null;
  /** Nhãn tự do, giá trị ngắn (không nội dung người dùng). */
  tags?: Record<string, string>;
}

function releaseName(): string {
  return `${Application.applicationId ?? appConfig.env}@${Application.nativeApplicationVersion ?? '0'}+${Application.nativeBuildVersion ?? '0'}`;
}

/** `updateId` của bản OTA đang chạy; bản build gốc (chưa OTA) dùng số build. */
function distName(): string | undefined {
  return Updates.updateId ?? Application.nativeBuildVersion ?? undefined;
}

/**
 * Bật giám sát nếu có DSN; trả `true` khi đã bật. Gọi MỘT lần ở tầm module của `app/_layout.tsx` (TRƯỚC render đầu tiên để bắt cả lỗi lúc khởi động).
 * Người dùng: `setMonitoringUser` (id, không email) khi đăng nhập; phiên kết thúc (đăng xuất/refresh chết/socket từ chối) → `setUser(null)` qua `onSessionEnded`.
 */
export function initMonitoring(): boolean {
  if (active) return true;
  const dsn = appConfig.sentryDsn;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: appConfig.env,
    release: releaseName(),
    dist: distName(),
    tracesSampleRate: appConfig.isProduction ? 0.05 : 0.2,
    sendDefaultPii: false,
    attachStacktrace: true,
    maxBreadcrumbs: 50,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  active = true;
  // Dấu vết log của app (đã cam kết không mang bí mật) → breadcrumb `app`; CHỈ chuỗi `message`, không kèm `args`.
  teardown.push(
    addLogSink((level, message) => addMonitoringBreadcrumb({ category: 'app', level: level === 'warn' ? 'warning' : level, message })),
    attachApiBreadcrumbs(apiClient, addMonitoringBreadcrumb),
    onSessionEnded(() => setMonitoringUser(null)),
  );
  return true;
}

/** Bọc component gốc (`Sentry.wrap`: đo chạm/điều hướng, ranh giới lỗi cuối). Chưa bật Sentry → trả nguyên component. */
export function wrapRootComponent<P extends Record<string, unknown>>(component: ComponentType<P>): ComponentType<P> {
  return active ? Sentry.wrap(component) : component;
}

/** Gửi một lỗi (đã lọc). Lỗi axios chỉ gửi dấu vết vô hại (không `config.data`/`Authorization`). Trả mã sự kiện, `undefined` khi tắt. */
export function captureException(error: unknown, context: MonitoringContext = {}): string | undefined {
  if (!active) return undefined;
  const api = describeApiError(error);
  const safe = api ? Object.assign(new Error(`${api.method ?? 'REQ'} ${api.url} → ${api.status ?? 'ERR'}`), { name: 'AxiosError' }) : error;
  return Sentry.withScope((scope) => {
    if (api?.requestId) scope.setTag('requestId', api.requestId);
    if (api?.code) scope.setTag('code', api.code);
    for (const [key, value] of Object.entries(context.tags ?? {})) scope.setTag(key, value);
    if (context.componentStack) scope.setContext('react', { componentStack: context.componentStack });
    return Sentry.captureException(safe);
  });
}

export function addMonitoringBreadcrumb(breadcrumb: { category: string; level?: 'debug' | 'error' | 'info' | 'warning'; message?: string; data?: object }): void {
  if (active) Sentry.addBreadcrumb(breadcrumb);
}

/** Gắn `id` người dùng (không email) khi đăng nhập; `null` khi hết phiên. */
export function setMonitoringUser(user: { id: string } | null): void {
  if (active) Sentry.setUser(user);
}

/** CHỈ dùng trong test. */
export function resetMonitoringForTests(): void {
  for (const dispose of teardown.splice(0)) dispose();
  active = false;
}
