import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  ME_MEETINGS_PATH,
  meetingCancelPath,
  meetingIcsPath,
  meetingPath,
  meetingResolvePath,
  meetingRsvpPath,
  workspaceMeetingsPath,
} from './meetings.api';
import { meetingsAttendeesService } from './meetings-attendees.service';
import type {
  CreateMeetingPayload,
  MeetingDetailDto,
  MeetingListItemDto,
  MeetingRangeParams,
  MeetingRsvp,
  ResolveResult,
  UpdateMeetingPayload,
} from './meetings.types';

/**
 * `skipErrorToast` ở thao tác GHI: lỗi (`MEET_003/004/014/015`, `RES_003` 409 lệch version) là NỘI DUNG của form/màn chi tiết
 * (giữ nguyên thứ người dùng đã nhập, banner "đã được cập nhật bởi người khác"), không phải toast tự tắt.
 */
const QUIET = { skipErrorToast: true } as const;

/** Đóng dấu giờ MÁY lúc nhận chi tiết — xem `MeetingDetailDto.receivedAt`. */
const stamped = (dto: MeetingDetailDto): MeetingDetailDto => ({ ...dto, receivedAt: Date.now() });

/** `?status=A&status=B` — BE nhận lặp khoá; axios của app đã serialize mảng đúng kiểu (`key=a&key=b`). */
function rangeQuery(p: MeetingRangeParams) {
  return { from: p.from, scope: p.scope, status: p.status, to: p.to, workspaceId: p.workspaceId };
}

/**
 * Mặt tiền duy nhất của `meetings` — thao tác người tham dự nằm ở `meetings-attendees.service.ts` (gộp vào đây để queries và
 * `jest.mock('../api/meetings.service')` chỉ phải biết MỘT đối tượng).
 */
export const meetingsService = {
  ...meetingsAttendeesService,

  /** `GET /me/meetings` — MẢNG THUẦN trong `data` (không cursor), cửa sổ ≤ 62 ngày. */
  async listMine(params: MeetingRangeParams): Promise<MeetingListItemDto[]> {
    const response = await apiClient.get(ME_MEETINGS_PATH, {
      params: rangeQuery(params),
      skipErrorToast: true,
    });
    return unwrapData<MeetingListItemDto[]>(response);
  },

  async listWorkspace(
    workspaceId: string,
    params: MeetingRangeParams,
  ): Promise<MeetingListItemDto[]> {
    const response = await apiClient.get(workspaceMeetingsPath(workspaceId), {
      params: rangeQuery(params),
      skipErrorToast: true,
    });
    return unwrapData<MeetingListItemDto[]>(response);
  },

  async get(meetingId: string): Promise<MeetingDetailDto> {
    return stamped(
      unwrapData<MeetingDetailDto>(await apiClient.get(meetingPath(meetingId), QUIET)),
    );
  },

  /** `Idempotency-Key` BẮT BUỘC (BE) — sinh lúc MỞ FORM, giữ qua các lần bấm/thử lại (MT-01). */
  async create(
    workspaceId: string,
    payload: CreateMeetingPayload,
    idempotencyKey: string,
  ): Promise<MeetingDetailDto> {
    const response = await apiClient.post(workspaceMeetingsPath(workspaceId), payload, {
      headers: { 'Idempotency-Key': idempotencyKey },
      ...QUIET,
    });
    return stamped(unwrapData<MeetingDetailDto>(response));
  },

  async update(meetingId: string, payload: UpdateMeetingPayload): Promise<MeetingDetailDto> {
    return stamped(
      unwrapData<MeetingDetailDto>(await apiClient.patch(meetingPath(meetingId), payload, QUIET)),
    );
  },

  async cancel(
    meetingId: string,
    expectedVersion: number,
    reason?: string,
  ): Promise<MeetingDetailDto> {
    const response = await apiClient.post(
      meetingCancelPath(meetingId),
      { expectedVersion, reason },
      QUIET,
    );
    return stamped(unwrapData<MeetingDetailDto>(response));
  },

  /** Xoá MỀM — 204 không body; `expectedVersion` ở query (BE `deleteMeetingQuerySchema`). */
  async remove(meetingId: string, expectedVersion: number, reason?: string): Promise<void> {
    await apiClient.delete(meetingPath(meetingId), {
      params: { expectedVersion, reason },
      ...QUIET,
    });
  },

  async rsvp(
    meetingId: string,
    rsvp: Exclude<MeetingRsvp, 'PENDING'>,
  ): Promise<{ rsvp: MeetingRsvp; rsvpAt: string }> {
    const response = await apiClient.put(meetingRsvpPath(meetingId), { rsvp }, QUIET);
    return unwrapData<{ rsvp: MeetingRsvp; rsvpAt: string }>(response);
  },

  async resolve(code: string): Promise<ResolveResult> {
    return unwrapData<ResolveResult>(await apiClient.get(meetingResolvePath(code), QUIET));
  },

  /**
   * Nội dung `.ics` của cuộc họp (`METHOD:PUBLISH`). BE trả TỆP văn bản, KHÔNG bọc `{ data }` ⇒ đọc THẲNG `response.data` (chuỗi), không `unwrapData`.
   * ⚠️ Không đặt `responseType: 'text'`: lỗi (403/404) vẫn là JSON và axios chỉ parse thành object khi để mặc định — `classifyMeetingError` cần `error.response.data.error.code`.
   * `.ics` không phải JSON nên axios giữ nguyên chuỗi. Kiểm `BEGIN:VCALENDAR` để một trang HTML của proxy/captive portal không bị ghi ra thành "tệp lịch".
   */
  async ics(meetingId: string): Promise<string> {
    const { data } = await apiClient.get<unknown>(meetingIcsPath(meetingId), {
      headers: { Accept: 'text/calendar' },
      ...QUIET,
    });
    if (typeof data !== 'string' || !data.trimStart().startsWith('BEGIN:VCALENDAR')) {
      throw new Error('Không nhận được tệp lịch hợp lệ. Hãy thử lại.');
    }
    return data;
  },
};
