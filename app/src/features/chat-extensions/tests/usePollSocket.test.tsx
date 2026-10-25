import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { chatKeys, type MessagesData } from '@/features/chat';

import { pollService } from '../api/poll.service';
import { usePollSocket } from '../hooks/usePollSocket';
import { findPoll } from '../utils/poll-cache';
import { makePoll, makeQueryClient, SCOPE, seedPollCache } from './fixtures';

/**
 * `usePollSocket` (app.md §8): `poll:updated` vá cache tin nhắn của ĐÚNG phòng, bỏ qua `version` cũ, giữ `myOptionIds`; nối lại phòng → tải lại khảo sát ĐANG MỞ.
 * Socket được thay bằng bộ giữ handler để bắn sự kiện thủ công.
 */
const mockHandlers = new Map<string, (payload: unknown) => void>();
const mockResync: { current: (() => void) | null } = { current: null };
jest.mock('@/core/socket', () => ({
  onRoomResync: (fn: () => void) => {
    mockResync.current = fn;
    return () => {
      mockResync.current = null;
    };
  },
  useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));
jest.mock('../api/poll.service', () => ({ pollService: { get: jest.fn() } }));

const service = jest.mocked(pollService);
let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const poll = () => findPoll(queryClient.getQueryData<MessagesData>(chatKeys.messages(SCOPE)), 'msg-poll');
const fire = (payload: Record<string, unknown>) =>
  act(async () => mockHandlers.get('poll:updated')?.({ messageId: 'msg-poll', pollId: 'p-1', scopeId: 'ch-1', scopeType: 'CHANNEL', ...payload }));

const EVENT = {
  closeReason: null,
  options: [{ id: 'a', voteCount: 5 }, { id: 'b', voteCount: 0 }],
  status: 'OPEN',
  version: 4,
  voterCount: 5,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockHandlers.clear();
  mockResync.current = null;
  queryClient = makeQueryClient();
  seedPollCache(queryClient, makePoll({ myOptionIds: ['b'] }));
});

describe('usePollSocket', () => {
  it('poll:updated mới hơn → vá số phiếu/%; myOptionIds cục bộ được GIỮ (payload không có)', async () => {
    await renderHook(() => usePollSocket(SCOPE), { wrapper });

    await fire(EVENT);

    expect(poll()).toMatchObject({ myOptionIds: ['b'], version: 4, voterCount: 5 });
    expect(poll()?.options[0]).toMatchObject({ percent: 100, voteCount: 5 });
  });

  it('version cũ bị bỏ qua; sự kiện của phòng khác bị bỏ qua', async () => {
    await renderHook(() => usePollSocket(SCOPE), { wrapper });

    await fire({ ...EVENT, version: 2 });
    await fire({ ...EVENT, scopeId: 'ch-khac' });

    expect(poll()).toMatchObject({ version: 3, voterCount: 2 });
  });

  it('đóng khảo sát: status CLOSED + lý do', async () => {
    await renderHook(() => usePollSocket(SCOPE), { wrapper });

    await fire({ ...EVENT, closeReason: 'EXPIRED', status: 'CLOSED' });

    expect(poll()).toMatchObject({ closeReason: 'EXPIRED', status: 'CLOSED' });
  });

  it('nối lại phòng → tải lại khảo sát đang MỞ và ghi bản server (không lùi version)', async () => {
    service.get.mockResolvedValue(makePoll({ myOptionIds: ['b'], version: 8, voterCount: 12 }));
    await renderHook(() => usePollSocket(SCOPE), { wrapper });

    await act(async () => mockResync.current?.());

    expect(service.get).toHaveBeenCalledWith('p-1');
    expect(poll()).toMatchObject({ version: 8, voterCount: 12 });
  });

  it('nối lại phòng mà tải lỗi → nuốt lỗi (không unhandled rejection), cache giữ nguyên', async () => {
    service.get.mockRejectedValue(new Error('mất mạng'));
    await renderHook(() => usePollSocket(SCOPE), { wrapper });

    await act(async () => mockResync.current?.());

    expect(poll()).toMatchObject({ version: 3 });
  });

  it('khảo sát ĐÃ ĐÓNG không bị tải lại khi nối lại phòng (số phiếu đã chốt)', async () => {
    seedPollCache(queryClient, makePoll({ status: 'CLOSED' }));
    await renderHook(() => usePollSocket(SCOPE), { wrapper });

    await act(async () => mockResync.current?.());

    expect(service.get).not.toHaveBeenCalled();
  });
});
