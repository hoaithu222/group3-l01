import { act, renderHook } from '@testing-library/react-native';

import { apiClient } from '@/core/api/client';

import { integrationsService } from '../api/integrations.service';
import type { IntegrationView } from '../api/integrations.types';
import { useIntegrationDraft } from '../hooks/useIntegrationDraft';
import { useUpdateIntegration } from '../queries/integrations.queries';
import { targetLabel } from '../utils/integration-labels';

/**
 * Nơi nhận tin là kênh HOẶC nhóm chat (p5-03 P1). Khoá ba chỗ `tsc` không thấy: nhãn theo loại, danh sách nhóm chat gọi đúng endpoint và
 * bỏ nhóm không gửi được, và lúc lưu `targetScopeType` đi CÙNG `targetScopeId` (BE 400 nếu thiếu một trong hai).
 */
jest.mock('@/core/api/client', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../queries/integrations.queries', () => ({ useUpdateIntegration: jest.fn() }));

describe('targetLabel', () => {
  it('kênh: "#tên"; kênh riêng tư không đọc được: "Kênh riêng tư"', () => {
    expect(targetLabel({ name: 'chung', scopeType: 'CHANNEL' })).toBe('#chung');
    expect(targetLabel({ name: null, scopeType: 'CHANNEL' })).toBe('Kênh riêng tư');
  });

  it('nhóm chat: "Nhóm chat · tên"; không đọc được: "Nhóm chat riêng tư" (không lộ tên)', () => {
    expect(targetLabel({ name: 'Đồ án', scopeType: 'CONVERSATION' })).toBe('Nhóm chat · Đồ án');
    expect(targetLabel({ name: null, scopeType: 'CONVERSATION' })).toBe('Nhóm chat riêng tư');
  });
});

describe('integrationsService.groupChats', () => {
  it('gọi /conversations lọc nhóm chat của ĐÚNG nhóm làm việc, chỉ giữ nhóm ACTIVE và gửi được', async () => {
    jest.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [
          { id: 'a', readOnly: false, status: 'ACTIVE', title: 'Đồ án' },
          { id: 'b', readOnly: true, status: 'ACTIVE', title: 'Chỉ đọc' },
          { id: 'c', readOnly: false, status: 'DISSOLVED', title: 'Đã giải tán' },
        ],
        meta: { hasMore: false, limit: 100, nextCursor: null },
      },
    } as never);

    const result = await integrationsService.groupChats('ws-1');

    expect(apiClient.get).toHaveBeenCalledWith('/conversations', {
      params: { filter: 'group', limit: 100, workspaceId: 'ws-1' },
      skipErrorToast: true,
    });
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('thân phản hồi lạ (không phải mảng) → danh sách rỗng, không ném', async () => {
    jest.mocked(apiClient.get).mockResolvedValue({ data: { data: null } } as never);

    await expect(integrationsService.groupChats('ws-1')).resolves.toEqual([]);
  });
});

describe('useIntegrationDraft — gửi loại nơi nhận', () => {
  const view = {
    config: { events: ['push'], repos: [] },
    id: 'int-1',
    version: 4,
  } as unknown as IntegrationView;

  it('chọn nhóm chat → PATCH kèm targetScopeType CONVERSATION + targetScopeId + expectedVersion', async () => {
    const mutate = jest.fn();
    jest
      .mocked(useUpdateIntegration)
      .mockReturnValue({ isPending: false, mutate } as unknown as ReturnType<
        typeof useUpdateIntegration
      >);
    const { result } = await renderHook(() => useIntegrationDraft(view, 'ws-1'));

    await act(async () => {
      result.current.setTarget({
        id: 'cv-1',
        name: 'Đồ án',
        private: true,
        scopeType: 'CONVERSATION',
      });
    });
    await act(async () => {
      result.current.save();
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      expectedVersion: 4,
      targetScopeId: 'cv-1',
      targetScopeType: 'CONVERSATION',
    });
  });

  it('chọn kênh → targetScopeType CHANNEL (giữ hành vi cũ)', async () => {
    const mutate = jest.fn();
    jest
      .mocked(useUpdateIntegration)
      .mockReturnValue({ isPending: false, mutate } as unknown as ReturnType<
        typeof useUpdateIntegration
      >);
    const { result } = await renderHook(() => useIntegrationDraft(view, 'ws-1'));

    await act(async () => {
      result.current.setTarget({ id: 'ch-9', name: 'chung', private: false, scopeType: 'CHANNEL' });
    });
    await act(async () => {
      result.current.save();
    });

    expect(mutate.mock.calls[0][0]).toMatchObject({
      targetScopeId: 'ch-9',
      targetScopeType: 'CHANNEL',
    });
  });
});
