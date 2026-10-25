import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useConnectionState } from '@/core/socket';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import { meetingsKeys } from '../api/meetings.keys';
import type { MeetingDetailDto, MeetingListItemDto } from '../api/meetings.types';
import { useMeetingSocketSync } from '../hooks/useMeetingSocketSync';
import { makeListItem, makeMeeting } from './fixtures';

/** `useMeetingSocketSync` vá cache theo `meeting:*` (app.md p2-04 §4.2, §8): huỷ, bị loại khỏi danh sách, cập nhật, nối lại; cờ tắt ⇒ im. */
const mockHandlers = new Map<string, (payload: unknown) => void>();
jest.mock('@/core/socket', () => ({
  SocketEvent: jest.requireActual('@/core/socket/socket.events').SocketEvent,
  useConnectionState: jest.fn(() => 'connected'),
  useSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    mockHandlers.set(event, handler);
  },
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn(() => true) }));

const RANGE = meetingsKeys.range({
  from: '2026-09-28T00:00:00.000Z',
  scope: 'MINE',
  to: '2026-10-05T00:00:00.000Z',
});

async function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  queryClient.setQueryData<MeetingDetailDto>(
    meetingsKeys.detail('m1'),
    makeMeeting({ id: 'm1', version: 2 }),
  );
  queryClient.setQueryData(meetingsKeys.attendees('m1'), { pages: [], pageParams: [] });
  queryClient.setQueryData<MeetingListItemDto[]>(RANGE, [
    makeListItem({ id: 'm1' }),
    makeListItem({ id: 'm2', title: 'Họp khác' }),
  ]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = await renderHook(() => useMeetingSocketSync(), { wrapper });
  return { hook, queryClient, wrapper };
}
const emit = (event: string, payload: unknown) => act(() => mockHandlers.get(event)?.(payload));

beforeEach(() => {
  mockHandlers.clear();
  jest.mocked(useFeature).mockReturnValue(true);
  jest.mocked(useConnectionState).mockReturnValue('connected');
  useAuthStore.setState({ user: { id: 'me' } } as never);
});

describe('useMeetingSocketSync', () => {
  it('meeting:cancelled vá trạng thái CANCELLED + lý do vào chi tiết và mọi cửa sổ lịch, rồi lấy lại myActions từ server', async () => {
    const { queryClient } = await setup();
    await emit('meeting:cancelled', { cancelReason: 'Trùng lịch', meetingId: 'm1', version: 3 });

    const detail = queryClient.getQueryData<MeetingDetailDto>(meetingsKeys.detail('m1'));
    expect(detail).toMatchObject({ cancelReason: 'Trùng lịch', status: 'CANCELLED', version: 3 });
    const range = queryClient.getQueryData<MeetingListItemDto[]>(RANGE);
    expect(range?.find((i) => i.id === 'm1')?.status).toBe('CANCELLED');
    expect(range?.find((i) => i.id === 'm2')?.status).toBe('SCHEDULED');
    expect(queryClient.getQueryState(meetingsKeys.detail('m1'))?.isInvalidated).toBe(true);
  });

  it('meeting:attendee-removed với CHÍNH MÌNH ⇒ xoá chi tiết + người tham dự khỏi cache và loại khỏi lịch', async () => {
    const { queryClient } = await setup();
    await emit('meeting:attendee-removed', { meetingId: 'm1', userId: 'me', version: 3 });

    expect(queryClient.getQueryData(meetingsKeys.detail('m1'))).toBeUndefined();
    expect(queryClient.getQueryData(meetingsKeys.attendees('m1'))).toBeUndefined();
    expect(queryClient.getQueryData<MeetingListItemDto[]>(RANGE)?.map((i) => i.id)).toEqual(['m2']);
  });

  it('meeting:attendee-removed của NGƯỜI KHÁC chỉ làm mới danh sách người tham dự, không đụng lịch của mình', async () => {
    const { queryClient } = await setup();
    await emit('meeting:attendee-removed', { meetingId: 'm1', userId: 'someone-else', version: 3 });

    expect(queryClient.getQueryState(meetingsKeys.attendees('m1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData<MeetingListItemDto[]>(RANGE)).toHaveLength(2);
    expect(queryClient.getQueryData(meetingsKeys.detail('m1'))).toBeDefined();
  });

  it('meeting:updated: version mới ⇒ làm mới chi tiết; đổi giờ ⇒ làm mới lịch; rsvpSummary ⇒ vá tại chỗ', async () => {
    const { queryClient } = await setup();
    const rsvpSummary = { ACCEPTED: 5, DECLINED: 0, PENDING: 0, TENTATIVE: 0 };
    await emit('meeting:updated', {
      changedFields: ['startAt'],
      meetingId: 'm1',
      rsvpSummary,
      version: 4,
    });

    expect(
      queryClient.getQueryData<MeetingDetailDto>(meetingsKeys.detail('m1'))?.rsvpSummary,
    ).toEqual(rsvpSummary);
    expect(queryClient.getQueryState(meetingsKeys.detail('m1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(RANGE)?.isInvalidated).toBe(true);
  });

  it('cờ `meeting` TẮT ⇒ bỏ qua mọi sự kiện, cache nguyên vẹn', async () => {
    jest.mocked(useFeature).mockReturnValue(false);
    const { queryClient } = await setup();
    await emit('meeting:cancelled', { meetingId: 'm1', version: 3 });
    await emit('meeting:attendee-removed', { meetingId: 'm1', userId: 'me', version: 3 });

    expect(queryClient.getQueryData<MeetingDetailDto>(meetingsKeys.detail('m1'))?.status).toBe(
      'SCHEDULED',
    );
    expect(queryClient.getQueryData<MeetingListItemDto[]>(RANGE)).toHaveLength(2);
  });

  it('socket NỐI LẠI sau khi mất kết nối ⇒ làm mới mọi truy vấn họp đang hiển thị (có thể đã lỡ sự kiện)', async () => {
    jest.mocked(useConnectionState).mockReturnValue('offline');
    const { hook, queryClient } = await setup();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    jest.mocked(useConnectionState).mockReturnValue('connected');
    await hook.rerender({});

    expect(spy).toHaveBeenCalledWith({ queryKey: meetingsKeys.all, refetchType: 'active' });
  });
});
