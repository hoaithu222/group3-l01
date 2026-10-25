import type {
  AttendeeEntity,
  AttendeePatch,
  MeetingEntity,
  MeetingPatch,
  MeetingStatusValue,
  NewAttendee,
  NewMeeting,
} from "../entities/meeting.interface";
import type { TxHandle } from "./tx";

export interface RangeFilter {
  from: Date;
  to: Date;
  statuses?: MeetingStatusValue[];
  limit: number;
}

export class MeetingCodeConflictError extends Error {
  constructor() {
    super("Meeting code unique conflict");
    this.name = "MeetingCodeConflictError";
  }
}

export interface IMeetingRepository {
  // ── đọc ────────────────────────────────────────────────────────────────────
  /** Bỏ qua cuộc họp đã xoá mềm (`deletedAt`) trừ khi `includeDeleted`. */
  findById(id: string, opts?: { tx?: TxHandle; includeDeleted?: boolean }): Promise<MeetingEntity | null>;
  findByCode(code: string): Promise<MeetingEntity | null>;
  codeExists(code: string): Promise<boolean>;
  findAttendee(meetingId: string, userId: string, tx?: TxHandle): Promise<AttendeeEntity | null>;
  /** Người tham dự CÒN HIỆU LỰC (`removedAt = null`). */
  findActiveAttendees(meetingId: string, tx?: TxHandle): Promise<AttendeeEntity[]>;
  /** Phân trang tăng dần theo `(invitedAt, id)`; chỉ người còn hiệu lực. Trả tối đa `limit + 1`. */
  listAttendeesPage(meetingId: string, page: { cursor?: { at: Date; id: string }; limit: number }): Promise<AttendeeEntity[]>;
  /** Cuộc họp tôi tham dự trong cửa sổ `[from, to]` (index `userId + meetingStartAt`), đã lọc xoá mềm. */
  listMine(userId: string, f: RangeFilter & { workspaceId?: string }): Promise<Array<{ meeting: MeetingEntity; attendee: AttendeeEntity }>>;
  /** Cuộc họp `visibility = WORKSPACE` của các workspace (không lọc người tham dự). */
  listWorkspaceVisible(workspaceIds: string[], f: RangeFilter): Promise<MeetingEntity[]>;
  /** Mọi cuộc họp của 1 workspace trong cửa sổ (OWNER/ADMIN xem metadata). */
  listByWorkspace(workspaceId: string, f: RangeFilter): Promise<MeetingEntity[]>;
  findAttendeeRows(meetingIds: string[], userId: string): Promise<AttendeeEntity[]>;
  countRsvp(meetingId: string): Promise<Record<"PENDING" | "ACCEPTED" | "DECLINED" | "TENTATIVE", number>>;
  /** SCHEDULED/LIVE chưa xoá của workspace. */
  findOpenByWorkspace(workspaceId: string): Promise<MeetingEntity[]>;
  /** SCHEDULED/LIVE của workspace mà `userId` còn là người tham dự. */
  findOpenOfUserInWorkspace(workspaceId: string, userId: string): Promise<MeetingEntity[]>;
  findScheduledBetween(from: Date, to: Date, limit: number): Promise<MeetingEntity[]>;
  /** (p2-05) Cuộc họp `LIVE` chưa xoá — cron `meeting.room-reconcile` tự sửa cuộc họp lệch với cuộc gọi. */
  findLive(limit: number): Promise<MeetingEntity[]>;

  // ── ghi ────────────────────────────────────────────────────────────────────
  /** P2002 trên `code` → `MeetingCodeConflictError`. */
  createMeeting(tx: TxHandle, m: NewMeeting): Promise<MeetingEntity>;
  createAttendees(tx: TxHandle, list: NewAttendee[]): Promise<void>;
  /**
   * CAS theo `version` (luôn +1); `null` khi lệch. `expectedVersion` bỏ trống = không kiểm (chỉ dùng trong lifecycle hệ thống).
   * `cas.statusIn` (p2-05): chỉ ghi khi trạng thái hiện tại thuộc danh sách — start/end/lock chống chạy chồng (hai người cùng bắt đầu).
   */
  updateMeeting(tx: TxHandle | undefined, id: string, expectedVersion: number | undefined, patch: MeetingPatch, cas?: { statusIn?: MeetingStatusValue[] }): Promise<MeetingEntity | null>;
  updateAttendee(tx: TxHandle | undefined, meetingId: string, userId: string, patch: AttendeePatch): Promise<AttendeeEntity | null>;
  /** (p2-05) `firstJoinedAt ??= at` — CHỈ ghi khi đang `null` (webhook `participant_joined` trùng/đảo thứ tự vô hại). `true` khi có ghi. */
  markFirstJoined(meetingId: string, userId: string, at: Date): Promise<boolean>;
  /** Cập nhật phi chuẩn hoá `meetingStartAt/EndAt/Status` cho MỌI người tham dự của cuộc họp. */
  updateAttendeesDenorm(tx: TxHandle, meetingId: string, patch: Pick<AttendeePatch, "meetingStartAt" | "meetingEndAt" | "meetingStatus">): Promise<void>;
  /** `attendeeCount += delta` CHỈ khi kết quả ≤ `max` (CAS trong 1 lệnh); luôn `version + 1`. `false` khi vượt trần. */
  adjustAttendeeCount(tx: TxHandle, id: string, delta: number, max: number): Promise<boolean>;
  /** Ghi `conversationId` chỉ khi đang `null` (CAS) — hai job đồng bộ nhóm chat song song chỉ một thắng. */
  setConversationIfUnset(id: string, conversationId: string): Promise<boolean>;
}

/** `(meetingId, userId)` trùng (P2002) — hai lượt thêm cùng một người đồng thời; service thử lại (lần sau thấy `alreadyAttending`). */
export class AttendeeConflictError extends Error {
  constructor() {
    super("Attendee unique conflict");
    this.name = "AttendeeConflictError";
  }
}
