/**
 * p0-11 admin: thiếu VITE_SENTRY_DSN ⇒ NO-OP TUYỆT ĐỐI (không nạp SDK, không init); có DSN ⇒ nạp lười, init đúng tuỳ chọn, xếp hàng sự kiện đến sớm, lọc lỗi axios (không rò mật khẩu/token).
 * SDK được mock — không gọi mạng.
 */
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const scope = { setTag: vi.fn(), setContext: vi.fn() };
  const sdk = {
    init: vi.fn(),
    setUser: vi.fn(),
    captureException: vi.fn(() => 'evt-1234567890abcdef'),
    withScope: vi.fn((cb: (s: typeof scope) => unknown) => cb(scope)),
    browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  };
  return { sdk, scope, loads: { count: 0 }, config: { sentryDsn: '', env: 'staging', release: 'abc123', sentryTracesSampleRate: 0 } };
});

vi.mock('@sentry/react', () => {
  hoisted.loads.count += 1;
  return hoisted.sdk;
});
vi.mock('@/core/config', () => ({ appConfig: hoisted.config }));

import {
  captureException,
  initMonitoring,
  isMonitoringReady,
  resetMonitoringForTests,
  setMonitoringUser,
  whenMonitoringReady,
} from '@/core/monitoring/sentry';
import { FILTERED } from '@/core/monitoring/scrub';

beforeEach(() => {
  resetMonitoringForTests();
  Object.assign(hoisted.config, { sentryDsn: '', env: 'staging', release: 'abc123', sentryTracesSampleRate: 0 });
  hoisted.sdk.init.mockClear();
  hoisted.sdk.setUser.mockClear();
  hoisted.sdk.captureException.mockClear();
  hoisted.sdk.withScope.mockClear();
  hoisted.sdk.browserTracingIntegration.mockClear();
  hoisted.scope.setTag.mockClear();
  hoisted.scope.setContext.mockClear();
});

describe('thiếu DSN', () => {
  it('initMonitoring trả false, KHÔNG nạp SDK, mọi lời gọi là no-op', async () => {
    expect(initMonitoring()).toBe(false);
    await whenMonitoringReady();
    expect(hoisted.loads.count).toBe(0);
    expect(hoisted.sdk.init).not.toHaveBeenCalled();
    expect(captureException(new Error('x'))).toBeUndefined();
    setMonitoringUser({ id: 'u1' });
    expect(hoisted.sdk.captureException).not.toHaveBeenCalled();
    expect(hoisted.sdk.setUser).not.toHaveBeenCalled();
    expect(isMonitoringReady()).toBe(false);
  });
});

