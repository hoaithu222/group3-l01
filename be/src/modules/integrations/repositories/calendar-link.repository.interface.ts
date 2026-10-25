import type { CalendarLinkEntity } from "../entities/integration.interface";

export interface UpsertCalendarLinkInput {
  meetingId: string;
  userId: string;
  userIntegrationId: string;
  externalEventId: string;
  etag: string | null;
  syncedVersion: number;
}

/** Ánh xạ cuộc họp ↔ sự kiện Google của từng người (`CalendarEventLink`). */
export interface ICalendarLinkRepository {
  find(meetingId: string, userId: string): Promise<CalendarLinkEntity | null>;
  /** Tạo hoặc cập nhật theo `(meetingId, userId)`; đặt lại `deletedAt = null`. */
  upsert(input: UpsertCalendarLinkInput): Promise<CalendarLinkEntity>;
  markDeleted(id: string, syncedVersion: number): Promise<void>;
  /** Liên kết CHƯA xoá của một cuộc họp (huỷ/xoá họp → xoá sự kiện của từng người). */
  listLiveByMeeting(meetingId: string): Promise<CalendarLinkEntity[]>;
  /** Liên kết chưa xoá của một kết nối (dọn khi ngắt kết nối). */
  listLiveByUserIntegration(userIntegrationId: string, limit: number): Promise<CalendarLinkEntity[]>;
  deleteByUserIntegration(userIntegrationId: string): Promise<number>;
}
