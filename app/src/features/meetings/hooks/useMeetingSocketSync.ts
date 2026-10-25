import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { SocketEvent, useConnectionState, useSocketEvent } from '@/core/socket';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import type {
  AttendeeRemovedPayload,
  MeetingCancelledPayload,
  MeetingInvitedPayload,
  MeetingUpdatedPayload,
} from '../api/meeting-socket.types';
import { meetingsKeys } from '../api/meetings.keys';
import {
  ATTENDEE_FIELDS,
  LIFECYCLE_EVENTS,
  RANGE_FIELDS,
  RECAP_EVENTS,
} from '../constants/meeting-socket.constants';
import { forgetMeeting, patchDetail, patchRanges } from '../utils/meeting-cache';

/**
 * Đồng bộ cache lịch họp theo `meeting:*` (README p2-04 §4.2). Mount MỘT lần ở `app/(app)/_layout.tsx` — nhận cập nhật ở mọi màn.
 * `version` cache thấp hơn payload ⇒ làm mới chi tiết (không tin dữ liệu cũ); hủy/đổi RSVP vá tại chỗ để khỏi nháy. Socket nối lại
 * ⇒ làm mới mọi query `meetings` đang hiển thị (có thể đã lỡ sự kiện lúc mất mạng).
 */
export function useMeetingSocketSync(): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  /** Cờ `meeting` tắt (hoặc capabilities chưa tải) ⇒ bỏ qua mọi sự kiện: hook vẫn gọi đủ (luật hook) nhưng không đụng cache. */
  const enabled = useFeature('meeting') === true;

  useSocketEvent<MeetingInvitedPayload>(SocketEvent.MEETING_INVITED, () => {
    if (!enabled) return;
    void queryClient.invalidateQueries({ queryKey: meetingsKeys.ranges() });
  });

  useSocketEvent<MeetingUpdatedPayload>(SocketEvent.MEETING_UPDATED, (p) => {
    if (!enabled) return;
    const cached = queryClient.getQueryData<{ version: number }>(meetingsKeys.detail(p.meetingId));
    // ⚠️ Vá TRƯỚC, đánh dấu cũ SAU: `setQueryData` xoá cờ `isInvalidated`, nên làm ngược lại thì chi tiết không còn được coi là cũ
    // (truy vấn chưa có người xem sẽ giữ bản version thấp tới hết `staleTime`).
    if (p.rsvpSummary) {
      const rsvpSummary = p.rsvpSummary;
      patchDetail(queryClient, p.meetingId, (detail) => ({ ...detail, rsvpSummary }));
    }
    if (cached && cached.version < p.version) {
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(p.meetingId) });
    }
    if (p.changedFields?.some((field) => RANGE_FIELDS.has(field))) {
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.ranges() });
    }
    // Header "N tham dự" đã vá qua `rsvpSummary`, nhưng từng dòng (nhãn RSVP, vai trò) nằm ở danh sách người tham dự.
    if (p.rsvpSummary || p.changedFields?.some((field) => ATTENDEE_FIELDS.has(field))) {
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.attendees(p.meetingId) });
    }
    // Tiêu đề ở đầu màn biên bản/bản ghi — khoá của `meeting-recap` (`meeting-title.queries.ts`), ghi tay vì không import chéo feature.
    if (p.changedFields?.includes('title')) {
      void queryClient.invalidateQueries({ queryKey: ['meetings', 'recap-title', p.meetingId] });
    }
  });

  useSocketEvent<MeetingCancelledPayload>(SocketEvent.MEETING_CANCELLED, (p) => {
    if (!enabled) return;
    patchDetail(queryClient, p.meetingId, (detail) => ({
      ...detail,
      cancelReason: p.cancelReason,
      status: 'CANCELLED',
      version: Math.max(detail.version, p.version),
    }));
    patchRanges(queryClient, p.meetingId, (item) => ({ ...item, status: 'CANCELLED' }));
    // `myActions` đổi theo trạng thái — lấy bản server tính lại thay vì tự suy quyền.
    void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(p.meetingId) });
  });

  useSocketEvent<AttendeeRemovedPayload>(SocketEvent.MEETING_ATTENDEE_REMOVED, (p) => {
    if (!enabled) return;
    if (p.userId === userId) {
      forgetMeeting(queryClient, p.meetingId);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: meetingsKeys.attendees(p.meetingId) });
    // `attendeeCount` ở phần người tham dự của chi tiết.
    void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(p.meetingId) });
  });

  const onRecapChanged = (p: MeetingInvitedPayload) => {
    if (!enabled) return;
    void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(p.meetingId) });
    // Biên bản + danh sách bản ghi (khoá của `meeting-recap`, `meeting-recap.keys.ts`) — màn đó mở sau trong `staleTime` vẫn bản cũ.
    void queryClient.invalidateQueries({ queryKey: ['meetings', 'recap', p.meetingId] });
    void queryClient.invalidateQueries({ queryKey: ['meetings', 'recordings', p.meetingId] });
  };
  useSocketEvent<MeetingInvitedPayload>(RECAP_EVENTS[0], onRecapChanged);
  useSocketEvent<MeetingInvitedPayload>(RECAP_EVENTS[1], onRecapChanged);

  const onLifecycle = (p: MeetingInvitedPayload) => {
    if (!enabled) return;
    void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(p.meetingId) });
    void queryClient.invalidateQueries({ queryKey: meetingsKeys.ranges() });
  };
  useSocketEvent<MeetingInvitedPayload>(LIFECYCLE_EVENTS[0], onLifecycle);
  useSocketEvent<MeetingInvitedPayload>(LIFECYCLE_EVENTS[1], onLifecycle);

  const connection = useConnectionState();
  const wasConnected = useRef(connection === 'connected');
  useEffect(() => {
    if (enabled && connection === 'connected' && !wasConnected.current) {
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.all, refetchType: 'active' });
    }
    wasConnected.current = connection === 'connected';
  }, [connection, enabled, queryClient]);
}