describe('có DSN', () => {
  beforeEach(() => {
    hoisted.config.sentryDsn = 'https://public@o1.ingest.sentry.io/2';
  });

  it('nạp lười rồi init với environment/release, sendDefaultPii=false, không tiêm header trace, không tracing khi rate = 0', async () => {
    expect(initMonitoring()).toBe(true);
    expect(hoisted.sdk.init).not.toHaveBeenCalled(); // chưa nạp xong (bất đồng bộ)
    await whenMonitoringReady();
    expect(hoisted.sdk.init).toHaveBeenCalledTimes(1);
    expect(hoisted.sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://public@o1.ingest.sentry.io/2',
        environment: 'staging',
        release: 'abc123',
        sendDefaultPii: false,
        tracesSampleRate: 0,
        tracePropagationTargets: [],
        integrations: [],
      }),
    );
    expect(hoisted.sdk.browserTracingIntegration).not.toHaveBeenCalled();
    expect(isMonitoringReady()).toBe(true);
  });

  it('gọi lần hai không init lại; rate > 0 mới bật browserTracing', async () => {
    hoisted.config.sentryTracesSampleRate = 0.1;
    initMonitoring();
    expect(initMonitoring()).toBe(false);
    await whenMonitoringReady();
    expect(hoisted.sdk.init).toHaveBeenCalledTimes(1);
    expect(hoisted.sdk.browserTracingIntegration).toHaveBeenCalledTimes(1);
  });

  it('beforeSend/beforeBreadcrumb đã gắn scrub (Authorization, reason, console)', async () => {
    initMonitoring();
    await whenMonitoringReady();
    const options = hoisted.sdk.init.mock.calls[0][0] as unknown as {
      beforeSend: (e: unknown) => { request: { headers: Record<string, string> }; extra: Record<string, string> };
      beforeBreadcrumb: (b: unknown) => unknown;
    };
    const sent = options.beforeSend({ request: { headers: { Authorization: 'Bearer x' } }, extra: { reason: 'lý do riêng' } });
    expect(sent.request.headers.Authorization).toBe(FILTERED);
    expect(sent.extra.reason).toBe(FILTERED);
    expect(options.beforeBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
  });

  it('sự kiện bắn trong lúc SDK đang nạp được xếp hàng rồi phát lại; setUser đến sớm được gắn khi init xong', async () => {
    initMonitoring();
    setMonitoringUser({ id: 'u9' });
    const early = captureException(new Error('lỗi sớm'), { requestId: 'req-1', code: 'SYS_500' });
    expect(early).toBeUndefined(); // SDK chưa sẵn sàng → chưa có mã sự kiện
    await whenMonitoringReady();
    expect(hoisted.sdk.captureException).toHaveBeenCalledTimes(1);
    expect(hoisted.scope.setTag).toHaveBeenCalledWith('requestId', 'req-1');
    expect(hoisted.scope.setTag).toHaveBeenCalledWith('code', 'SYS_500');
    expect(hoisted.sdk.setUser).toHaveBeenCalledWith({ id: 'u9' });
  });

  it('SDK đã sẵn sàng: trả mã sự kiện, gắn component stack; setUser(null) gỡ người dùng', async () => {
    initMonitoring();
    await whenMonitoringReady();
    const id = captureException(new Error('boom'), { componentStack: '\n at Foo' });
    expect(id).toBe('evt-1234567890abcdef');
    expect(hoisted.scope.setContext).toHaveBeenCalledWith('react', { componentStack: '\n at Foo' });
    setMonitoringUser(null);
    expect(hoisted.sdk.setUser).toHaveBeenLastCalledWith(null);
  });

  it('lỗi axios chỉ gửi dấu vết vô hại (không config.data/Authorization) + requestId/code từ body lỗi BE', async () => {
    initMonitoring();
    await whenMonitoringReady();
    const config = { method: 'post', url: '/auth/login?token=bi-mat', headers: new AxiosHeaders({ Authorization: 'Bearer token-bi-mat' }), data: '{"password":"hunter2"}' } as InternalAxiosRequestConfig;
    const error = new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', config, undefined, {
      status: 500,
      statusText: 'x',
      headers: {},
      config,
      data: { requestId: 'req-77', error: { code: 'SYS_500' } },
    });

    captureException(error);

    const sent = hoisted.sdk.captureException.mock.calls[0] as unknown as [Error];
    expect(sent[0].name).toBe('AxiosError');
    expect(sent[0].message).toContain('POST /auth/login');
    expect(sent[0].message).toContain('500');
    const flat = JSON.stringify([sent[0].message, hoisted.scope.setTag.mock.calls]);
    expect(flat).not.toContain('token-bi-mat');
    expect(flat).not.toContain('hunter2');
    expect(hoisted.scope.setTag).toHaveBeenCalledWith('requestId', 'req-77');
    expect(hoisted.scope.setTag).toHaveBeenCalledWith('code', 'SYS_500');
  });

  it('tải SDK thất bại (mạng/chặn quảng cáo) → không ném, giám sát coi như tắt', async () => {
    hoisted.sdk.init.mockImplementationOnce(() => {
      throw new Error('init hỏng');
    });
    initMonitoring();
    await whenMonitoringReady();
    expect(isMonitoringReady()).toBe(false);
    expect(captureException(new Error('x'))).toBeUndefined();
  });
});
