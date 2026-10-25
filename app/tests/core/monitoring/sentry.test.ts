/**
 * p0-11 app: thiếu EXPO_PUBLIC_SENTRY_DSN ⇒ NO-OP TUYỆT ĐỐI (không init, không gắn interceptor/ống xả log, wrap trả nguyên component);
 * có DSN ⇒ init đúng tuỳ chọn (release/dist/sample rate/scrub), log → breadcrumb, phiên kết thúc → setUser(null). SDK/native được mock.
 */
import * as Sentry from '@sentry/react-native';
import { AxiosError } from 'axios';

import { apiClient } from '@/core/api/client';
import { __resetSessionEndListenersForTests, notifySessionEnded } from '@/core/api/session-end';
import { appConfig } from '@/core/config/env.config';
import {
  addMonitoringBreadcrumb,
  captureException,
  initMonitoring,
  resetMonitoringForTests,
  setMonitoringUser,
  wrapRootComponent,
} from '@/core/monitoring/sentry';
import { logger } from '@/shared/utils/logger';

/** Scope giả dùng CHUNG — chỉ được đọc LƯỜI trong `withScope` (factory của `jest.mock` chạy trước khi biến này được khởi tạo). */
const mockScope = { setTag: jest.fn(), setContext: jest.fn() };

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: jest.fn((component: unknown) => component),
  withScope: jest.fn((cb: (scope: unknown) => unknown) => cb(mockScope)),
  captureException: jest.fn(() => 'evt-1'),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
}));
jest.mock('expo-application', () => ({ applicationId: 'com.mancode.vungnui', nativeApplicationVersion: '1.2.3', nativeBuildVersion: '45' }));
jest.mock('expo-updates', () => ({ updateId: 'upd-9' }));
jest.mock('@/core/config/env.config', () => ({ appConfig: { sentryDsn: '', env: 'staging', isProduction: false } }));
jest.mock('@/core/api/client', () => ({ apiClient: { interceptors: { response: { use: jest.fn(() => 7), eject: jest.fn() } } } }));

// Kiểu mock của các bản giả ở trên (ép kiểu MỘT chỗ).
const mockSdk = Sentry as unknown as Record<'init' | 'wrap' | 'withScope' | 'captureException' | 'addBreadcrumb' | 'setUser', jest.Mock>;
const mockResponse = (apiClient as unknown as { interceptors: { response: Record<'use' | 'eject', jest.Mock> } }).interceptors.response;
const mockConfig = appConfig as unknown as { sentryDsn: string; isProduction: boolean };

const DSN = 'https://public@o1.ingest.sentry.io/2';

beforeEach(() => {
  jest.clearAllMocks();
  resetMonitoringForTests();
  __resetSessionEndListenersForTests();
  mockResponse.use.mockReturnValue(7);
  mockConfig.sentryDsn = '';
  mockConfig.isProduction = false;
});
afterAll(() => {
  resetMonitoringForTests();
  __resetSessionEndListenersForTests();
});

describe('thiếu DSN', () => {
  it('không init, không gắn interceptor, wrap trả nguyên component, mọi hàm là no-op', () => {
    const Root = () => null;
    expect(initMonitoring()).toBe(false);
    expect(mockSdk.init).not.toHaveBeenCalled();
    expect(mockResponse.use).not.toHaveBeenCalled();
    expect(wrapRootComponent(Root)).toBe(Root);
    expect(captureException(new Error('x'))).toBeUndefined();
    setMonitoringUser({ id: 'u1' });
    addMonitoringBreadcrumb({ category: 'app', message: 'm' });
    expect(mockSdk.captureException).not.toHaveBeenCalled();
    expect(mockSdk.setUser).not.toHaveBeenCalled();
    expect(mockSdk.addBreadcrumb).not.toHaveBeenCalled();
  });
});

