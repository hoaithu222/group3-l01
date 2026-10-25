import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  meetingAttendeePath,
  meetingAttendeesPath,
  meetingLeavePath,
  meetingRolePath,
  meetingTransferHostPath,
} from './meetings.api';
import type {
  AddAttendeesResult,
  AttendeePage,
  CursorMeta,
  MeetingAttendeeDto,
  MeetingAttendeeRole,
  MeetingDetailDto,
} from './meetings.types';

/** Lỗi ghi (`MEET_002/005/014/016`, `RES_003`) là nội dung của màn chi tiết — tự xử lý, không toast chung. */
const QUIET = { skipErrorToast: true } as const;

/** Vai trò gán được qua API: `HOST` chỉ đổi bằng `transferHost`. */
type AssignableRole = Exclude<MeetingAttendeeRole, 'HOST'>;

/**
 * Người tham dự của một cuộc họp (BE `meeting-attendee.service.ts`). Tách khỏi `meetings.service.ts` cho gọn trần 150
 * dòng; `meetingsService` gộp cả hai nên nơi gọi/`jest.mock` vẫn chỉ biết MỘT mặt tiền.
 */
export const meetingsAttendeesService = {
  async listAttendees(
    meetingId: string,
    cursor: string | undefined,
    limit = 50,
  ): Promise<AttendeePage> {
    const response = await apiClient.get<{ data: MeetingAttendeeDto[]; meta: CursorMeta }>(
      meetingAttendeesPath(meetingId),
      { params: { cursor, limit }, skipErrorToast: true },
    );
    return { items: response.data.data, meta: response.data.meta };
  },

  /** `rejected` (`MEET_014`: không phải thành viên ACTIVE của nhóm) và `alreadyAttending` là kết quả HỢP LỆ, không phải lỗi. */
  async addAttendees(
    meetingId: string,
    userIds: string[],
    role: AssignableRole = 'ATTENDEE',
  ): Promise<AddAttendeesResult> {
    const response = await apiClient.post(
      meetingAttendeesPath(meetingId),
      { role, userIds },
      QUIET,
    );
    return unwrapData<AddAttendeesResult>(response);
  },

  async removeAttendee(meetingId: string, userId: string): Promise<void> {
    await apiClient.delete(meetingAttendeePath(meetingId, userId), QUIET);
  },

  /** Tự rút khỏi danh sách (chỉ SCHEDULED; HOST phải chuyển chủ trì trước). */
  async leaveAttendance(meetingId: string): Promise<void> {
    await apiClient.delete(meetingLeavePath(meetingId), QUIET);
  },

  async setRole(
    meetingId: string,
    userId: string,
    role: AssignableRole,
  ): Promise<MeetingAttendeeDto> {
    const response = await apiClient.put(meetingRolePath(meetingId, userId), { role }, QUIET);
    return unwrapData<MeetingAttendeeDto>(response);
  },

  async transferHost(
    meetingId: string,
    toUserId: string,
    expectedVersion: number,
  ): Promise<MeetingDetailDto> {
    const response = await apiClient.post(
      meetingTransferHostPath(meetingId),
      { expectedVersion, toUserId },
      QUIET,
    );
    return { ...unwrapData<MeetingDetailDto>(response), receivedAt: Date.now() };
  },
};
