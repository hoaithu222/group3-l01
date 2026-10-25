import type { Href } from 'expo-router';

import { PATHS } from '@/shell/config';

import type { NotificationTarget } from './notification-target.types';

/**
 * Biên bản & ghi hình cuộc họp (p2-06): thông báo `meeting.recap-*` / `meeting.recording-ready` của BE
 * (`be/src/modules/meetings/services/meeting-notification-types.ts`, `meeting-recap-recording.events.ts`) → màn đích. Tách khỏi
 * `notification-route.ts` để file đó giữ trong trần độ dài (cùng vai `study-route.ts`/`mentor-route.ts`).
 *
 * Push/hộp thư chỉ mang id (`meetingId`, `recordingId`) — KHÔNG nội dung; màn đích tự tải lại và nói "không còn khả dụng" khi BE trả 403/404.
 * ⛔ Không kiểm quyền ở đây.
 *
 *  · `meeting.recap-published` → XEM biên bản (`/meetings/[meetingId]/recap`).
 *  · `meeting.recap-required` / `meeting.recap-reminder` (chủ trì phải viết biên bản) → SOẠN (`/meetings/[meetingId]/recap-edit`).
 *  · `meeting.recording-ready` → trình phát của ĐÚNG bản ghi khi biết `recordingId` (cùng nút "Xem" của thẻ chat); thiếu thì danh sách bản ghi.
 *
 * ⚠️ Nhắc lại biên bản đi push dưới loại `meeting.reminder` + `data.kind = "RECAP"` (BE dùng lại push type có sẵn thay vì thêm loại mới; xem
 * `meeting-notification-types.ts`). `meeting.reminder` thường (nhắc SẮP TỚI GIỜ họp, không có `kind`) KHÔNG thuộc hàm này — vẫn mở chi tiết cuộc họp.
 *
 * `recordingId`/`kind` chưa có trong `NotificationTarget`: hàm nhận kiểu hẹp riêng để KHÔNG phải sửa kiểu chung; `NotificationTarget` gán được
 * vào đây (thừa trường không sao). Trả `null` khi không phải loại này HOẶC thiếu `meetingId` — nơi gọi rơi tiếp xuống `meetingHref` chung.
 *
 * ⛔ Mỗi nhánh là một hàm trả `Href` với `if`/`return` tường minh — KHÔNG viết `cond ? a : b` trên hai `Href` trong một biểu thức: `Href` đã vài
 * trăm mục, TS rút gọn union quá giới hạn (TS2590), cùng bẫy đã ghi ở `hrefForTarget`. Đường dẫn khớp `features/meeting-recap/utils/recap-navigation.ts`.
 */
export type MeetingRecapTarget = Pick<NotificationTarget, 'meetingId' | 'type'> & {
  /** `data.kind` của push nhắc biên bản (`meeting.reminder` + `RECAP`) hoặc `refs.kind` của mục hộp thư `meeting.recap-reminder`. */
  kind?: string;
  /** id bản ghi (`refs.recordingId` của `meeting.recording-ready`). */
  recordingId?: string;
};

const RECAP_EDIT_TYPES = new Set(['meeting.recap-required', 'meeting.recap-reminder']);

/** Nhắc biên bản đi push dưới loại `meeting.reminder` kèm `kind = RECAP` — `kind` khác (hoặc không có) là nhắc giờ họp thường. */
function isRecapReminderPush({ kind, type }: Pick<MeetingRecapTarget, 'kind' | 'type'>): boolean {
  return type === 'meeting.reminder' && kind === 'RECAP';
}

export function isMeetingRecapType(target: Pick<MeetingRecapTarget, 'kind' | 'type'>): boolean {
  const { type } = target;
  return (
    type === 'meeting.recap-published' ||
    type === 'meeting.recording-ready' ||
    RECAP_EDIT_TYPES.has(type) ||
    isRecapReminderPush(target)
  );
}

function recapViewHref(meetingId: string): Href {
  return { params: { meetingId }, pathname: '/meetings/[meetingId]/recap' };
}

function recapEditHref(meetingId: string): Href {
  return { params: { meetingId }, pathname: '/meetings/[meetingId]/recap-edit' };
}

function recordingHref(meetingId: string, recordingId: string | undefined): Href {
  if (recordingId) {
    return {
      params: { meetingId, recordingId },
      pathname: '/meetings/[meetingId]/recordings/[recordingId]',
    };
  }
  return { params: { meetingId }, pathname: '/meetings/[meetingId]/recordings' };
}

export function meetingRecapHref(target: MeetingRecapTarget): Href | null {
  const { meetingId, recordingId, type } = target;
  if (!meetingId || !isMeetingRecapType(target)) return null;

  if (type === 'meeting.recap-published') return recapViewHref(meetingId);
  if (type === 'meeting.recording-ready') return recordingHref(meetingId, recordingId);
  return recapEditHref(meetingId); // recap-required · recap-reminder · meeting.reminder + kind RECAP
}

/**
 * Đích của MỌI `meeting.*` (p2-04/p2-05/p2-06; gọi từ `hrefForTarget` ở `notification-route.ts`): biên bản/ghi hình đi đường riêng ở trên TRƯỚC,
 * còn lại mở chi tiết cuộc họp, riêng `meeting.started` mở thẳng PHÒNG họp. `meeting.removed` (bị xoá khỏi danh sách) thì chi tiết sẽ 403/404 — về LỊCH
 * thay vì một màn "không còn khả dụng". Thiếu `meetingId` → `null` (rơi về hộp thư).
 */
export function meetingHref(target: NotificationTarget): Href | null {
  const recap = meetingRecapHref(target);
  if (recap) return recap; // ⛔ `if` chứ không `??` (TS2590 — xem chú thích ở `hrefForTarget`).
  const { meetingId, type } = target;
  if (type === 'meeting.removed') return PATHS.MEETINGS;
  if (!meetingId) return null;
  // p2-05: "cuộc họp đã bắt đầu" → thẳng phòng (màn pre-join tự nó là bước xác nhận; chưa tới giờ/đã kết thúc thì màn phòng nói rõ).
  if (type === 'meeting.started')
    return { params: { meetingId }, pathname: '/meeting-room/[meetingId]' };
  return { params: { meetingId }, pathname: '/meetings/[meetingId]' };
}
