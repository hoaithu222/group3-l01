import { readPomodoroLimits, FALLBACK_LIMITS } from '../hooks/usePomodoroLimits';
import { graphemeLength } from '../utils/grapheme';
import { isMicLocked, isRunning, phaseHint, phaseLabelOf, phaseTone } from '../utils/phase';
import { isStaleCommand, pomodoroErrorMessage } from '../utils/pomodoro-errors';
import { apiErrorLike } from './fixtures';

describe('nhãn giai đoạn (chữ, không chỉ màu)', () => {
  it('mỗi phase có nhãn tiếng Việt riêng', () => {
    expect(phaseLabelOf('FOCUS')).toBe('Tập trung');
    expect(phaseLabelOf('SHORT_BREAK')).toBe('Nghỉ ngắn');
    expect(phaseLabelOf('LONG_BREAK')).toBe('Nghỉ dài');
    expect(phaseLabelOf('PAUSED')).toBe('Tạm dừng');
    expect(phaseLabelOf('WAITING')).toBe('Chờ bắt đầu');
  });

  it('chỉ FOCUS/SHORT_BREAK/LONG_BREAK là "đang chạy"; tông theo nhóm', () => {
    expect(['FOCUS', 'SHORT_BREAK', 'LONG_BREAK', 'PAUSED', 'WAITING', 'ENDED'].map((p) => isRunning(p as never))).toEqual([true, true, true, false, false, false]);
    expect(phaseTone('FOCUS')).toBe('focus');
    expect(phaseTone('LONG_BREAK')).toBe('break');
    expect(phaseTone('PAUSED')).toBe('paused');
    expect(phaseTone('WAITING')).toBe('idle');
  });
});

describe('phaseHint', () => {
  it('phân biệt "chủ phòng tạm dừng" với "chờ bắt đầu vòng tiếp" (hết nghỉ mà autoAdvance tắt) và phòng trống', () => {
    expect(phaseHint({ pauseReason: 'HOST', phase: 'PAUSED', phaseStartedAt: '2026-09-25T10:00:00.000Z' })).toBe('Chủ phòng đã tạm dừng');
    expect(phaseHint({ pauseReason: 'HOST', phase: 'PAUSED', phaseStartedAt: null })).toBe('Chờ chủ phòng bắt đầu vòng tập trung tiếp theo');
    expect(phaseHint({ pauseReason: 'RECOVERY', phase: 'PAUSED', phaseStartedAt: null })).toContain('khôi phục');
    expect(phaseHint({ pauseReason: 'EMPTY_ROOM', phase: 'WAITING', phaseStartedAt: null })).toContain('Phòng đang trống');
    expect(phaseHint({ pauseReason: null, phase: 'WAITING', phaseStartedAt: null })).toBe('Chủ phòng chưa bắt đầu');
    expect(phaseHint({ pauseReason: null, phase: 'FOCUS', phaseStartedAt: null })).toBeNull();
  });
});

describe('isMicLocked', () => {
  const base = { config: { hostCanSpeakInFocus: false }, hostUserId: 'host', rules: { micAllowed: false } } as never;

  it('khoá với mọi người khi tập trung; chủ phòng chỉ được miễn khi cấu hình cho phép', () => {
    expect(isMicLocked(base, 'me')).toBe(true);
    expect(isMicLocked(base, 'host')).toBe(true);
    const exempt = { config: { hostCanSpeakInFocus: true }, hostUserId: 'host', rules: { micAllowed: false } } as never;
    expect(isMicLocked(exempt, 'host')).toBe(false);
    expect(isMicLocked(exempt, 'me')).toBe(true);
  });

  it('giờ nghỉ (micAllowed) thì không khoá', () => {
    expect(isMicLocked({ config: { hostCanSpeakInFocus: false }, hostUserId: 'host', rules: { micAllowed: true } } as never, 'me')).toBe(false);
  });
});

describe('mã lỗi và giới hạn', () => {
  it('nhãn CALL_POMO_* nằm trong feature; RES_003/CALL_POMO_005 là lệnh cũ (tải lại, không báo hoảng)', () => {
    expect(pomodoroErrorMessage(apiErrorLike(403, 'CALL_POMO_004'))).toBe('Chỉ chủ phòng được thực hiện thao tác này');
    expect(pomodoroErrorMessage(apiErrorLike(409, 'CALL_POMO_003'))).toContain('chưa bắt đầu');
    expect(pomodoroErrorMessage(new Error('mạng'), 'dự phòng')).toBe('dự phòng');
    expect(isStaleCommand(apiErrorLike(409, 'RES_003'))).toBe(true);
    expect(isStaleCommand(apiErrorLike(409, 'CALL_POMO_005'))).toBe(true);
    expect(isStaleCommand(apiErrorLike(403, 'CALL_POMO_004'))).toBe(false);
  });

  it('đọc capabilities.limits.pomodoro; thiếu/sai kiểu ⇒ rơi về mặc định khớp BE', () => {
    expect(readPomodoroLimits(undefined)).toEqual(FALLBACK_LIMITS);
    const custom = readPomodoroLimits({ pomodoro: { focusMinutes: { default: 30, max: 60, min: 10 }, goalMax: 120, shortBreakMinutes: 'x' } });
    expect(custom.focusMinutes).toEqual({ default: 30, max: 60, min: 10 });
    expect(custom.goalMax).toBe(120);
    expect(custom.shortBreakMinutes).toEqual(FALLBACK_LIMITS.shortBreakMinutes);
  });

  it('đếm grapheme: emoji ghép tính MỘT ký tự (khớp BE)', () => {
    expect(graphemeLength('Học bài')).toBe(7);
    expect(graphemeLength('👨‍👩‍👧')).toBeLessThanOrEqual(3);
  });
});
