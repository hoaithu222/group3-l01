import { useMutation, useQueryClient } from '@tanstack/react-query';

import { meetingsKeys } from '../api/meetings.keys';
import { meetingsService } from '../api/meetings.service';
import type {
  CreateMeetingPayload,
  MeetingAttendeeRole,
  MeetingDetailDto,
  MeetingRsvp,
  UpdateMeetingPayload,
} from '../api/meetings.types';
import {
  applyMeetingDetail,
  forgetMeeting,
  patchDetail,
  patchRanges,
  withRsvp,
} from '../utils/meeting-cache';

/**
 * Mutation của `meetings`. Mọi thao tác trả `MeetingDetailDto` mới (kèm `myActions` tính lại) ⇒ ghi thẳng vào cache chi tiết
 * và làm mới lịch — KHÔNG tự suy quyền/nút sau thao tác (README p2-04 §4.1). Không retry tự động (quy ước app). Chỉ RSVP lạc quan.
 */

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      idempotencyKey: string;
      payload: CreateMeetingPayload;
      workspaceId: string;
    }) => meetingsService.create(v.workspaceId, v.payload, v.idempotencyKey),
    onSuccess: (detail) => applyMeetingDetail(queryClient, detail),
  });
}

export function useUpdateMeeting(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateMeetingPayload) => meetingsService.update(meetingId, payload),
    onSuccess: (detail) => applyMeetingDetail(queryClient, detail),
  });
}

export function useCancelMeeting(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { expectedVersion: number; reason?: string }) =>
      meetingsService.cancel(meetingId, v.expectedVersion, v.reason),
    onSuccess: (detail) => applyMeetingDetail(queryClient, detail),
  });
}

export function useDeleteMeeting(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { expectedVersion: number; reason?: string }) =>
      meetingsService.remove(meetingId, v.expectedVersion, v.reason),
    onSuccess: () => forgetMeeting(queryClient, meetingId),
  });
}

export function useAddAttendees(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { role?: Exclude<MeetingAttendeeRole, 'HOST'>; userIds: string[] }) =>
      meetingsService.addAttendees(meetingId, v.userIds, v.role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.attendees(meetingId) });
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(meetingId) });
    },
  });
}

export function useRemoveAttendee(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => meetingsService.removeAttendee(meetingId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.attendees(meetingId) });
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(meetingId) });
    },
  });
}

/** Tự rút khỏi danh sách: xong thì cuộc họp biến mất khỏi lịch của mình (như bị loại). */
export function useLeaveAttendance(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => meetingsService.leaveAttendance(meetingId),
    onSuccess: () => forgetMeeting(queryClient, meetingId),
  });
}

export function useSetAttendeeRole(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { role: Exclude<MeetingAttendeeRole, 'HOST'>; userId: string }) =>
      meetingsService.setRole(meetingId, v.userId, v.role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.attendees(meetingId) });
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(meetingId) });
    },
  });
}

export function useTransferHost(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { expectedVersion: number; toUserId: string }) =>
      meetingsService.transferHost(meetingId, v.toUserId, v.expectedVersion),
    onSuccess: (detail) => {
      applyMeetingDetail(queryClient, detail);
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.attendees(meetingId) });
    },
  });
}

/** RSVP LẠC QUAN (chỉ thông tin, không chặn vào phòng): đổi `myRsvp` + đếm ngay, lỗi thì hoàn về bản cũ. */
export function useRsvp(meetingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rsvp: Exclude<MeetingRsvp, 'PENDING'>) => meetingsService.rsvp(meetingId, rsvp),
    onMutate: async (rsvp) => {
      await queryClient.cancelQueries({ queryKey: meetingsKeys.detail(meetingId) });
      const previous = queryClient.getQueryData<MeetingDetailDto>(meetingsKeys.detail(meetingId));
      patchDetail(queryClient, meetingId, (detail) => withRsvp(detail, rsvp));
      patchRanges(queryClient, meetingId, (item) => ({ ...item, myRsvp: rsvp }));
      return { previous };
    },
    onError: (_error, _rsvp, context) => {
      if (context?.previous)
        queryClient.setQueryData(meetingsKeys.detail(meetingId), context.previous);
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.ranges() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.attendees(meetingId) });
      // Bản vá lạc quan chưa từng được đối chiếu: BE chỉ phát `meeting:updated` (RSVP) tới CHỦ TRÌ — lấy bản chi tiết thật.
      void queryClient.invalidateQueries({ queryKey: meetingsKeys.detail(meetingId) });
    },
  });
}
