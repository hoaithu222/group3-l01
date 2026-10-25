import { renderHook } from '@testing-library/react-native';

import { SocketEvent } from '@/core/socket';

import { useAnnouncementSocket } from '../hooks/useAnnouncementSocket';
import { makeView } from './fixtures';
import { emit, LIST_KEY, readList, setupSocketHook } from './socket-harness';

/**
 * `announcement:updated` (be.md p5-04 §6): `ch:{id}` — tạo/khôi phục/huỷ (payload KHÔNG có view đầy đủ, vì `confirmedByMe`/
 * `canViewReceipts` là của từng người); `user:{id}` — máy khác của chính mình vừa xác nhận (`confirmedByMe:true`).
 */
const CREATED = {
  cancelled: false,
  channelId: 'ch-1',
  deadlineAt: '2026-10-01T00:00:00.000Z',
  messageId: 'm-1',
  required: true,
};
const OTHER_DEVICE = { channelId: 'ch-1', confirmedByMe: true, messageId: 'm-1', required: true };

describe('announcement:updated', () => {
  it('huỷ (`cancelled`) hoặc `required:false` → gỡ dòng khỏi danh sách (huy hiệu biến mất)', async () => {
    const { queryClient, wrapper } = setupSocketHook([
      makeView(),
      makeView({ messageId: 'm-2' }),
      makeView({ messageId: 'm-3' }),
    ]);
    await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, { ...CREATED, cancelled: true, required: false });
    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, {
      channelId: 'ch-1',
      messageId: 'm-2',
      required: false,
    });

    expect(readList(queryClient)?.map((v) => v.messageId)).toEqual(['m-3']);
  });

  it('thiết bị khác của MÌNH vừa xác nhận (`confirmedByMe:true`) → vá `confirmedByMe` (không tải lại)', async () => {
    const { queryClient, wrapper } = setupSocketHook([makeView()]);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, OTHER_DEVICE);

    expect(readList(queryClient)?.[0]?.confirmedByMe).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('`confirmedByMe:true` cho tin CHƯA có trong cache → tải lại danh sách', async () => {
    const { queryClient, wrapper } = setupSocketHook([]);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, OTHER_DEVICE);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: LIST_KEY });
  });

  it('yêu cầu mới/khôi phục (payload không có view đầy đủ) → tải lại danh sách của kênh', async () => {
    const { queryClient, wrapper } = setupSocketHook([]);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, CREATED);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: LIST_KEY });
  });

  it('kênh khác → bỏ qua hoàn toàn', async () => {
    const { queryClient, wrapper } = setupSocketHook([makeView()]);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    await renderHook(() => useAnnouncementSocket('ch-1'), { wrapper });

    await emit(SocketEvent.ANNOUNCEMENT_UPDATED, {
      ...CREATED,
      cancelled: true,
      channelId: 'ch-khac',
      required: false,
    });

    expect(readList(queryClient)).toHaveLength(1);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
