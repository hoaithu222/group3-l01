import { apiClient } from '@/core/api/client';

import { workspacesService } from '../api';

/**
 * `POST /workspaces` (be.md p1-01 §4 + p5-04 §5): `Idempotency-Key` BẮT BUỘC (thiếu là 400); `templateCode`/`channelKeys` chỉ gửi khi
 * dùng mẫu, và khi đó lỗi (`TPL_001`/`CFG_005`) do FORM xử lý — nên không toast chung chồng lên.
 */
jest.mock('@/core/api/client', () => ({ apiClient: { post: jest.fn() } }));
const mockedPost = jest.mocked(apiClient.post);
const envelope = (data: unknown) => ({ data: { data, success: true } }) as never;

beforeEach(() => mockedPost.mockReset().mockResolvedValue(envelope({ workspace: { id: 'ws-1' } })));

describe('workspacesService.create', () => {
  it('tạo nhóm thường: body nguyên, header Idempotency-Key, lỗi vẫn toast chung (skipErrorToast = false)', async () => {
    await workspacesService.create({ description: 'Mô tả', name: 'Nhóm A' }, 'ws-create-abc12345');

    expect(mockedPost).toHaveBeenCalledWith(
      '/workspaces',
      { description: 'Mô tả', name: 'Nhóm A' },
      { headers: { 'Idempotency-Key': 'ws-create-abc12345' }, skipErrorToast: false },
    );
  });

  it('tạo nhóm kèm mẫu: gửi templateCode + channelKeys, KHÔNG toast chung (form tự xử lý TPL_001/CFG_005)', async () => {
    await workspacesService.create(
      { channelKeys: ['thong-bao'], name: 'Nhóm A', templateCode: 'course' },
      'ws-create-abc12345',
    );

    expect(mockedPost).toHaveBeenCalledWith(
      '/workspaces',
      { channelKeys: ['thong-bao'], name: 'Nhóm A', templateCode: 'course' },
      { headers: { 'Idempotency-Key': 'ws-create-abc12345' }, skipErrorToast: true },
    );
  });

  it('kết quả trả kèm data.template khi BE áp mẫu (created/skipped/failed)', async () => {
    const template = { createdChannels: [], failed: true, skipped: [] };
    mockedPost.mockResolvedValue(envelope({ template, workspace: { id: 'ws-1' } }));

    const result = await workspacesService.create(
      { name: 'A', templateCode: 'course' },
      'ws-create-abc12345',
    );

    expect(result.template).toEqual(template);
  });
});
