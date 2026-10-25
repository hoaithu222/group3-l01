import { apiClient } from '@/core/api/client';

import { workspaceTemplatesService } from '../api/workspace-templates.service';
import { COURSE } from './fixtures';

/**
 * Hợp đồng BE thật (be/src/modules/workspace-templates, đọc trực tiếp từ mã): `GET /workspace-templates` → mảng mẫu; `POST
 * /workspaces/:id/templates/:code/apply` cần `Idempotency-Key` và body `{ channelKeys }`. Mọi lượt gọi dùng `skipErrorToast` — lỗi
 * `TPL_*`/403/429 hiện TẠI CHỖ trong màn, toast chung sẽ trùng.
 */
jest.mock('@/core/api/client', () => ({
  apiClient: { get: jest.fn(), post: jest.fn() },
}));

const mockedGet = jest.mocked(apiClient.get);
const mockedPost = jest.mocked(apiClient.post);
const envelope = (data: unknown) => ({ data: { data, success: true } }) as never;

beforeEach(() => jest.clearAllMocks());

describe('workspaceTemplatesService', () => {
  it('list: GET /workspace-templates, trả nguyên mảng mẫu kèm kênh', async () => {
    mockedGet.mockResolvedValue(envelope([COURSE]));

    const templates = await workspaceTemplatesService.list();

    expect(mockedGet).toHaveBeenCalledWith('/workspace-templates', { skipErrorToast: true });
    expect(templates).toEqual([COURSE]);
  });

  it('apply: POST .../templates/:code/apply với body { channelKeys } và header Idempotency-Key', async () => {
    const result = {
      createdChannels: [{ id: 'c-1', key: 'thong-bao', name: 'Thông báo' }],
      skipped: [],
    };
    mockedPost.mockResolvedValue(envelope(result));

    const applied = await workspaceTemplatesService.apply('ws-1', {
      channelKeys: ['thong-bao', 'thao-luan'],
      code: 'course',
      idempotencyKey: 'tpl-apply-abc12345',
    });

    expect(mockedPost).toHaveBeenCalledWith(
      '/workspaces/ws-1/templates/course/apply',
      { channelKeys: ['thong-bao', 'thao-luan'] },
      { headers: { 'Idempotency-Key': 'tpl-apply-abc12345' }, skipErrorToast: true },
    );
    expect(applied).toEqual(result);
  });

  it('listChannelNames: gộp kênh đang hoạt động + ĐÃ LƯU TRỮ (BE tính trùng tên cả kênh lưu trữ); lưu trữ lỗi thì bỏ qua phần đó', async () => {
    mockedGet.mockImplementation(async (_url, config) => {
      const status = (config?.params as { status: string }).status;
      if (status === 'ARCHIVED') return envelope({ discoverable: [], joined: [{ name: 'Cũ' }] });
      return envelope({ discoverable: [{ name: 'Công khai' }], joined: [{ name: 'Chung' }] });
    });

    expect(await workspaceTemplatesService.listChannelNames('ws-1')).toEqual([
      'Chung',
      'Công khai',
      'Cũ',
    ]);
    expect(mockedGet).toHaveBeenCalledWith('/workspaces/ws-1/channels', {
      params: { include: 'all', status: 'ARCHIVED' },
      skipErrorToast: true,
    });

    mockedGet.mockReset().mockImplementation(async (_url, config) => {
      if ((config?.params as { status: string }).status === 'ARCHIVED') throw new Error('boom');
      return envelope({ discoverable: [], joined: [{ name: 'Chung' }] });
    });
    expect(await workspaceTemplatesService.listChannelNames('ws-1')).toEqual(['Chung']);
  });

  it('getWorkspaceHead: GET /workspaces/:id, trả NGUYÊN phản hồi (khoá cache dùng chung với useWorkspace)', async () => {
    mockedGet.mockResolvedValue(
      envelope({ id: 'ws-1', myRole: 'ADMIN', name: 'Nhóm A', status: 'ACTIVE' }),
    );

    const head = await workspaceTemplatesService.getWorkspaceHead('ws-1');

    expect(mockedGet).toHaveBeenCalledWith('/workspaces/ws-1', { skipErrorToast: true });
    expect(head).toEqual({ id: 'ws-1', myRole: 'ADMIN', name: 'Nhóm A', status: 'ACTIVE' });
  });
});
