import type { CallModeValue, CallScopeTypeValue, CallStatusValue, MeetingStatusValue } from "../entities/admin-media.types";
import type { TxHandle } from "./tx";

/** Cuộc họp tối thiểu cho force-end (đọc TRONG transaction để `version` khớp với `dedupeKey`). */
export interface ForceEndMeeting {
  id: string;
  title: string;
  workspaceId: string;
  status: MeetingStatusValue;
  version: number;
  currentCallId: string | null;
}

export interface ForceEndCall {
  id: string;
  scopeType: CallScopeTypeValue;
  scopeId: string;
  mode: CallModeValue;
  status: CallStatusValue;
  workspaceId: string | null;
  peakParticipants: number;
  version: number;
}

/** CHỈ đọc — hành động ghi đi qua outbox tới consumer của module sở hữu (`meetings` / `calls`). */
export interface IMediaOpsForceEndRepository {
  loadMeeting(id: string, tx: TxHandle): Promise<ForceEndMeeting | null>;
  loadCall(id: string, tx: TxHandle): Promise<ForceEndCall | null>;
  connectedCount(callId: string, tx: TxHandle): Promise<number>;
  /** Yêu cầu force-end cùng `dedupeKey` đã được ghi (bấm hai lần khi version chưa đổi). */
  outboxExists(dedupeKey: string, tx: TxHandle): Promise<boolean>;
  /** `true` khi lỗi là vi phạm unique (`P2002`) — hai yêu cầu đồng thời cùng `dedupeKey`. */
  isDuplicateError(err: unknown): boolean;
}
