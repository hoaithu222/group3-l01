import type { FanoutReason, PushSkipReason } from "../entities/message-notification.types";
import type { EffectiveMessagePreference } from "./preference-matrix";

export interface PushDecisionInput {
  /** Cờ `push` bật (runtime `features`/env) — tắt → không gửi gì, inbox/unread vẫn chạy (NT-06). */
  pushEnabled: boolean;
  pref: EffectiveMessagePreference;
  reason: FanoutReason;
  /** Người nhận đã chặn tác giả (`BlockPort.filterNotificationRecipients` loại họ — NT-14). */
  blocked: boolean;
  /** Người nhận đang xem đúng luồng ở foreground (`viewing:<u>:<scopeKey>` — NT-09). */
  viewing: boolean;
}

export type PushDecision = { send: true } | { send: false; reason: PushSkipReason };

/**
 * Quyết định push từng người (be.md §5.5) — thứ tự kiểm cố định, cái đầu tiên chặn được ghi làm lý do:
 * disabled → muted (cả mention, NT-04) → mode (`MENTIONS` + tin thường) → dnd → blocked → viewing.
 * Đầu vào `viewing` là boolean đã tính sẵn để hàm thuần; nơi gọi chỉ tra Redis cho người vượt qua các bước trước.
 */
export function decidePush(input: PushDecisionInput): PushDecision {
  const { pushEnabled, pref, reason, blocked, viewing } = input;
  if (!pushEnabled) return { send: false, reason: "disabled" };
  if (pref.mode === "MUTED") return { send: false, reason: "muted" };
  if (pref.mode === "MENTIONS" && reason === "MESSAGE") return { send: false, reason: "mode" };
  if (pref.dnd) return { send: false, reason: "dnd" };
  if (blocked) return { send: false, reason: "blocked" };
  if (viewing) return { send: false, reason: "viewing" };
  return { send: true };
}

/** Các bước không cần I/O — nơi gọi dùng để KHÔNG tra Redis `viewing` cho người đã bị chặn bởi bước rẻ hơn. */
export function needsViewingCheck(input: Omit<PushDecisionInput, "viewing">): boolean {
  return decidePush({ ...input, viewing: false }).send;
}
