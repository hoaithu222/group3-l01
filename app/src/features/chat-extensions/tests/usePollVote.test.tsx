import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { chatKeys, type MessagesData } from '@/features/chat';
import { showToast } from '@/shared/utils/toast.utils';

import { pollService } from '../api/poll.service';
import { usePollVote } from '../hooks/usePollVote';
import { findPoll } from '../utils/poll-cache';
import { apiError, flushQuery, makePoll, makeQueryClient, SCOPE, seedPollCache } from './fixtures';

/**
 * `usePollVote` (app.md §8): lạc quan cập nhật đếm ở cache TIN NHẮN; lỗi `POLL_004` → hoàn lại + đánh dấu ĐÃ ĐÓNG + toast; thành công ghi bản server (có `version`).
 * Service được mock — retry 503 có test riêng ở `services.test.ts`.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../api/poll.service', () => ({ pollService: { unvote: jest.fn(), vote: jest.fn() } }));

const service = jest.mocked(pollService);
const toast = jest.mocked(showToast);

let queryClient: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const poll = () => findPoll(queryClient.getQueryData<MessagesData>(chatKeys.messages(SCOPE)), 'msg-poll');
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
};

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = makeQueryClient();
  seedPollCache(queryClient);
});

describe('usePollVote', () => {
  // React Query báo observer qua `setTimeout(0)` sau khi mutation xong — chờ một nhịp TRONG `act` để không rơi ngoài `act`.
  afterEach(() => flushQuery());

  it('chọn A: đếm/% đổi NGAY (trước khi server trả), xong ghi bản server có version mới', async () => {
    const server = deferred<ReturnType<typeof makePoll>>();
    service.vote.mockReturnValue(server.promise);
    const { result } = await renderHook(() => usePollVote(SCOPE, { id: 'p-1', messageId: 'msg-poll' }), { wrapper });

    await act(async () => result.current.mutate({ nextIds: ['a'] }));

    expect(poll()).toMatchObject({ myOptionIds: ['a'], version: 3, voterCount: 3 });
    expect(poll()?.options[0]).toMatchObject({ percent: 66.7, voteCount: 2 });
    expect(service.vote).toHaveBeenCalledWith('p-1', ['a']);

    await act(async () => server.resolve(makePoll({ myOptionIds: ['a'], version: 4, voterCount: 3 })));
    await waitFor(() => expect(poll()?.version).toBe(4));
  });

  it('bỏ phiếu (rỗng) gọi DELETE /vote, không phải PUT', async () => {
    service.unvote.mockResolvedValue(makePoll({ version: 4 }));
    seedPollCache(queryClient, makePoll({ myOptionIds: ['a'] }));
    const { result } = await renderHook(() => usePollVote(SCOPE, { id: 'p-1', messageId: 'msg-poll' }), { wrapper });

    await act(async () => result.current.mutate({ nextIds: [] }));

    expect(service.unvote).toHaveBeenCalledWith('p-1');
    expect(service.vote).not.toHaveBeenCalled();
  });

  it('POLL_004: HOÀN LẠI lựa chọn, đánh dấu khảo sát ĐÃ ĐÓNG, toast "đã kết thúc"', async () => {
    service.vote.mockRejectedValue(apiError(409, 'POLL_004'));
    const { result } = await renderHook(() => usePollVote(SCOPE, { id: 'p-1', messageId: 'msg-poll' }), { wrapper });

    await act(async () => result.current.mutate({ nextIds: ['a'] }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', 'Khảo sát đã kết thúc, không thể bầu thêm'));
    expect(poll()).toMatchObject({ canClose: false, closeReason: 'EXPIRED', myOptionIds: [], status: 'CLOSED', voterCount: 2 });
    expect(poll()?.options.map((o) => o.voteCount)).toEqual([1, 1]);
  });

  it('lỗi mạng: hoàn lại số đếm cũ + toast câu tiếng Việt (không lộ chi tiết kỹ thuật)', async () => {
    service.vote.mockRejectedValue(apiError(503, 'SYS_503'));
    const { result } = await renderHook(() => usePollVote(SCOPE, { id: 'p-1', messageId: 'msg-poll' }), { wrapper });

    await act(async () => result.current.mutate({ nextIds: ['b'] }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', 'Nhiều người đang thao tác cùng lúc, hãy thử lại sau ít giây'));
    expect(poll()).toMatchObject({ myOptionIds: [], voterCount: 2 });
  });

  it('server trả bản CŨ hơn poll:updated đã tới → không lùi số đếm, chỉ lấy myOptionIds', async () => {
    const server = deferred<ReturnType<typeof makePoll>>();
    service.vote.mockReturnValue(server.promise);
    const { result } = await renderHook(() => usePollVote(SCOPE, { id: 'p-1', messageId: 'msg-poll' }), { wrapper });
    await act(async () => result.current.mutate({ nextIds: ['a'] }));
    // poll:updated version 6 (của người khác) tới trước response version 4.
    seedPollCache(queryClient, makePoll({ myOptionIds: ['a'], version: 6, voterCount: 9 }));

    await act(async () => server.resolve(makePoll({ myOptionIds: ['a'], version: 4, voterCount: 3 })));

    await waitFor(() => expect(poll()).toMatchObject({ myOptionIds: ['a'], version: 6, voterCount: 9 }));
  });
});
