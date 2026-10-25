import type { PomodoroMyActions, PomodoroSnapshot } from '../api/pomodoro.types';
import { isRunning } from './phase';

/**
 * Gộp snapshot mới (`pomodoro:updated` hoặc REST) vào bản đang giữ — hàm THUẦN.
 *
 * ── Ba luật ──────────────────────────────────────────────────────────────────
 * 1. Bản CŨ hơn bị bỏ: cùng phiên thì so `version` (bằng nhau thì so `serverNow` — đổi người trong phòng/mục tiêu KHÔNG tăng `version`); khác
 *    phiên thì so `serverNow`. REST chậm hơn socket không được ghi đè bản mới.
 * 2. Gói socket là bản CHUNG cả phòng (không `myGoal`/`myActions`): giữ `myGoal` cũ, còn `myActions` TÍNH LẠI từ phase + chủ phòng theo đúng
 *    bảng của BE (`pomodoro-snapshot.ts#actions`) để nút chủ phòng đổi ngay theo phase mà không đợi một lượt REST. BE vẫn là nơi chặn cuối
 *    (lệnh sai phase → `CALL_POMO_005`, sai người → `CALL_POMO_004`).
 * 3. Bản REST (có `myActions`) là nguồn sự thật cho `myGoal`/`myActions`.
 */
export function isOlder(prev: PomodoroSnapshot, next: PomodoroSnapshot): boolean {
  const gap = Date.parse(next.serverNow) - Date.parse(prev.serverNow);
  if (prev.sessionId !== next.sessionId) return gap < 0;
  return next.version < prev.version || (next.version === prev.version && gap < 0);
}

/** Tôi có `manage` kênh không — suy từ `myActions` của bản REST gần nhất (BE không gửi cờ này riêng). */
function wasManager(prev: PomodoroSnapshot | undefined, myId: string | undefined): boolean {
  const actions = prev?.myActions;
  if (!prev || !actions) return false;
  // Chưa có phiên: `canConfigure` = kênh mở && manage. Có phiên: `canEnd` = chủ phòng || manage.
  if (prev.sessionId === null) return actions.canConfigure;
  return actions.canEnd && !(myId !== undefined && prev.hostUserId === myId);
}

export function deriveMyActions(
  prev: PomodoroSnapshot | undefined,
  next: PomodoroSnapshot,
  myId: string | undefined,
): PomodoroMyActions | undefined {
  const base = prev?.myActions;
  if (!base) return undefined;
  const manager = wasManager(prev, myId);
  const host = myId !== undefined && next.hostUserId === myId;
  const open = base.joinBlockedReason !== 'ARCHIVED';
  const hasSession = next.sessionId !== null;
  const running = isRunning(next.phase);
  return {
    ...base,
    canConfigure: open && ((!hasSession && manager) || (next.phase === 'WAITING' && host)),
    canEnd: hasSession && next.phase !== 'ENDED' && (host || manager),
    canPause: host && running,
    canResume: host && next.phase === 'PAUSED',
    canSkip: host && running,
    canStart: open && (!hasSession || (next.phase === 'WAITING' && host)),
  };
}

export function mergeSnapshot(
  prev: PomodoroSnapshot | undefined,
  next: PomodoroSnapshot,
  myId: string | undefined,
): PomodoroSnapshot {
  if (prev && isOlder(prev, next)) return prev;
  if (next.myActions) return next;
  const sameSession = prev !== undefined && prev.sessionId === next.sessionId;
  return { ...next, myActions: deriveMyActions(prev, next, myId), myGoal: sameSession ? (prev?.myGoal ?? null) : null };
}

/**
 * Sự kiện có làm `myActions` suy ra ở client có thể SAI không (đổi chủ phòng, sang/hết phiên, kết thúc)? Có ⇒ tải lại REST (có jitter) để
 * lấy `myActions` chính thống; đổi phase thường (tập trung ↔ nghỉ) thì bảng suy ra là đủ nên KHÔNG tốn thêm request nào.
 */
export function needsReconcile(prev: PomodoroSnapshot | undefined, next: PomodoroSnapshot): boolean {
  if (!prev) return false;
  return (
    prev.sessionId !== next.sessionId ||
    prev.hostUserId !== next.hostUserId ||
    (next.phase === 'ENDED' && prev.phase !== 'ENDED')
  );
}
