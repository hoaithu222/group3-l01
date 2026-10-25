import type { PomodoroMyActions } from '../api/pomodoro.types';
import { deriveMyActions, isOlder, mergeSnapshot, needsReconcile } from '../utils/snapshot';
import { focusSnapshot, HOST_ID, makeSnapshot, ME_ID, NO_ACTIONS, SERVER_NOW } from './fixtures';

/**
 * Gộp snapshot socket vào cache: bản cũ bị bỏ, gói socket (bản CHUNG cả phòng) giữ `myGoal` và TÍNH LẠI `myActions` theo phase + chủ phòng — khớp bảng của BE.
 */

const later = (ms: number) => new Date(SERVER_NOW + ms).toISOString();
const hostActions: PomodoroMyActions = { ...NO_ACTIONS, canEnd: true, canPause: true, canSkip: true };

describe('isOlder / mergeSnapshot — thứ tự', () => {
  it('cùng phiên: version thấp hơn bị bỏ; bằng nhau thì so serverNow (đổi người/mục tiêu không tăng version)', () => {
    const prev = focusSnapshot(600_000, { version: 5 });
    expect(isOlder(prev, focusSnapshot(600_000, { version: 4, serverNow: later(1000) }))).toBe(true);
    expect(isOlder(prev, focusSnapshot(600_000, { version: 5, serverNow: later(-1) }))).toBe(true);
    expect(isOlder(prev, focusSnapshot(600_000, { version: 5, serverNow: later(1000) }))).toBe(false);
    expect(isOlder(prev, focusSnapshot(600_000, { version: 6, serverNow: later(-5000) }))).toBe(false);
  });

  it('khác phiên: so serverNow (phiên mới có version thấp vẫn được nhận nếu MỚI hơn)', () => {
    const prev = focusSnapshot(600_000, { version: 9, sessionId: 's1' });
    expect(isOlder(prev, focusSnapshot(600_000, { sessionId: 's2', serverNow: later(1000), version: 1 }))).toBe(false);
    expect(isOlder(prev, focusSnapshot(600_000, { sessionId: 's0', serverNow: later(-1000), version: 99 }))).toBe(true);
  });

  it('bản cũ ⇒ trả NGUYÊN bản đang giữ (cùng tham chiếu)', () => {
    const prev = focusSnapshot(600_000, { version: 5 });
    expect(mergeSnapshot(prev, focusSnapshot(600_000, { version: 4 }), ME_ID)).toBe(prev);
  });
});

describe('mergeSnapshot — gói socket', () => {
  it('giữ `myGoal` cũ cùng phiên; sang phiên khác thì bỏ', () => {
    const prev = focusSnapshot(600_000, { myActions: hostActions, myGoal: { shared: true, text: 'xong chương 3' } });
    const same = mergeSnapshot(prev, { ...focusSnapshot(590_000, { serverNow: later(10_000), version: 3 }), myActions: undefined, myGoal: undefined }, ME_ID);
    expect(same.myGoal).toEqual({ shared: true, text: 'xong chương 3' });
    const other = mergeSnapshot(prev, { ...focusSnapshot(590_000, { serverNow: later(10_000), sessionId: 's2', version: 1 }), myActions: undefined, myGoal: undefined }, ME_ID);
    expect(other.myGoal).toBeNull();
  });

  it('bản REST (có myActions) là nguồn sự thật — dùng nguyên', () => {
    const rest = focusSnapshot(590_000, { myActions: { ...NO_ACTIONS, canEnd: true }, serverNow: later(10_000), version: 3 });
    expect(mergeSnapshot(focusSnapshot(600_000, { myActions: hostActions }), rest, ME_ID)).toBe(rest);
  });

  it('WAITING → FOCUS → SHORT_BREAK: nút chủ phòng đổi ngay theo phase mà không cần REST', () => {
    const waiting = makeSnapshot({
      hostUserId: ME_ID,
      myActions: { ...NO_ACTIONS, canConfigure: true, canEnd: true, canStart: true },
      phase: 'WAITING',
      sessionId: 's1',
      version: 1,
    });
    const focus = mergeSnapshot(waiting, { ...focusSnapshot(1_500_000, { hostUserId: ME_ID, serverNow: later(1000), version: 2 }), myActions: undefined }, ME_ID);
    expect(focus.myActions).toMatchObject({ canConfigure: false, canPause: true, canResume: false, canSkip: true, canStart: false });
    const paused = mergeSnapshot(focus, { ...focusSnapshot(0, { hostUserId: ME_ID, phase: 'PAUSED', phaseEndsAt: null, remainingMs: 600_000, serverNow: later(2000), version: 3 }), myActions: undefined }, ME_ID);
    expect(paused.myActions).toMatchObject({ canPause: false, canResume: true, canSkip: false });
    const ended = mergeSnapshot(paused, { ...makeSnapshot({ hostUserId: ME_ID, phase: 'ENDED', serverNow: later(3000), sessionId: 's1', version: 4 }), myActions: undefined }, ME_ID);
    expect(ended.myActions).toMatchObject({ canEnd: false, canPause: false, canResume: false, canSkip: false, canStart: false });
  });
});

describe('deriveMyActions', () => {
  it('người KHÔNG phải chủ phòng không có nút điều khiển nào (chỉ có thể kết thúc nếu là quản lý kênh)', () => {
    const prev = focusSnapshot(600_000, { myActions: { ...NO_ACTIONS } });
    const next = focusSnapshot(590_000, { serverNow: later(10_000), version: 3 });
    expect(deriveMyActions(prev, next, ME_ID)).toMatchObject({ canEnd: false, canPause: false, canResume: false, canSkip: false, canStart: false });
    const manager = focusSnapshot(600_000, { myActions: { ...NO_ACTIONS, canEnd: true } });
    expect(deriveMyActions(manager, next, ME_ID)?.canEnd).toBe(true);
  });

  it('chưa từng có bản REST ⇒ không suy (để REST quyết); kênh lưu trữ ⇒ không mở được Bắt đầu/Cấu hình', () => {
    expect(deriveMyActions(undefined, focusSnapshot(1), ME_ID)).toBeUndefined();
    const archived = makeSnapshot({ myActions: { ...NO_ACTIONS, canJoin: false, joinBlockedReason: 'ARCHIVED' } });
    const next = makeSnapshot({ serverNow: later(1000) });
    expect(deriveMyActions(archived, next, ME_ID)).toMatchObject({ canConfigure: false, canStart: false });
  });
});

describe('needsReconcile', () => {
  const prev = focusSnapshot(600_000, { hostUserId: HOST_ID, sessionId: 's1' });

  it('đổi chủ phòng / sang phiên khác / vừa kết thúc ⇒ tải lại REST; đổi phase thường thì không', () => {
    expect(needsReconcile(prev, focusSnapshot(600_000, { hostUserId: ME_ID }))).toBe(true);
    expect(needsReconcile(prev, focusSnapshot(600_000, { sessionId: 's2' }))).toBe(true);
    expect(needsReconcile(prev, makeSnapshot({ hostUserId: HOST_ID, phase: 'ENDED', sessionId: 's1' }))).toBe(true);
    expect(needsReconcile(prev, focusSnapshot(0, { hostUserId: HOST_ID, phase: 'SHORT_BREAK' }))).toBe(false);
    expect(needsReconcile(undefined, prev)).toBe(false);
  });
});
