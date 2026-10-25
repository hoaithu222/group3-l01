import { apiClient } from '@/core/api/client';

import { invitesService } from '../api/invites.service';
import { joinRequestSchema } from '../schemas/join-request.schemas';

/**
 * Hợp đồng `POST /invites/:token/accept` (be.md p3-04 §13.2 mục 8): body TUỲ CHỌN `{ requestMessage ≤ 500 }`. Client cũ không body
 * vẫn chạy ⇒ không lời nhắn thì KHÔNG được gửi body (`undefined`), và lời nhắn phải là chuỗi ĐÃ cắt khoảng trắng.
 */
jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn(), post: jest.fn() } }));

const mockedPost = jest.mocked(apiClient.post);
const RESULT = { data: { data: { alreadyMember: false, defaultChannelId: null, workspaceId: 'ws-1' } } };

beforeEach(() => {
  jest.clearAllMocks();
  mockedPost.mockResolvedValue(RESULT);
});

describe('invitesService.accept', () => {
  it('có lời nhắn ⇒ gửi body { requestMessage } (đã cắt khoảng trắng), skipErrorToast giữ nguyên', async () => {
    await invitesService.accept('tok-1', { requestMessage: '  Em xin vào nhóm  ' });

    expect(mockedPost).toHaveBeenCalledWith(
      '/invites/tok-1/accept',
      { requestMessage: 'Em xin vào nhóm' },
      { skipErrorToast: true },
    );
  });

  it.each([[undefined], [''], ['   '], ['\n \n']])('lời nhắn trống (%j) ⇒ KHÔNG gửi body', async (requestMessage) => {
    await invitesService.accept('tok-1', { requestMessage });

    expect(mockedPost).toHaveBeenCalledWith('/invites/tok-1/accept', undefined, { skipErrorToast: true });
  });

  it('gọi kiểu cũ (không payload) vẫn chạy, không body', async () => {
    const result = await invitesService.accept('tok-1');

    expect(mockedPost).toHaveBeenCalledWith('/invites/tok-1/accept', undefined, { skipErrorToast: true });
    expect(result.workspaceId).toBe('ws-1');
  });
});

describe('joinRequestSchema', () => {
  it('ô trống hợp lệ (không bắt buộc), tự cắt khoảng trắng', () => {
    expect(joinRequestSchema.parse({ requestMessage: '' })).toEqual({ requestMessage: '' });
    expect(joinRequestSchema.parse({ requestMessage: '  xin chào  ' })).toEqual({ requestMessage: 'xin chào' });
  });

  it('đúng 500 ký tự qua, 501 bị chặn kèm câu tiếng Việt', () => {
    expect(joinRequestSchema.safeParse({ requestMessage: 'a'.repeat(500) }).success).toBe(true);

    const result = joinRequestSchema.safeParse({ requestMessage: 'a'.repeat(501) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('Lời nhắn tối đa 500 ký tự');
  });
});
