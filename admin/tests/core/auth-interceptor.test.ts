/**
 * Interceptor 401 + `session.ts` — bài kiểm ĐI ĐÚNG ĐƯỜNG THẬT (axios + interceptor + refresh
 * bằng `fetch` + auth store + React Query cache), chỉ mock ở tầng mạng bằng MSW.
 *
 * Phủ các bất biến của luồng phiên:
 *  - N request cùng ăn 401 ⇒ đúng MỘT `/auth/refresh`, mọi request được phát lại bằng token mới;
 *  - `unavailable` (BE 5xx / mất mạng) ≠ `unauthenticated`: chỉ phiên chết thật mới bị dọn;
 *  - không vòng lặp vô hạn (`_retry`);
 *  - phiên chết KHÔNG tải lại trang, dọn cả React Query cache, ghi lại VÌ SAO (`endReason`);
 *  - refresh cập nhật hồ sơ; refresh trả tài khoản KHÁC thì cắt phiên; refresh muộn không hồi
 *    sinh phiên đã đăng xuất;
 *  - Web Locks bọc lượt refresh (xếp hàng liên tab).
 */
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AxiosError } from 'axios';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/app/store';
import { authService } from '@/core/api/auth';
import { apiClient } from '@/core/api/client';
import { purgeAuthSession, refreshSession } from '@/core/api/session';
import { queryClient } from '@/core/config';

const USER = {
  id: 'u1',
  email: 'an@congty.vn',
  name: 'Nguyễn Văn An',
  roles: ['manager'],
  permissions: ['user:view'],
};

