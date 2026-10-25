import { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios';

/**
 * Adapter axios giả DÙNG CHUNG giữa `auth.service.nonce.test.ts` và
 * `auth.service.biometric.test.ts` — tách ra để cả hai file test dưới trần
 * 150 dòng (`docs/rules/code-style.md`) mà không phải chép lại cùng một
 * adapter hai lần.
 *
 * Không phải file `.test.ts` (không có `it`/`describe`) nên Jest KHÔNG chạy
 * nó như một suite — chỉ file nào `import` nó mới dùng.
 */
export interface RecordedCall {
  method: string;
  url: string;
  data: unknown;
  /** `timeout` của axios cho lượt gọi này (ms) — để test chốt trần thời gian của đăng xuất. */
  timeout: number | undefined;
}

export interface FakeAuthAdapter {
  adapter: AxiosAdapter;
  calls: RecordedCall[];
  responders: Map<string, () => { status: number; data?: unknown }>;
  reset: () => void;
  countCallsTo: (url: string) => number;
}

export function createFakeAuthAdapter(): FakeAuthAdapter {
  let calls: RecordedCall[] = [];
  let responders = new Map<string, () => { status: number; data?: unknown }>();

  const adapter: AxiosAdapter = (config) => {
    const method = (config.method ?? 'get').toLowerCase();
    const url = config.url ?? '';
    calls.push({
      data: config.data ? JSON.parse(String(config.data)) : undefined,
      method,
      timeout: config.timeout,
      url,
    });

    const responder = responders.get(url);
    const { status, data } = responder?.() ?? { data: {}, status: 200 };

    const response = {
      config,
      data,
      headers: {},
      request: {},
      status,
      statusText: '',
    } as unknown as AxiosResponse;

    if (status >= 200 && status < 300) return Promise.resolve(response);
    return Promise.reject(
      new AxiosError(
        `Request failed with status code ${String(status)}`,
        'ERR_BAD_REQUEST',
        config,
        {},
        response,
      ),
    );
  };

  return {
    adapter,
    get calls() {
      return calls;
    },
    get responders() {
      return responders;
    },
    reset: () => {
      calls = [];
      responders = new Map();
    },
    countCallsTo: (url: string) => calls.filter((call) => call.url === url).length,
  };
}
