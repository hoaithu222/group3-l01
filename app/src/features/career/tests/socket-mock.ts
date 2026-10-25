import { act } from '@testing-library/react-native';

/**
 * Bản giả `@/core/socket` cho test của Recruiter board: `jest.mock('@/core/socket', () => jest.requireActual('./socket-mock'))`. `useSocketEvent` chỉ giữ handler
 * MỚI NHẤT theo tên sự kiện để test gọi tay bằng `emitSocket` (không có socket thật). KHÔNG phải test (`testMatch` chỉ nhận `*.test.ts(x)`).
 * `useConnectionState` đọc biến module — đổi bằng `setConnection` rồi `rerender` để màn đọc lại.
 */
const handlers = new Map<string, (payload: unknown) => void>();
let connection: 'connected' | 'connecting' | 'offline' | 'unauthorized' = 'connected';

export const SocketEvent = {
  COMPANY_UPDATED: 'company:updated',
  OFFER_MESSAGE_CREATED: 'offer:message-created',
  OFFER_UPDATED: 'offer:updated',
} as const;

export function useSocketEvent(event: string, handler: (payload: unknown) => void): void {
  handlers.set(event, handler);
}

export const useConnectionState = () => connection;

export async function emitSocket(event: string, payload: unknown): Promise<void> {
  await act(async () => {
    handlers.get(event)?.(payload);
  });
}

export function setConnection(next: typeof connection): void {
  connection = next;
}

export function resetSocketMock(): void {
  handlers.clear();
  connection = 'connected';
}
