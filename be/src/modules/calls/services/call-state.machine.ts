import type {
  CallEndReasonValue,
  CallEntity,
  CallOutcomeValue,
  CallParticipantEntity,
  CallParticipantStateValue,
} from "../entities/call.interface";

/**
 * Máy trạng thái THUẦN của cuộc gọi (p2-01 be.md §5.7, §7, phụ lục) — không I/O, không đồng hồ ẩn: mọi hàm nhận
 * dữ liệu MỚI NHẤT và trả quyết định; service quyết định ghi/khoá. Test table-driven ở `tests/call-state.machine.test.ts`.
 */

/** Đã vào (đang kết nối) phòng media. */
export const CONNECTED_LIKE: readonly CallParticipantStateValue[] = ["JOINING", "CONNECTED", "RECONNECTING"];
/** Đang chờ trả lời. */
export const RINGING_LIKE: readonly CallParticipantStateValue[] = ["INVITED", "RINGING"];
/** Chưa có kết quả cuối (được phép trả lời/từ chối/vào lại). */
export const REJOINABLE: readonly CallParticipantStateValue[] = ["LEFT", "DECLINED", "MISSED"];

export const isConnectedLike = (s: CallParticipantStateValue): boolean => CONNECTED_LIKE.includes(s);
export const isRingingLike = (s: CallParticipantStateValue): boolean => RINGING_LIKE.includes(s);

export type EndDecision =
  | { action: "NONE" }
  | { action: "END"; reason: CallEndReasonValue }
  /** Nhóm còn đúng 1 người: chờ `reconnectGraceSeconds` rồi kiểm lại (be.md §5.7). */
  | { action: "GRACE" };

/** 1-1: chỉ có đúng 1 người được mời (kể cả nhóm 2 người) — suy từ dữ liệu để job không cần biết loại hội thoại. */
export function isOneToOne(call: Pick<CallEntity, "mode" | "invitedCount">): boolean {
  return call.mode === "RING" && call.invitedCount <= 1;
}

/**
 * `evaluateEnd` (be.md §5.7). Chỉ áp cho `mode = RING` — phòng ROOM (kênh/họp) kết thúc theo `room_finished`/host/empty
 * (p2-03/p2-05), không theo số người.
 */
export function evaluateEnd(
  call: Pick<CallEntity, "status" | "mode" | "invitedCount" | "answeredAt">,
  participants: ReadonlyArray<Pick<CallParticipantEntity, "role" | "state">>
): EndDecision {
  if (call.status === "ENDED" || call.mode !== "RING") return { action: "NONE" };

  const ringing = participants.filter((p) => isRingingLike(p.state)).length;
  const connected = participants.filter((p) => isConnectedLike(p.state)).length;

  if (!call.answeredAt && ringing === 0) {
    const invitees = participants.filter((p) => p.role !== "INITIATOR");
    const allDeclined =
      invitees.length > 0 &&
      invitees.every((p) => p.state === "DECLINED" || p.state === "BUSY") &&
      invitees.some((p) => p.state === "DECLINED");
    return { action: "END", reason: allDeclined ? "DECLINED" : "NO_ANSWER" };
  }

  if (isOneToOne(call)) {
    if (call.answeredAt && connected < 2) return { action: "END", reason: "COMPLETED" };
    return { action: "NONE" };
  }

  if (connected === 0 && ringing === 0) return { action: "END", reason: "COMPLETED" };
  if (connected === 1 && ringing === 0) return { action: "GRACE" };
  return { action: "NONE" };
}

/**
 * Mốc cuối cùng phòng ROOM còn người (người cuối rời; chưa ai rời → lúc bắt đầu). Phòng đóng vì trống (`EMPTY`) tính thời lượng
 * tới mốc này, KHÔNG cộng thời gian chờ tự đóng (5 phút) — "Phòng thoại đã kết thúc · 25 phút" phải là thời gian nói chuyện thật.
 */
export function roomLastActivityAt(
  call: Pick<CallEntity, "startedAt" | "answeredAt">,
  participants: ReadonlyArray<Pick<CallParticipantEntity, "lastLeftAt">>
): Date {
  let last = call.answeredAt ?? call.startedAt;
  for (const p of participants) if (p.lastLeftAt && p.lastLeftAt.getTime() > last.getTime()) last = p.lastLeftAt;
  return last;
}

export type RoomClosure = { action: "NONE" } | { action: "END"; reason: "ARCHIVED" | "EMPTY" };

/**
 * Bảo đảm đóng phòng ROOM khi webhook LiveKit (`room_finished`, luồng chính) bị mất (be.md §5.9, "recovery bảo đảm"): phạm vi đã lưu
 * trữ → `ARCHIVED`; không còn ai (kể cả `JOINING`) quá `emptyRoomEndMs` kể từ lúc người cuối rời → `EMPTY`. Hàm thuần — nhận dữ
 * liệu MỚI NHẤT, service quyết định ghi.
 */
