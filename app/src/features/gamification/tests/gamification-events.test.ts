import type { GamificationUpdatedPayload, MyGamificationDto } from '../api/gamification.types';
import {
  applySeenLevel,
  isDeferredRoute,
  levelUpItemOf,
  patchProfile,
  reconcileQueue,
} from '../utils/gamification-events';

const profile = (overrides: Partial<MyGamificationDto> = {}): MyGamificationDto => ({
  counters: {},
  level: 12,
  longestStreak: 9,
  levelSpan: 500,
  serverNow: '2026-09-25T00:00:00.000Z',
  showcase: [],
  streak: 4,
  streakAtRisk: true,
  unseenBadges: [],
  xp: 5_000,
  xpIntoLevel: 480,
  xpToNext: 20,
  ...overrides,
});

const event = (
  overrides: Partial<GamificationUpdatedPayload> = {},
): GamificationUpdatedPayload => ({
  level: 13,
  newBadges: [],
  streak: 5,
  xp: 5_020,
  ...overrides,
});

describe('isDeferredRoute — màn hoãn modal lên cấp', () => {
  it.each(['/study/attempts/a1', '/call/c1', '/meetings/m1/room', '/study/live/6650c0ffee'])(
    '%s ⇒ hoãn',
    (path) => {
      expect(isDeferredRoute(path)).toBe(true);
    },
  );

  it.each([
    '/',
    '/me/achievements',
    '/study/live/join',
    '/study/live/host',
    '/study/live/history',
    '/study/live/6650c0ffee/results',
    '/study/results/a1',
    '/meetings/m1',
  ])('%s ⇒ hiện được', (path) => {
    expect(isDeferredRoute(path)).toBe(false);
  });

  it('pathname trống ⇒ không hoãn', () => {
    expect(isDeferredRoute(undefined)).toBe(false);
    expect(isDeferredRoute('')).toBe(false);
  });
});

describe('patchProfile', () => {
  it('vá xp/level/streak, giữ chuỗi dài nhất và hạ streakAtRisk', () => {
    const next = patchProfile(profile(), event({ streak: 12 }));
    expect(next).toMatchObject({
      level: 13,
      longestStreak: 12,
      streak: 12,
      streakAtRisk: false,
      xp: 5_020,
    });
  });

  it('KHÔNG đụng ngưỡng cấp (sự kiện không mang) — chờ tải lại', () => {
    const next = patchProfile(profile(), event());
    expect(next.xpIntoLevel).toBe(480);
    expect(next.xpToNext).toBe(20);
  });
});

describe('levelUpItemOf', () => {
  it('không có levelUp ⇒ null', () => {
    expect(levelUpItemOf(event())).toBeNull();
  });

  it('có levelUp ⇒ kèm huy hiệu mới cùng lúc', () => {
    const badge = { code: 'B1', emoji: '🏅', id: 'b1', name: 'Chăm chỉ' };
    expect(levelUpItemOf(event({ levelUp: { from: 12, to: 13 }, newBadges: [badge] }))).toEqual({
      badges: [badge],
      from: 12,
      to: 13,
    });
  });
});

describe('applySeenLevel — cùng luật server (chỉ tăng, kẹp ≤ cấp hiện tại)', () => {
  it('đã xem tới cấp chờ ⇒ xoá levelUpPending', () => {
    const next = applySeenLevel(profile({ levelUpPending: { from: 12, to: 13 }, level: 13 }), 13);
    expect(next.levelUpPending).toBeUndefined();
  });

  it('còn cấp cao hơn chưa xem ⇒ co `from` lại', () => {
    const next = applySeenLevel(profile({ levelUpPending: { from: 11, to: 14 }, level: 14 }), 12);
    expect(next.levelUpPending).toEqual({ from: 12, to: 14 });
  });

  it('không có levelUpPending ⇒ giữ nguyên', () => {
    const base = profile();
    expect(applySeenLevel(base, 13)).toBe(base);
  });
});

describe('reconcileQueue — GM-03 đa thiết bị', () => {
  const item = (to: number) => ({ badges: [], from: to - 1, to });

  it('server không còn chờ (máy kia đã bấm "Tuyệt") ⇒ dọn hàng đợi', () => {
    expect(reconcileQueue([item(13)], profile())).toEqual([]);
  });

  it('server vẫn chờ ⇒ giữ; mục đã xem (to ≤ from) ⇒ bỏ', () => {
    const fresh = profile({ levelUpPending: { from: 13, to: 14 } });
    expect(reconcileQueue([item(13), item(14)], fresh)).toEqual([item(14)]);
  });

  it('không đổi gì ⇒ trả đúng mảng cũ (không kéo vẽ lại)', () => {
    const queue = [item(13)];
    expect(reconcileQueue(queue, profile({ levelUpPending: { from: 12, to: 13 } }))).toBe(queue);
  });
});
