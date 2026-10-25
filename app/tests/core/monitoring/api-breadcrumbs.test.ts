import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

import { attachApiBreadcrumbs, describeApiError } from '@/core/monitoring/api-breadcrumbs';

/** p0-11 app.md §4: mỗi lỗi API để lại breadcrumb `{ code, requestId, url không query }` — KHÔNG body/header/token. */
function apiError(status: number, body: unknown): AxiosError {
  const config = {
    method: 'post',
    url: '/auth/login?token=bi-mat',
    headers: new AxiosHeaders({ Authorization: 'Bearer token-bi-mat' }),
    data: '{"password":"hunter2"}',
  } as InternalAxiosRequestConfig;
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, {
    status,
    statusText: 'x',
    headers: {},
    config,
    data: body,
  });
}

describe('describeApiError', () => {
  it('trích code/requestId/status/method và URL đã bỏ query', () => {
    expect(describeApiError(apiError(500, { requestId: 'req-1', error: { code: 'SYS_500' } }))).toEqual({
      code: 'SYS_500',
      requestId: 'req-1',
      status: 500,
      method: 'POST',
      url: '/auth/login',
    });
  });

  it('không lộ body/header/mật khẩu/token; lỗi không phải axios trả null', () => {
    const info = describeApiError(apiError(401, { requestId: 'r', error: { code: 'AUTH_003' } }));
    const flat = JSON.stringify(info);
    expect(flat).not.toContain('hunter2');
    expect(flat).not.toContain('token-bi-mat');
    expect(describeApiError(new Error('x'))).toBeNull();
  });

  it('body lỗi không đúng hình dạng → chỉ còn status/url, không ném', () => {
    expect(describeApiError(apiError(502, '<html>bad gateway</html>'))).toEqual({
      code: undefined,
      requestId: undefined,
      status: 502,
      method: 'POST',
      url: '/auth/login',
    });
  });
});

describe('attachApiBreadcrumbs', () => {
  it('lỗi API → thêm breadcrumb `api` rồi reject LẠI nguyên lỗi (không đổi hành vi); phản hồi thành công không để lại gì', async () => {
    const add = jest.fn();
    const client = axios.create({
      adapter: (config) =>
        config.url === '/ok'
          ? Promise.resolve({ data: 'ok', status: 200, statusText: 'OK', headers: {}, config })
          : Promise.reject(apiError(500, { requestId: 'req-9', error: { code: 'SYS_500' } })),
    });
    attachApiBreadcrumbs(client, add);

    await expect(client.get('/ok')).resolves.toMatchObject({ data: 'ok' });
    expect(add).not.toHaveBeenCalled();

    const failure = client.get('/boom');
    await expect(failure).rejects.toBeInstanceOf(AxiosError);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith({
      category: 'api',
      level: 'error',
      message: 'POST /auth/login → 500 SYS_500',
      data: expect.objectContaining({ requestId: 'req-9', code: 'SYS_500', url: '/auth/login' }),
    });
  });
});