export function evaluateRoomClosure(
  call: Pick<CallEntity, "status" | "mode" | "startedAt" | "answeredAt">,
  participants: ReadonlyArray<Pick<CallParticipantEntity, "state" | "lastLeftAt">>,
  now: Date,
  opts: { scopeOpen: boolean; emptyRoomEndMs: number }
): RoomClosure {
  if (call.status === "ENDED" || call.mode !== "ROOM") return { action: "NONE" };
  if (!opts.scopeOpen) return { action: "END", reason: "ARCHIVED" };
  if (participants.some((p) => isConnectedLike(p.state))) return { action: "NONE" };
  return now.getTime() - roomLastActivityAt(call, participants).getTime() >= opts.emptyRoomEndMs ? { action: "END", reason: "EMPTY" } : { action: "NONE" };
}

/** Trạng thái participant sau khi cuộc gọi kết thúc (be.md §5.7 bước 2). */
export function stateAfterEnd(state: CallParticipantStateValue): CallParticipantStateValue {
  if (isRingingLike(state)) return "MISSED";
  if (isConnectedLike(state)) return "LEFT";
  return state;
}

/**
 * Kết quả theo GÓC NHÌN từng người (be.md §2 Prisma ghi chú): người gọi chưa ai nhận → `OUTGOING_UNANSWERED` (huỷ →
 * `CANCELLED`); người được gọi bỏ lỡ → `MISSED`; đã nói chuyện → `COMPLETED`; từ chối → `DECLINED`; bận → `BUSY`.
 * `stateBefore` là trạng thái TRƯỚC `stateAfterEnd`.
 */
export function computeOutcome(
  call: Pick<CallEntity, "answeredAt" | "initiatorId" | "mode">,
  participant: Pick<CallParticipantEntity, "userId" | "role" | "firstJoinedAt" | "respondedAt">,
  stateBefore: CallParticipantStateValue,
  reason: CallEndReasonValue
): CallOutcomeValue | null {
  if (participant.role === "INITIATOR" || participant.userId === call.initiatorId) {
    if (call.answeredAt) return "COMPLETED";
    if (reason === "CANCELLED") return "CANCELLED";
    return "OUTGOING_UNANSWERED";
  }
  if (stateBefore === "DECLINED") return "DECLINED";
  if (stateBefore === "BUSY") return "BUSY";
  if (stateBefore === "REMOVED") return participant.firstJoinedAt ? "COMPLETED" : null;
  if (isConnectedLike(stateBefore) || stateBefore === "LEFT" || participant.respondedAt || participant.firstJoinedAt) {
    return "COMPLETED";
  }
  return call.mode === "ROOM" ? null : "MISSED";
}

/** `status` trong payload tin `CALL_SUMMARY` (schema thật của `messages` dùng UPPER_SNAKE — be.md §7 bảng). */
export type SummaryStatus = "COMPLETED" | "MISSED" | "DECLINED" | "NO_ANSWER" | "BUSY" | "CANCELLED";

export function summaryStatusOf(reason: CallEndReasonValue, answered: boolean): SummaryStatus {
  switch (reason) {
    case "COMPLETED":
    case "HOST_ENDED":
      return "COMPLETED";
    case "NO_ANSWER":
      return "NO_ANSWER";
    case "CANCELLED":
      return "CANCELLED";
    case "DECLINED":
      return "DECLINED";
    case "BUSY":
      return "BUSY";
    default:
      // FAILED, REVOKED, ARCHIVED, FORCE_ENDED, EMPTY, MAX_DURATION
      return answered ? "COMPLETED" : "MISSED";
  }
}

/** Số giây kết nối cộng thêm khi rời/kết thúc (từ `lastJoinedAt`), không âm. */
export function connectedSecondsSince(lastJoinedAt: Date | null, now: Date): number {
  if (!lastJoinedAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - lastJoinedAt.getTime()) / 1000));
}

/** Thời lượng cuộc gọi tính từ lúc có người trả lời (0 nếu chưa ai trả lời). */
export function durationSecOf(answeredAt: Date | null, now: Date): number {
  if (!answeredAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - answeredAt.getTime()) / 1000));
}

/**
 * "Cuộc gọi thật" khi khoá Redis còn (README §2): chưa ENDED và còn người đang kết nối/đang đổ chuông. Cuộc còn
 * `RINGING` quá `staleRingMs` (worker chết, job timeout không chạy) coi là mồ côi — recovery sẽ kết thúc nó.
 * (Khác README một chút: tính cả người gọi đang kết nối để không "giết" phòng mà chỉ còn người gọi trong grace.)
 */
export function isRealCall(
  call: Pick<CallEntity, "status" | "startedAt">,
  participants: ReadonlyArray<Pick<CallParticipantEntity, "state">>,
  now: Date,
  staleRingMs: number
): boolean {
  if (call.status === "ENDED") return false;
  if (call.status === "RINGING" && now.getTime() - call.startedAt.getTime() > staleRingMs) return false;
  return participants.some((p) => isConnectedLike(p.state) || isRingingLike(p.state));
}
