import { apiClient } from '@/core/api/client';

import { workspacesService } from '../api';
import type { TransferOwnerCandidate } from '../api';

jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn() } }));
const mockedGet = jest.mocked(apiClient.get);

function member(overrides: Partial<TransferOwnerCandidate>): TransferOwnerCandidate {
  return {
    userId: 'u-x',
    name: 'Người X',
    displayName: null,
    avatarUrl: null,
    role: 'MEMBER',
    isMe: false,
    ...overrides,
  };
}

describe('workspacesService.listTransferCandidates', () => {
  beforeEach(() => mockedGet.mockReset());

  it('gọi ĐÚNG endpoint thành viên ACTIVE, sắp theo tên, một trang 100 (trần BE)', async () => {
    mockedGet.mockResolvedValue({ data: { data: [] } });

    await workspacesService.listTransferCandidates('ws-1', 'an');

    expect(mockedGet).toHaveBeenCalledWith('/workspaces/ws-1/members', {
      params: { status: 'ACTIVE', q: 'an', sort: 'name', page: 1, limit: 100 },
    });
  });

  it('q rỗng ⇒ bỏ hẳn tham số (BE `q` là chuỗi tuỳ chọn, chuỗi rỗng là dữ liệu thừa)', async () => {
    mockedGet.mockResolvedValue({ data: { data: [] } });

    await workspacesService.listTransferCandidates('ws-1', '');

    expect(mockedGet.mock.calls[0]?.[1]).toEqual({
      params: expect.objectContaining({ q: undefined }),
    });
  });

  it('loại chính mình và OWNER — BE trả WS_003 cho cả hai nên không bày ra lựa chọn chắc chắn lỗi', async () => {
    mockedGet.mockResolvedValue({
      data: {
        data: [
          member({ userId: 'me', isMe: true, role: 'OWNER' }),
          member({ userId: 'owner', role: 'OWNER' }),
          member({ userId: 'admin', role: 'ADMIN' }),
          member({ userId: 'member', role: 'MEMBER' }),
        ],
      },
    });

    const result = await workspacesService.listTransferCandidates('ws-1');

    expect(result.map((item) => item.userId)).toEqual(['admin', 'member']);
  });
});
