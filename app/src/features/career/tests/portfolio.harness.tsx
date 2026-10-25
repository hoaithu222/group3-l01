import { type QueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { type ReactElement } from 'react';

import { socket } from '@/core/socket';

import { makeClient, renderWithClient } from './fixtures';

export { makeClient, renderWithClient };

/**
 * Client thử lại NHANH: `usePortfolio` tự khai `retry` (không thử lại 404/`CFG_005`) nên GHI ĐÈ `retry: false` mặc định của `makeClient`; không rút `retryDelay` thì mỗi ca lỗi mạng chờ
 * 1 s + 2 s trước khi ra trạng thái lỗi.
 */
export function makePortfolioClient(): QueryClient {
  const client = makeClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retryDelay: 1 },
  });
  return client;
}

export const renderPortfolio = (ui: ReactElement, client: QueryClient = makePortfolioClient()) =>
  renderWithClient(ui, client);

/** Lỗi HTTP có cấu trúc BE (`{ error: { code, message, details } }`) — `message` cố ý khác câu của app để test biết app KHÔNG dùng chữ của server. */
export function apiError(
  status: number,
  code: string,
  details?: unknown,
  headers: Record<string, string> = {},
): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details, message: 'Câu của server' } },
    headers,
    status,
    statusText: '',
  });
}

/** Mất mạng: axios không có `response`. */
export const networkError = (): AxiosError => new AxiosError('Network Error', 'ERR_NETWORK');

interface MockSocket {
  __emitServer: (event: string, payload?: unknown) => void;
}

/** Socket giả dùng chung (`__mocks__/socket.io-client.ts`): `@/core/socket` xuất chính đối tượng đó; `__emitServer` giả lập server bắn sự kiện tới client. */
export const mockSocket = socket as unknown as MockSocket;
