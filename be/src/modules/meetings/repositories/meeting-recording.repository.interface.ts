import type { ConsentEntry, NewRecording, RecordingEntity, RecordingPatch, RecordingStatusValue } from "../entities/meeting-recap.interface";
import type { TxHandle } from "./tx";

export interface StuckThresholds {
  /** `STARTING` quá mốc này chưa thấy `egress_started`. (`RECORDING` không xét: ghi hình dài là bình thường, dừng theo host/hết giờ/kết thúc họp.) */
  startingBefore: Date;
  stoppingBefore: Date;
  processingBefore: Date;
}

export interface IMeetingRecordingRepository {
  findById(id: string, tx?: TxHandle): Promise<RecordingEntity | null>;
  findByEgressId(egressId: string): Promise<RecordingEntity | null>;
  /** Bản ghi ĐANG CHẠY (`STARTING`/`RECORDING`/`STOPPING`, chưa xoá) của một phiên — tối đa một. */
  findActiveByCall(callId: string, tx?: TxHandle): Promise<RecordingEntity | null>;
  /** Bản ghi chưa xoá của cuộc họp, mới → cũ. `readyOnly` = chỉ `READY` (người xem thường). */
  listByMeeting(meetingId: string, opts: { readyOnly: boolean }): Promise<RecordingEntity[]>;
  /** Số egress đang chiếm slot trên TOÀN hệ thống (`STARTING`/`RECORDING`/`STOPPING`). */
  countActive(): Promise<number>;
  /** Số bản `READY` chưa xoá theo cuộc họp. */
  readyCountsByMeeting(meetingIds: string[]): Promise<Map<string, number>>;
  /** Tổng `fileSizeBytes` của bản `READY` chưa xoá. */
  sumReadyBytes(): Promise<number>;

  /** Ghi `null` TƯỜNG MINH cho mọi trường lọc bằng `{ field: null }` (`deletedAt`, `egressId`…). */
  create(tx: TxHandle, r: NewRecording): Promise<RecordingEntity>;
  /**
   * CAS theo trạng thái (`status ∈ from`, chưa xoá) — `version + 1`; `null` khi không khớp (lượt khác đã chuyển/đã xoá). Webhook trùng/đảo thứ tự
   * vì thế vô hại.
   */
  transition(tx: TxHandle | undefined, id: string, from: readonly RecordingStatusValue[], patch: RecordingPatch): Promise<RecordingEntity | null>;
  /** Gắn `egressId` cho bản ghi đang `STARTING` CHƯA có egress (webhook tới trước khi `startRoomCompositeEgress` kịp ghi). */
  adoptEgress(id: string, egressId: string): Promise<boolean>;
  /** Thêm một người vào `consentSnapshot` khi bản ghi còn chạy và người đó CHƯA có; `true` khi có ghi. */
  pushConsent(id: string, entry: ConsentEntry): Promise<boolean>;
  /** Xoá mềm (CAS `deletedAt = null`); `null` khi đã xoá. */
  markDeleted(tx: TxHandle, id: string, at: Date, by: string | null, reason: string): Promise<RecordingEntity | null>;

  /** `READY`/`FAILED` có hạn lưu trữ đã qua, chưa xoá. */
  findExpired(now: Date, limit: number): Promise<RecordingEntity[]>;
  /** Bản ghi kẹt: `STARTING`/`RECORDING`/`STOPPING`/`PROCESSING` không đổi trạng thái quá ngưỡng. */
  findStuck(t: StuckThresholds, limit: number): Promise<RecordingEntity[]>;
}
