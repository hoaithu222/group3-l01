import { apiClient } from '@/core/api/client';

import { conversionService } from '../api/conversion.service';
import { reminderService } from '../api/reminder.service';
import { scheduledMessageService } from '../api/scheduled-message.service';

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

describe('scheduledMessageService', () => {
  const input = { attachmentAssetIds: [], mentions: [], sendAt: '2026-10-01T13:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh' };

  it('create: bỏ content/replyToId rỗng, giữ sendAt UTC + timezone; kênh có luồng → threadId', async () => {
    api.post.mockResolvedValue(ok({ id: 's-1' }));

    await scheduledMessageService.create(SCOPE, { ...input, content: '' });
    await scheduledMessageService.create({ ...SCOPE, threadId: 'root-1' }, { ...input, content: 'Xin chào', replyToId: 'm-9' });

    expect(api.post.mock.calls[0]?.[0]).toBe('/scopes/CHANNEL/ch-1/scheduled-messages');
    expect(api.post.mock.calls[0]?.[1]).toEqual({ attachmentAssetIds: [], mentions: [], sendAt: input.sendAt, timezone: input.timezone });
    expect(api.post.mock.calls[1]?.[1]).toMatchObject({ content: 'Xin chào', replyToId: 'm-9', threadId: 'root-1' });
  });

  it('listMine: truyền status + lọc phòng; đọc data + meta trực tiếp', async () => {
    api.get.mockResolvedValue({ data: { data: [], meta: { hasMore: false, limit: 30, nextCursor: null } } });

    const page = await scheduledMessageService.listMine({ scopeId: 'ch-1', scopeType: 'CHANNEL', status: 'FAILED' });

    expect(page.meta.hasMore).toBe(false);
    expect(api.get).toHaveBeenCalledWith('/me/scheduled-messages', { params: { scopeId: 'ch-1', scopeType: 'CHANNEL', status: 'FAILED' }, skipErrorToast: true });
  });

  it('update kèm expectedVersion; cancel 204; sendNow trả { scheduledMessage, message }', async () => {
    api.patch.mockResolvedValue(ok({ id: 's-1', version: 2 }));
    api.delete.mockResolvedValue({ data: undefined });
    api.post.mockResolvedValue(ok({ message: { id: 'm-1' }, scheduledMessage: { id: 's-1' } }));

    await scheduledMessageService.update('s-1', { expectedVersion: 1, sendAt: '2026-10-02T00:00:00.000Z' });
    await scheduledMessageService.cancel('s-1');
    const sent = await scheduledMessageService.sendNow('s-1');

    expect(api.patch).toHaveBeenCalledWith('/scheduled-messages/s-1', { expectedVersion: 1, sendAt: '2026-10-02T00:00:00.000Z' }, { skipErrorToast: true });
    expect(api.delete).toHaveBeenCalledWith('/scheduled-messages/s-1', { skipErrorToast: true });
    expect(api.post).toHaveBeenCalledWith('/scheduled-messages/s-1/send-now', undefined, { skipErrorToast: true });
    expect(sent.message).toEqual({ id: 'm-1' });
  });
});

describe('reminderService / conversionService', () => {
  it('reminder: create/listMine/cancel + tra nhóm của kênh (lấy workspaceId; không có → null)', async () => {
    api.post.mockResolvedValue(ok({ id: 'r-1' }));
    api.get.mockResolvedValueOnce({ data: { data: [], meta: { hasMore: false, limit: 30, nextCursor: null } } });
    api.get.mockResolvedValueOnce(ok({ workspaceId: 'ws-9' })).mockResolvedValueOnce(ok({}));
    api.delete.mockResolvedValue({ data: undefined });

    await reminderService.create('m-1', { remindAt: '2026-10-01T00:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh' });
    await reminderService.listMine({ status: 'PENDING' });
    await reminderService.cancel('r-1');

    expect(api.post).toHaveBeenCalledWith('/messages/m-1/reminders', { remindAt: '2026-10-01T00:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh' }, { skipErrorToast: true });
    expect(api.get).toHaveBeenCalledWith('/me/reminders', { params: { status: 'PENDING' }, skipErrorToast: true });
    expect(api.delete).toHaveBeenCalledWith('/reminders/r-1', { skipErrorToast: true });
    await expect(reminderService.channelWorkspaceId('ch-1')).resolves.toBe('ws-9');
    await expect(reminderService.channelWorkspaceId('ch-2')).resolves.toBeNull();
  });

  it('toTask: header Idempotency-Key BẮT BUỘC (BE required:true)', async () => {
    api.post.mockResolvedValue(ok({ sourceRef: { kind: 'TASK', refId: 't-1' }, task: { boardId: 'b-1', id: 't-1', title: 'Việc' } }));

    await conversionService.toTask('m-1', { boardId: 'b-1', includeQuote: true, title: 'Việc' }, 'key-1');

    expect(api.post).toHaveBeenCalledWith('/messages/m-1/to-task', { boardId: 'b-1', includeQuote: true, title: 'Việc' }, { headers: { 'Idempotency-Key': 'key-1' }, skipErrorToast: true });
  });

  it('listWorkspaces/listBoards chỉ giữ trường cần (id, tên, cột)', async () => {
    api.get.mockResolvedValueOnce(ok([{ avatarUrl: 'x', id: 'ws-1', name: 'Nhóm A' }]));
    api.get.mockResolvedValueOnce(ok([{ columns: [{ id: 'c1', kind: 'TODO', taskCount: 4, title: 'Cần làm' }], id: 'b-1', name: 'Bảng 1', taskCount: 9 }]));

    expect(await conversionService.listWorkspaces()).toEqual([{ id: 'ws-1', name: 'Nhóm A' }]);
    expect(await conversionService.listBoards('ws-1')).toEqual([{ columns: [{ id: 'c1', title: 'Cần làm' }], id: 'b-1', name: 'Bảng 1' }]);
    expect(api.get).toHaveBeenLastCalledWith('/workspaces/ws-1/boards', { params: { archived: false }, skipErrorToast: true });
  });
});
