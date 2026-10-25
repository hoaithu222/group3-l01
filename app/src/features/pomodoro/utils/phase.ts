import type { IconName } from '@/shared/ui/icon';

import type { PomodoroPauseReason, PomodoroPhase, PomodoroSnapshot } from '../api/pomodoro.types';

/** Nhãn CHỮ của phase — không chỉ dựa vào màu (app.md p5-02 §7). */
export const PHASE_LABEL: Record<PomodoroPhase, string> = {
  ENDED: 'Đã kết thúc',
  FOCUS: 'Tập trung',
  LONG_BREAK: 'Nghỉ dài',
  PAUSED: 'Tạm dừng',
  SHORT_BREAK: 'Nghỉ ngắn',
  WAITING: 'Chờ bắt đầu',
};

const PHASE_ICON: Record<PomodoroPhase, IconName> = {
  ENDED: 'checkmark-circle',
  FOCUS: 'timer',
  LONG_BREAK: 'clock',
  PAUSED: 'pause',
  SHORT_BREAK: 'clock',
  WAITING: 'clock',
};

/** Tông màu vòng tiến độ (chọn token ở `PomodoroClock`, không viết màu thô ở đây). */
export type PhaseTone = 'break' | 'focus' | 'idle' | 'paused';

export function phaseLabelOf(phase: PomodoroPhase): string {
  return PHASE_LABEL[phase];
}

export function phaseIcon(phase: PomodoroPhase): IconName {
  return PHASE_ICON[phase];
}

export function phaseTone(phase: PomodoroPhase): PhaseTone {
  if (phase === 'FOCUS') return 'focus';
  if (phase === 'SHORT_BREAK' || phase === 'LONG_BREAK') return 'break';
  if (phase === 'PAUSED') return 'paused';
  return 'idle';
}

/** Phase đang CHẠY đồng hồ (server có `phaseEndsAt`). */
export function isRunning(phase: PomodoroPhase): boolean {
  return phase === 'FOCUS' || phase === 'SHORT_BREAK' || phase === 'LONG_BREAK';
}

export const PAUSE_REASON_TEXT: Record<PomodoroPauseReason, string> = {
  EMPTY_ROOM: 'Phòng đang trống — phiên sẽ tự kết thúc nếu không ai quay lại',
  HOST: 'Chủ phòng đã tạm dừng',
  RECOVERY: 'Phiên được khôi phục sau sự cố — chủ phòng bấm tiếp tục để chạy lại giai đoạn này',
};

/**
 * Dòng phụ dưới nhãn phase: vì sao đang dừng / đang chờ gì. Hết giờ nghỉ mà `autoAdvance` tắt thì BE dừng ở ĐẦU vòng tập trung kế
 * (`PAUSED`, `pauseReason HOST`, `phaseStartedAt null`) — câu chữ khác với "chủ phòng vừa bấm tạm dừng" giữa vòng.
 */
export function phaseHint(s: Pick<PomodoroSnapshot, 'pauseReason' | 'phase' | 'phaseStartedAt'>): string | null {
  if (s.pauseReason === 'EMPTY_ROOM') return PAUSE_REASON_TEXT.EMPTY_ROOM;
  if (s.phase === 'WAITING') return 'Chủ phòng chưa bắt đầu';
  if (s.phase !== 'PAUSED') return null;
  if (s.pauseReason === 'HOST' && s.phaseStartedAt === null) return 'Chờ chủ phòng bắt đầu vòng tập trung tiếp theo';
  return s.pauseReason ? PAUSE_REASON_TEXT[s.pauseReason] : 'Đang tạm dừng';
}

/** "25 phút tập trung · 5 nghỉ ngắn · 15 nghỉ dài · 4 vòng" — cấu hình chu kỳ ở preview. */
export function describeConfig(c: PomodoroSnapshot['config']): string {
  return `${c.focusMinutes} phút tập trung · ${c.shortBreakMinutes} nghỉ ngắn · ${c.longBreakMinutes} nghỉ dài · ${c.cyclesBeforeLongBreak} vòng`;
}

/**
 * Mic bị khoá với TÔI không: server nói giai đoạn khoá mic (`rules.micAllowed = false`: tập trung, kể cả tạm dừng giữa vòng) TRỪ khi tôi là chủ
 * phòng và cấu hình cho chủ phòng được nói (`hostCanSpeakInFocus`) — khớp `isHostExempt` ở BE. Chỉ để UI nói rõ lý do; thực thi thật ở máy chủ media.
 */
export function isMicLocked(
  s: Pick<PomodoroSnapshot, 'config' | 'hostUserId' | 'rules'>,
  myId: string | undefined,
): boolean {
  const exempt = s.config.hostCanSpeakInFocus && myId !== undefined && s.hostUserId === myId;
  return !s.rules.micAllowed && !exempt;
}