/** JWT giả chỉ có payload `{ exp }` — đủ cho `isAccessTokenFresh`. */
function jwtExpiringAt(expSeconds: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ exp: expSeconds })}.sig`;
}

const errorBody = (code: string, message = 'lỗi') => ({
  success: false,
  error: { code, message },
  requestId: 'r',
});

// ── Trạng thái của mock ──────────────────────────────────────────────────────
let refreshCalls = 0;
let refreshResponder: () => Response | Promise<Response>;
const refreshRequests: Array<{ credentials: string; auth: string | null; platform: string | null }> = [];
const seenTokens: string[] = [];

const okRefresh = (token = 'token-moi', user: object = USER) => () =>
  HttpResponse.json({ success: true, data: { accessToken: token, user } });

const server = setupServer(
  http.get('*/things/:id', ({ request }) => {
    const auth = request.headers.get('authorization') ?? '';
    seenTokens.push(auth);
    return auth === 'Bearer token-cu'
      ? HttpResponse.json(errorBody('AUTH_002'), { status: 401 })
      : HttpResponse.json({ success: true, data: { ok: true } });
  }),
  http.post('*/auth/refresh', async ({ request }) => {
    refreshCalls += 1;
    refreshRequests.push({
      credentials: request.credentials,
      auth: request.headers.get('authorization'),
      platform: request.headers.get('x-client-platform'),
    });
    return refreshResponder();
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

beforeEach(() => {
  refreshCalls = 0;
  refreshRequests.length = 0;
  seenTokens.length = 0;
  refreshResponder = okRefresh();
  queryClient.clear();
  useAuthStore.getState().clearAuth();
  useAuthStore.getState().setAuth({ user: USER, token: 'token-cu' });
});

const failureOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe('single-flight + hàng đợi', () => {
  it('5 request cùng ăn 401 ⇒ đúng MỘT lần /auth/refresh, cả 5 phát lại bằng token mới', async () => {
    refreshResponder = async () => {
      await delay(30); // đủ lâu để cả 5 request đều đã ăn 401 và xếp hàng
      return okRefresh('token-moi')();
    };

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => apiClient.get(`/things/${n}`)),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(useAuthStore.getState().token).toBe('token-moi');
    // 5 lượt đầu bằng token cũ (401) + 5 lượt phát lại bằng token mới.
    expect(seenTokens.filter((t) => t === 'Bearer token-moi')).toHaveLength(5);
  });

  it('⛔ 401 dai dẳng (phát lại vẫn 401) ⇒ chỉ MỘT lần refresh, KHÔNG lặp vô hạn', async () => {
    // Token nào cũng bị từ chối — như request sai audience/scope.
    server.use(
      http.get('*/things/:id', () =>
        HttpResponse.json(errorBody('AUTH_002'), { status: 401 }),
      ),
    );

    const failure = await failureOf(apiClient.get('/things/1', { skipErrorToast: true } as never));

    expect(failure).toBeInstanceOf(AxiosError);
    expect((failure as AxiosError).response?.status).toBe(401);
    expect(refreshCalls).toBe(1);
  });

  it('refresh cập nhật CẢ hồ sơ: quyền mới hiện ngay, không cần tải lại trang', async () => {
    refreshResponder = okRefresh('token-moi', { ...USER, permissions: ['user:view', 'audit-log:view'] });

    await apiClient.get('/things/1');

    expect(useAuthStore.getState().user?.permissions).toContain('audit-log:view');
    expect(useAuthStore.getState().hasPermission('audit-log', 'view')).toBe(true);
  });
});

describe('unavailable ≠ unauthenticated', () => {
  it.each([500, 502, 503, 429])(
    'refresh trả HTTP %i ⇒ GIỮ NGUYÊN phiên, request bị từ chối như lỗi bình thường',
    async (status) => {
      refreshResponder = () => new HttpResponse(null, { status });

      const failure = await failureOf(apiClient.get('/things/1', { skipErrorToast: true } as never));

      expect(failure).toBeInstanceOf(AxiosError);
      expect((failure as AxiosError & { sessionUnavailable?: boolean }).sessionUnavailable).toBe(true);
      const state = useAuthStore.getState();
      expect(state.status).toBe('authenticated');
      expect(state.token).toBe('token-cu');
      expect(state.user?.id).toBe('u1');
      expect(state.endReason).toBeNull();
    },
  );

  it('mất mạng lúc refresh ⇒ GIỮ NGUYÊN phiên', async () => {
    refreshResponder = () => HttpResponse.error();

    const failure = await failureOf(apiClient.get('/things/1', { skipErrorToast: true } as never));

    expect(failure).toBeInstanceOf(AxiosError);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });
});

describe('phiên chết thật (unauthenticated)', () => {
  it('dọn store + React Query cache, ghi `endReason`, và KHÔNG tải lại trang', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queryClient.setQueryData(['user', 'list'], [{ id: 'du-lieu-cua-nguoi-truoc' }]);
    refreshResponder = () =>
      HttpResponse.json(errorBody('AUTH_009'), { status: 401 });

    const failure = await failureOf(apiClient.get('/things/1', { skipErrorToast: true } as never));

    expect(failure).toBeInstanceOf(AxiosError);
    const state = useAuthStore.getState();
    expect(state.status).toBe('anonymous');
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.endReason).toBe('expired');
    // Người thứ hai đăng nhập trên CÙNG tab không được thấy dữ liệu của người trước.
    expect(queryClient.getQueryData(['user', 'list'])).toBeUndefined();
    // jsdom in "Not implemented: navigation" nếu mã gọi `window.location.assign` — điều hướng
    // cứng làm mất `from` và lời nhắn; đá về đăng nhập là việc của `AuthGuard`.
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Not implemented: navigation') }),
    );
  });

  it('BE báo `AUTH_010` (phát hiện dùng lại refresh token) ⇒ lý do `revoked`', async () => {
    refreshResponder = () => HttpResponse.json(errorBody('AUTH_010'), { status: 401 });
    await failureOf(apiClient.get('/things/1', { skipErrorToast: true } as never));
    expect(useAuthStore.getState().endReason).toBe('revoked');
  });

  it.each(['AUTH_011', 'AUTH_012'])(
    'BE trả 403 %s cho refresh (tài khoản khoá / chờ xoá) ⇒ lý do `locked`',
    async (code) => {
      refreshResponder = () => HttpResponse.json(errorBody(code), { status: 403 });
      await failureOf(apiClient.get('/things/1', { skipErrorToast: true } as never));
      expect(useAuthStore.getState().endReason).toBe('locked');
    },
  );

  it('⛔ 403 KHÔNG phải khoá tài khoản (BE từ chối `Origin`, `requireTrustedOrigin`) ⇒ `expired`, không đổ oan "tài khoản bị khoá"', async () => {
    refreshResponder = () =>
      HttpResponse.json(errorBody('AUTH_005', 'Nguồn (Origin) của yêu cầu không được phép'), {
        status: 403,
      });

    await failureOf(apiClient.get('/things/1', { skipErrorToast: true } as never));

    // Phiên vẫn bị dọn (BE từ chối làm mới thì không còn cách nào giữ phiên), nhưng lý do là "hết hạn".
    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', endReason: 'expired' });
  });

  it('refresh trả hồ sơ của TÀI KHOẢN KHÁC (tab khác đăng nhập người khác) ⇒ cắt phiên, không trộn dữ liệu', async () => {
    refreshResponder = okRefresh('token-cua-nguoi-khac', { ...USER, id: 'u2', email: 'binh@congty.vn' });

    const outcome = await refreshSession();

    expect(outcome.status).toBe('unauthenticated');
    const state = useAuthStore.getState();
    expect(state.status).toBe('anonymous');
    expect(state.token).toBeNull();
    expect(state.endReason).toBe('revoked');
  });

  it('⛔ refresh về MUỘN sau khi người dùng đã đăng xuất ⇒ KHÔNG hồi sinh phiên', async () => {
    refreshResponder = async () => {
      await delay(30);
      return okRefresh('token-hoi-sinh')();
    };

    const pending = refreshSession();
    purgeAuthSession(null); // bấm đăng xuất trong lúc lượt refresh còn bay
    const outcome = await pending;

    expect(outcome.status).toBe('unauthenticated');
    const state = useAuthStore.getState();
    expect(state.status).toBe('anonymous');
    expect(state.token).toBeNull();
  });

  it('⛔ request bay trễ báo "phiên chết" SAU khi đã đăng xuất ⇒ KHÔNG viết đè: trang đăng nhập không được hiện "phiên hết hạn"', () => {
    purgeAuthSession(null); // người dùng bấm đăng xuất
    purgeAuthSession('expired'); // một request còn bay ăn 401 → refresh 401 → dọn muộn
    purgeAuthSession('locked');

    expect(useAuthStore.getState()).toMatchObject({ status: 'anonymous', endReason: null });
  });

  it('đăng xuất chủ động THẮNG lý do đã ghi: phiên đã chết sẵn rồi người dùng vẫn bấm đăng xuất', () => {
    purgeAuthSession('expired');
    expect(useAuthStore.getState().endReason).toBe('expired');

    purgeAuthSession(null);
    expect(useAuthStore.getState().endReason).toBeNull();
  });

  it('lượt dọn đầu tiên giữ lý do của nó — lượt dọn muộn với lý do khác không đổi được', () => {
    purgeAuthSession('revoked');
    purgeAuthSession('expired');

    expect(useAuthStore.getState().endReason).toBe('revoked');
  });
});

describe('403 AUTH_011 / AUTH_012 ở request có phiên', () => {
  it('tài khoản vừa bị khoá giữa chừng ⇒ dọn phiên với lý do `locked`, không toast', async () => {
    server.use(
      http.get('*/things/:id', () => HttpResponse.json(errorBody('AUTH_011'), { status: 403 })),
    );
    useAuthStore.getState().setAuth({ token: 'token-con-han' });

    const failure = await failureOf(apiClient.get('/things/1'));

    expect(failure).toBeInstanceOf(AxiosError);
    expect(refreshCalls).toBe(0); // refresh vô ích: máy chủ đã phán quyết
    const state = useAuthStore.getState();
    expect(state.status).toBe('anonymous');
    expect(state.endReason).toBe('locked');
  });

  it('`login` trả 403 AUTH_011 cho tài khoản khoá ⇒ KHÔNG đụng tới phiên (chưa có phiên nào để dọn)', async () => {
    useAuthStore.getState().clearAuth();
    server.use(
      http.get('*/auth/nonce', () =>
        HttpResponse.json({ success: true, data: { nonce: 'n', expiresIn: 120 } }),
      ),
      http.post('*/auth/login', () => HttpResponse.json(errorBody('AUTH_011'), { status: 403 })),
    );

    const failure = await failureOf(authService.login({ email: 'a@b.vn', password: 'x' }));

    expect(failure).toBeInstanceOf(AxiosError);
    expect(useAuthStore.getState().endReason).toBeNull();
  });
});

describe('đổi mật khẩu: 401 là "sai mật khẩu hiện tại", không phải "token hết hạn"', () => {
  it('token còn hạn + sai mật khẩu hiện tại ⇒ 401 trả về form, KHÔNG refresh', async () => {
    useAuthStore.getState().setAuth({ token: jwtExpiringAt(Math.floor(Date.now() / 1000) + 3600) });
    server.use(
      http.patch('*/auth/change-password', () =>
        HttpResponse.json(errorBody('AUTH_002', 'Mật khẩu hiện tại không đúng'), { status: 401 }),
      ),
    );

    const failure = await failureOf(
      authService.changePassword({ currentPassword: 'sai', newPassword: 'Moi-12345' }),
    );

    expect((failure as AxiosError).response?.status).toBe(401);
    expect(refreshCalls).toBe(0);
  });

  it('token ĐÃ hết hạn ⇒ làm mới CHỦ ĐỘNG trước khi gửi, để hết hạn không bị báo nhầm là sai mật khẩu', async () => {
    useAuthStore.getState().setAuth({ token: jwtExpiringAt(Math.floor(Date.now() / 1000) - 60) });
    refreshResponder = okRefresh('token-moi');
    let patchAuth = '';
    server.use(
      http.patch('*/auth/change-password', ({ request }) => {
        patchAuth = request.headers.get('authorization') ?? '';
        return HttpResponse.json({ success: true, data: null });
      }),
    );

    await authService.changePassword({ currentPassword: 'cu', newPassword: 'Moi-12345' });

    expect(refreshCalls).toBe(1);
    expect(patchAuth).toBe('Bearer token-moi');
  });
});

describe('hợp đồng cookie + token với BE (web)', () => {
  it('⛔ refresh token đi bằng COOKIE HttpOnly: refresh gửi `credentials: include`, không mang Bearer, KHÔNG khai X-Client-Platform', async () => {
    await refreshSession();

    expect(refreshRequests).toEqual([{ credentials: 'include', auth: null, platform: null }]);
  });

  it('axios gửi cookie (withCredentials) ở mọi lời gọi', () => {
    expect(apiClient.defaults.withCredentials).toBe(true);
  });

  it('⛔ access token chỉ sống trong BỘ NHỚ: sau refresh/login, không có ở localStorage lẫn sessionStorage', async () => {
    refreshResponder = okRefresh('token-bi-mat-moi');

    await refreshSession();

    expect(useAuthStore.getState().token).toBe('token-bi-mat-moi');
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('token-bi-mat-moi');
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain('token-bi-mat-moi');
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain('token-cu');
  });
});

describe('Web Locks — xếp hàng lượt refresh giữa các tab', () => {
  const installLocks = (request: unknown) =>
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  const removeLocks = () => Reflect.deleteProperty(navigator, 'locks');

  it('refresh chạy BÊN TRONG khoá, và hai lời gọi đồng thời chỉ xin khoá MỘT lần (single-flight)', async () => {
    const events: string[] = [];
    const request = vi.fn(async (_name: string, _options: LockOptions, task: () => Promise<unknown>) => {
      events.push('lock:acquired');
      const result = await task();
      events.push('lock:released');
      return result;
    });
    installLocks(request);
    refreshResponder = () => {
      events.push('fetch');
      return okRefresh('token-moi')();
    };

    try {
      const [a, b] = await Promise.all([refreshSession(), refreshSession()]);

      expect(a).toEqual({ status: 'ok', token: 'token-moi' });
      expect(b).toBe(a);
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0]).toBe('super-app-admin:auth-refresh');
      expect(events).toEqual(['lock:acquired', 'fetch', 'lock:released']);
    } finally {
      removeLocks();
    }
  });

  it('⛔ chờ khoá CÓ HẠN (signal): tab bị đóng băng giữa lúc giữ khoá không được treo các tab còn lại', async () => {
    const request = vi.fn(
      async (_name: string, _options: LockOptions, task: () => Promise<unknown>) => task(),
    );
    installLocks(request);

    try {
      await refreshSession();

      const options = request.mock.calls[0][1];
      expect(options.signal).toBeInstanceOf(AbortSignal);
    } finally {
      removeLocks();
    }
  });

  it('không xin được khoá (hết hạn chờ / SecurityError) ⇒ vẫn refresh MỘT lần, không mất phiên, không treo', async () => {
    const request = vi.fn(async () => {
      throw new DOMException('Không chờ được khoá', 'AbortError');
    });
    installLocks(request);

    try {
      const outcome = await refreshSession();

      expect(outcome).toEqual({ status: 'ok', token: 'token-moi' });
      expect(refreshCalls).toBe(1);
    } finally {
      removeLocks();
    }
  });
});
