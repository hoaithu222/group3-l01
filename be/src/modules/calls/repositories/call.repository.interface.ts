import type {
  CallEntity,
  CallHistoryFilter,
  CallParticipantEntity,
  CallParticipantStateValue,
  CallPatch,
  CallScopeTypeValue,
  CallStatusValue,
  NewCall,
  NewParticipant,
  ParticipantPatch,
} from "../entities/call.interface";
import type { TxHandle } from "./tx";

/** Điều kiện compare-and-set — không khớp ⇒ hàm ghi trả `null` (service đọc lại rồi xử lý lại). */
export interface CallCas {
  version?: number;
  /** p2-03 failover: chỉ ghi khi chủ phòng hiện tại còn là `hostId` này (job failover song song → một thắng). */
  hostId?: string | null;
  status?: CallStatusValue[];
  statusNot?: CallStatusValue;
}

export interface ParticipantCas {
  version?: number;
  stateIn?: CallParticipantStateValue[];
}

/** `activeKey` (hoặc `livekitRoom`) trùng — cuộc gọi khác đang chiếm phạm vi / tên phòng (P2002). */
export class CallActiveConflictError extends Error {
  constructor(readonly field: "activeKey" | "clientCallId" | "other") {
    super(`Call unique conflict: ${field}`);
    this.name = "CallActiveConflictError";
  }
}

export interface ICallRepository {
  // ── đọc ────────────────────────────────────────────────────────────────────
  findById(id: string, tx?: TxHandle): Promise<CallEntity | null>;
  findByIds(ids: string[]): Promise<CallEntity[]>;
  findByInitiatorClientId(initiatorId: string, clientCallId: string): Promise<CallEntity | null>;
  findParticipants(callId: string, tx?: TxHandle): Promise<CallParticipantEntity[]>;
  /** Participant của nhiều cuộc gọi trong 1 truy vấn (xem trước lịch sử) — nhóm theo `callId` ở nơi gọi. */
  findParticipantsOf(callIds: string[]): Promise<CallParticipantEntity[]>;
  findParticipant(callId: string, userId: string, tx?: TxHandle): Promise<CallParticipantEntity | null>;
  /** Người dùng đang ở (hoặc đang được gọi tới) cuộc gọi chưa kết thúc — trạng thái INVITED..RECONNECTING. */
  findOpenParticipations(userId: string): Promise<Array<{ call: CallEntity; participant: CallParticipantEntity }>>;
  /** Lịch sử theo `(callStartedAt, id)` giảm dần; `missed` = MISSED + BUSY. Trả tối đa `limit + 1` để biết còn nữa không. */
  listHistory(userId: string, filter: CallHistoryFilter): Promise<CallParticipantEntity[]>;
  findRingingStartedBefore(cutoff: Date, limit: number): Promise<CallEntity[]>;
  findActiveNotReconciledSince(cutoff: Date, limit: number): Promise<CallEntity[]>;
  findOpenByScope(scopeType: CallScopeTypeValue, scopeIds: string[]): Promise<CallEntity[]>;
  findOpenByWorkspace(workspaceId: string): Promise<CallEntity[]>;
  /** Mọi cuộc gọi chưa kết thúc mà user còn tham gia (dùng khi khoá tài khoản/thu hồi quyền). */
  findOpenCallsOfUser(userId: string): Promise<CallEntity[]>;
  countOpenByMode(): Promise<{ RING: number; ROOM: number }>;

  // ── ghi (nhận `tx` khi nằm trong transaction) ──────────────────────────────
  createCall(tx: TxHandle, call: NewCall): Promise<CallEntity>;
  createParticipants(tx: TxHandle, list: NewParticipant[]): Promise<void>;
  /** CAS `Call`: ghi khi khớp `cas`, luôn `version + 1`; `null` khi không khớp. */
  updateCall(tx: TxHandle | undefined, id: string, cas: CallCas, patch: CallPatch): Promise<CallEntity | null>;
  /** Ghi `lastReconciledAt`/`peakParticipants` KHÔNG tăng `version` (đối soát chạy dồn dập; `version` là mốc của host action — p2-03). */
  touchCall(id: string, patch: Pick<CallPatch, "lastReconciledAt" | "peakParticipants">): Promise<void>;
  /** CAS participant theo `(callId, userId)`; luôn `version + 1`; `null` khi không khớp. */
  updateParticipant(
    tx: TxHandle | undefined,
    callId: string,
    userId: string,
    cas: ParticipantCas,
    patch: ParticipantPatch
  ): Promise<CallParticipantEntity | null>;
}
