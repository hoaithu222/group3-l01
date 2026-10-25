import type { IMeetingRepository } from "../repositories/meeting.repository.interface";
import type { IMeetingDirectory } from "../repositories/meeting-directory.reader";
import type { IMeetingRecapRepository } from "../repositories/meeting-recap.repository.interface";
import type { IMeetingRecordingRepository } from "../repositories/meeting-recording.repository.interface";
import type { IOutboxPort, ITxRunner } from "../repositories/tx";

export interface AuditPort {
  record(input: {
    actorId: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    workspaceId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface MeetingRuntimeLimits {
  attendeesMax: number;
  remindersMax: number;
  joinWindowMinutes: number;
  maxParticipants: number;
  maxMinutes: number;
  /** Độ dài tối đa (grapheme) của tiêu đề/nội dung — bỏ trống = `LIMITS.meeting` (override tuỳ chọn qua `limits.meeting` của SystemConfig). */
  titleMax?: number;
  agendaMax?: number;
  /** Cửa sổ "bắt đầu lại" sau `endAt` (phút) cho `myActions.canStart`; bỏ trống = `LIMITS.meeting`. */
  restartWindowMinutes?: number;
}

/** Phát socket tức thời (không qua outbox) cho việc mất cũng không sao — vd RSVP → chủ trì. */
export interface MeetingEmitter {
  toUsers(userIds: string[], event: string, payload: object): void;
  toRoom(room: string, event: string, payload: object): void;
  leaveRooms(userIds: string[], rooms: string[]): void;
}

/** Phụ thuộc chung của mọi service cuộc họp (DI thủ công — `meetings.container.ts`). */
export interface MeetingDeps {
  repo: IMeetingRepository;
  dir: IMeetingDirectory;
  /** (p2-06) Biên bản họp và bản ghi hình — cần ở phòng họp (token khi đang ghi, ảnh chụp phòng) và chi tiết cuộc họp (cờ `myActions`). */
  recaps: IMeetingRecapRepository;
  recordings: IMeetingRecordingRepository;
  tx: ITxRunner;
  outbox: IOutboxPort;
  audit: AuditPort;
  emitter: MeetingEmitter;
  limits: () => Promise<MeetingRuntimeLimits>;
  now: () => Date;
}
