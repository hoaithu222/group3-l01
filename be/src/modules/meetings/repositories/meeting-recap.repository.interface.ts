import type { NewRecap, RecapEntity, RecapPatch } from "../entities/meeting-recap.interface";
import type { TxHandle } from "./tx";

/** `meetingId` trùng (P2002) — hai lượt tạo biên bản đầu tiên cùng lúc; service đọc lại rồi coi như cập nhật (cần `expectedVersion`). */
export class RecapConflictError extends Error {
  constructor() {
    super("Recap unique conflict");
    this.name = "RecapConflictError";
  }
}

export interface IMeetingRecapRepository {
  findByMeetingId(meetingId: string, tx?: TxHandle): Promise<RecapEntity | null>;
  findById(id: string): Promise<RecapEntity | null>;
  /** Ghi `null` TƯỜNG MINH cho mọi trường công bố (Prisma+Mongo: vắng mặt ≠ null với `{ field: null }`). P2002 → `RecapConflictError`. */
  create(tx: TxHandle, r: NewRecap): Promise<RecapEntity>;
  /** CAS theo `version` (luôn +1); `null` khi lệch. */
  update(tx: TxHandle | undefined, meetingId: string, expectedVersion: number, patch: RecapPatch): Promise<RecapEntity | null>;
  /**
   * `attachmentCount += delta` CHỈ khi kết quả trong `[0, max]` (CAS trong 1 lệnh) và luôn `version + 1`; `false` khi vượt trần/không có bản ghi.
   * `max` bỏ trống = không kiểm trần trên (gỡ tệp).
   */
  adjustAttachments(tx: TxHandle, recapId: string, delta: number, max?: number): Promise<boolean>;
  setSystemMessageId(recapId: string, messageId: string): Promise<void>;
  /** Cuộc họp nào (trong `meetingIds`) đã có biên bản CÔNG BỐ. */
  publishedMeetingIds(meetingIds: string[]): Promise<Set<string>>;
}
