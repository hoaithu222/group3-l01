import type { MessagePollView } from "../../../shared/ports/message-poll-reader.port";
import type { PollCloseReason, PollEntity, PollStatus, PollUpdatedPayload } from "../entities/chat-extensions.types";

export interface PollViewContext {
  /** `null` khi dựng bản dùng chung (không có người xem cụ thể). */
  viewerId: string | null;
  /** Lựa chọn của CHÍNH người xem (rỗng khi chưa bầu / không có người xem). */
  myOptionIds: string[];
  /** Người xem là moderator của phạm vi (kênh `manage`, nhóm OWNER/ADMIN). */
  canModerate: boolean;
  now: Date;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Trạng thái HIỆU LỰC: quá `closesAt` mà job đóng chưa chạy thì hiển thị đã đóng (`EXPIRED`) ngay — người dùng không thấy khảo sát "còn mở" nhưng bầu bị từ chối `POLL_004`.
 * Bản ghi trong DB được job `poll.close`/cron quét bù chuyển sang `CLOSED` thật.
 */
export function effectiveState(poll: Pick<PollEntity, "status" | "closesAt" | "closeReason">, now: Date): { status: PollStatus; closeReason: PollCloseReason | null } {
  if (poll.status === "OPEN" && poll.closesAt && poll.closesAt.getTime() <= now.getTime()) return { status: "CLOSED", closeReason: "EXPIRED" };
  return { status: poll.status, closeReason: poll.closeReason };
}

/**
 * Khảo sát cho MỘT người xem. Quyền riêng tư (POLL-03): KHÔNG có `userId` của bất kỳ ai ở mọi nhánh; `myOptionIds` chỉ của chính người xem; `canViewVoters = false` khi ẩn danh
 * (kể cả với người tạo). Phần trăm tính trên số NGƯỜI đã bầu (`voterCount`) — chọn nhiều đáp án thì tổng có thể vượt 100.
 */
export function toPollView(poll: PollEntity, ctx: PollViewContext): MessagePollView {
  const state = effectiveState(poll, ctx.now);
  const isCreator = ctx.viewerId !== null && poll.createdBy === ctx.viewerId;
  return {
    id: poll.id,
    messageId: poll.messageId,
    scopeType: poll.scopeType,
    scopeId: poll.scopeId,
    question: poll.question,
    multi: poll.multi,
    anonymous: poll.anonymous,
    closesAt: poll.closesAt,
    status: state.status,
    closeReason: state.closeReason,
    options: poll.options.map((o) => ({ id: o.id, text: o.text, voteCount: o.voteCount, percent: poll.voterCount > 0 ? round1((o.voteCount / poll.voterCount) * 100) : 0 })),
    voterCount: poll.voterCount,
    myOptionIds: ctx.viewerId ? ctx.myOptionIds : [],
    canClose: state.status === "OPEN" && ctx.viewerId !== null && (isCreator || ctx.canModerate),
    canViewVoters: !poll.anonymous && ctx.viewerId !== null,
    version: poll.version,
  };
}

/** Payload `poll:updated` phát cả phòng — chỉ số đếm, KHÔNG `userId`/`myOptionIds`; client tự dựng phần trăm. */
export function toPollUpdatedPayload(poll: PollEntity): PollUpdatedPayload {
  return {
    pollId: poll.id,
    messageId: poll.messageId,
    scopeType: poll.scopeType,
    scopeId: poll.scopeId,
    status: poll.status,
    closeReason: poll.closeReason,
    options: poll.options.map((o) => ({ id: o.id, voteCount: o.voteCount })),
    voterCount: poll.voterCount,
    version: poll.version,
  };
}
