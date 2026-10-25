import type {
  MentorEndReason,
  MentorEngagement,
  MentorEngagementCreateInput,
  MentorEngagementStatus,
} from "../entities/mentor.interface";
import type { TxHandle } from "./tx";

export interface EngagementEnd {
  reason: MentorEndReason;
  by: string | null;
  at: Date;
}

export interface IMentorEngagementRepository {
  findById(id: string, tx?: TxHandle): Promise<MentorEngagement | null>;
  create(tx: TxHandle, input: MentorEngagementCreateInput): Promise<MentorEngagement>;
  findActiveByWorkspaceAndMentor(workspaceId: string, mentorId: string): Promise<MentorEngagement | null>;
  listByWorkspace(workspaceId: string, status: MentorEngagementStatus | undefined, limit: number): Promise<MentorEngagement[]>;
  listByMentor(mentorId: string, status: MentorEngagementStatus | undefined, limit: number): Promise<MentorEngagement[]>;
  /** Đợt đã chấp nhận theo đơn (trả `conversationId` cho "Đơn của tôi"). */
  findByApplicationIds(applicationIds: string[]): Promise<MentorEngagement[]>;
  /** CAS `ACTIVE` + `version` → `ENDED`. `expectedVersion` null = bỏ qua kiểm version (cron/listener). */
  end(tx: TxHandle, id: string, expectedVersion: number | null, end: EngagementEnd): Promise<boolean>;
  /** CAS `ACTIVE` + `version` → hạn mới, `totalDays`, `version+1`, reset `endingSoonNotifiedAt`. */
  extend(tx: TxHandle, id: string, expectedVersion: number, next: { endsAt: Date; totalDays: number }): Promise<boolean>;
  /** Gắn nhóm chat khi còn trống (idempotent). */
  setConversation(id: string, conversationId: string): Promise<boolean>;
  listDueToExpire(now: Date, limit: number): Promise<MentorEngagement[]>;
  /** ACTIVE, `now < endsAt ≤ until`, chưa báo "sắp hết hạn". */
  listEndingSoon(now: Date, until: Date, limit: number): Promise<MentorEngagement[]>;
  /** CAS `endingSoonNotifiedAt = null` → `at` (một lần/đợt/hạn). */
  markEndingSoonNotified(tx: TxHandle, id: string, at: Date): Promise<boolean>;
}