describe('có DSN', () => {
  beforeEach(() => {
    mockConfig.sentryDsn = DSN;
  });

  it('init với environment, release `id@version+build`, dist = updateId, sendDefaultPii=false, sample rate theo môi trường; gọi lần hai không init lại', () => {
    expect(initMonitoring()).toBe(true);
    expect(mockSdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: DSN,
        environment: 'staging',
        release: 'com.mancode.vungnui@1.2.3+45',
        dist: 'upd-9',
        tracesSampleRate: 0.2,
        sendDefaultPii: false,
      }),
    );
    expect(mockResponse.use).toHaveBeenCalledTimes(1);
    expect(initMonitoring()).toBe(true);
    expect(mockSdk.init).toHaveBeenCalledTimes(1);
  });

  it('production lấy mẫu 5%', () => {
    mockConfig.isProduction = true;
    initMonitoring();
    expect(mockSdk.init).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 0.05 }));
  });

  it('beforeSend/beforeBreadcrumb đã gắn scrub', () => {
    initMonitoring();
    const options = mockSdk.init.mock.calls[0][0] as unknown as {
      beforeSend: (e: unknown) => { request: { headers: Record<string, string> } };
      beforeBreadcrumb: (b: unknown) => unknown;
    };
    expect(options.beforeSend({ request: { headers: { Authorization: 'Bearer x' } } }).request.headers.Authorization).toBe('[Filtered]');
    expect(options.beforeBreadcrumb({ category: 'console', message: 'x' })).toBeNull();
  });

  it('wrapRootComponent gọi Sentry.wrap', () => {
    initMonitoring();
    const Root = () => null;
    wrapRootComponent(Root);
    expect(mockSdk.wrap).toHaveBeenCalledWith(Root);
  });

  it('captureException: gắn component stack và nhãn; lỗi axios chỉ gửi dấu vết vô hại kèm requestId/code', () => {
    initMonitoring();
    expect(captureException(new Error('boom'), { componentStack: '\n at Foo', tags: { screen: 'chat' } })).toBe('evt-1');
    expect(mockScope.setContext).toHaveBeenCalledWith('react', { componentStack: '\n at Foo' });
    expect(mockScope.setTag).toHaveBeenCalledWith('screen', 'chat');

    const config = { method: 'post', url: '/x?token=bi-mat', data: 'mat-khau' };
    const axiosError = new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config as never, undefined, {
      status: 500,
      statusText: 'x',
      headers: {},
      config: config as never,
      data: { requestId: 'req-5', error: { code: 'SYS_500' } },
    });
    captureException(axiosError);
    const sent = mockSdk.captureException.mock.calls.at(-1) as unknown as [Error];
    expect(sent[0].name).toBe('AxiosError');
    expect(sent[0].message).toBe('POST /x → 500');
    expect(mockScope.setTag).toHaveBeenCalledWith('requestId', 'req-5');
    expect(sent[0].message).not.toContain('bi-mat');
  });

  it('logger → breadcrumb `app` (chỉ message, không args); warn map sang mức warning', () => {
    initMonitoring();
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    logger.warn('[push] token hết hạn', { secret: 'khong-duoc-gui' });
    spy.mockRestore();
    expect(mockSdk.addBreadcrumb).toHaveBeenCalledWith({ category: 'app', level: 'warning', message: '[push] token hết hạn' });
    expect(JSON.stringify(mockSdk.addBreadcrumb.mock.calls)).not.toContain('khong-duoc-gui');
  });

  it('phiên kết thúc (mọi đường) → Sentry.setUser(null); setMonitoringUser gắn id', async () => {
    initMonitoring();
    setMonitoringUser({ id: 'u1' });
    expect(mockSdk.setUser).toHaveBeenLastCalledWith({ id: 'u1' });
    await notifySessionEnded({ userId: 'u1' });
    expect(mockSdk.setUser).toHaveBeenLastCalledWith(null);
  });

  it('resetMonitoringForTests gỡ interceptor đã gắn', () => {
    initMonitoring();
    resetMonitoringForTests();
    expect(mockResponse.eject).toHaveBeenCalledWith(7);
  });
});
