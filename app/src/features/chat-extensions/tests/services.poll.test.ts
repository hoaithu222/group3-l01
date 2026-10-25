import { apiClient } from '@/core/api/client';

import { pollService } from '../api/poll.service';
import { apiError } from './fixtures';

/**
 * Tầng service (api-data: `service.ts` chuẩn hoá hợp đồng BE). Mock `apiClient` — kiểm ĐÚNG đường dẫn, thân request, cờ `skipErrorToast` (feature tự hiện lỗi) và cách bóc phản hồi:
 * `unwrapData` cho object đơn, `response.data.data + .meta` cho danh sách cursor (không bóc — sẽ vứt `meta`).
 */
jest.mock('@/core/api/client', () => ({
  apiClient: { delete: jest.fn(), get: jest.fn(), patch: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

const api = jest.mocked(apiClient);
const ok = (data: unknown) => ({ data: { data, success: true } });
const SCOPE = { scopeId: 'ch-1', scopeType: 'CHANNEL' } as const;

beforeEach(() => jest.clearAllMocks());

describe('pollService', () => {
  it('create: POST /scopes/CHANNEL/ch-1/polls, không kèm closesAt/threadId khi không có; skipErrorToast', async () => {
    api.post.mockResolvedValue(ok({ id: 'm-1' }));

    await pollService.create(SCOPE, { anonymous: false, clientMessageId: 'c1', multi: true, options: ['A', 'B'], question: 'Q' });

    expect(api.post).toHaveBeenCalledWith(
      '/scopes/CHANNEL/ch-1/polls',
      { anonymous: false, clientMessageId: 'c1', multi: true, options: ['A', 'B'], question: 'Q' },
      { skipErrorToast: true },
    );
  });

  it('create trong LUỒNG của kênh: gửi threadId (id tin gốc); hội thoại thì KHÔNG (BE chỉ cho kênh)', async () => {
    api.post.mockResolvedValue(ok({ id: 'm-1' }));
    const input = { anonymous: false, clientMessageId: 'c1', closesAt: '2026-10-01T00:00:00.000Z', multi: false, options: ['A', 'B'], question: 'Q' };

    await pollService.create({ ...SCOPE, threadId: 'root-1' }, input);
    await pollService.create({ scopeId: 'cv-1', scopeType: 'CONVERSATION', threadId: 'root-1' }, input);

    expect(api.post.mock.calls[0]?.[1]).toMatchObject({ closesAt: input.closesAt, threadId: 'root-1' });
    expect(api.post.mock.calls[1]?.[1]).not.toHaveProperty('threadId');
  });

  it('vote: PUT { optionIds }; bận 503 → thử lại (jitter) rồi thành công', async () => {
    jest.useFakeTimers();
    api.put.mockRejectedValueOnce(apiError(503, 'SYS_503')).mockResolvedValueOnce(ok({ id: 'p-1', version: 5 }));

    const pending = pollService.vote('p-1', ['a']);
    await jest.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toMatchObject({ version: 5 });
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(api.put).toHaveBeenLastCalledWith('/polls/p-1/vote', { optionIds: ['a'] }, { skipErrorToast: true });
    jest.useRealTimers();
  });

  it('unvote/close/get gọi đúng đường dẫn', async () => {
    api.delete.mockResolvedValue(ok({ id: 'p-1' }));
    api.post.mockResolvedValue(ok({ id: 'p-1' }));
    api.get.mockResolvedValue(ok({ id: 'p-1' }));

    await pollService.unvote('p-1');
    await pollService.close('p-1');
    await pollService.get('p-1');

    expect(api.delete).toHaveBeenCalledWith('/polls/p-1/vote', { skipErrorToast: true });
    expect(api.post).toHaveBeenCalledWith('/polls/p-1/close', undefined, { skipErrorToast: true });
    expect(api.get).toHaveBeenCalledWith('/polls/p-1', { skipErrorToast: true });
  });

  it('voters: đọc data + meta TRỰC TIẾP từ thân (không unwrapData)', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 'u1', name: 'An' }], meta: { hasMore: true, limit: 50, nextCursor: 'c2' } } });

    const page = await pollService.voters('p-1', { cursor: 'c1', optionId: 'a' });

    expect(page.meta.nextCursor).toBe('c2');
    expect(page.data[0]).toMatchObject({ name: 'An' });
    expect(api.get).toHaveBeenCalledWith('/polls/p-1/voters', { params: { cursor: 'c1', optionId: 'a' }, skipErrorToast: true });
  });
});
