import type { MyGamificationDto } from '../api/gamification.types';
import {
  formatXp,
  gamificationErrorMessage,
  isAccessDenied,
  levelPercent,
} from '../utils/level-math';

/**
 * app.md p4-03 §8: `level-math` — 0 %, 100 %, `xpToNext = 0` ở cấp tối đa. Ngưỡng cấp do SERVER tính; client chỉ chia.
 */

const at = (
  xpIntoLevel: number,
  xpToNext: number,
): Pick<MyGamificationDto, 'xpIntoLevel' | 'xpToNext'> => ({
  xpIntoLevel,
  xpToNext,
});

describe('levelPercent', () => {
  it('đầu cấp ⇒ 0 %', () => {
    expect(levelPercent(at(0, 100))).toBe(0);
  });

  it('giữa cấp ⇒ tỉ lệ đã có trên tổng của cấp', () => {
    expect(levelPercent(at(150, 50))).toBe(75);
  });

  it('cuối cấp (còn 0 XP nhưng chưa thăng cấp) ⇒ kẹp 100 %', () => {
    expect(levelPercent(at(100, 0))).toBe(100);
  });

  it('cấp tối đa (`xpToNext = 0`) ⇒ 100 %, kể cả khi `xpIntoLevel = 0`', () => {
    expect(levelPercent(at(0, 0))).toBe(100);
  });

  it('dữ liệu lệch (âm) không làm thanh tràn ra ngoài 0–100', () => {
    expect(levelPercent(at(-20, 50))).toBe(0);
    expect(levelPercent(at(500, 1))).toBeLessThanOrEqual(100);
  });
});

describe('formatXp', () => {
  it('nhóm nghìn kiểu vi-VN + hậu tố XP', () => {
    expect(formatXp(1234)).toMatch(/^1\.234 XP$/);
    expect(formatXp(0)).toBe('0 XP');
  });
});

describe('gamificationErrorMessage', () => {
  const axiosLike = (code: string) => ({
    isAxiosError: true,
    response: { data: { error: { code } }, status: 400 },
  });

  it('GAME_006 ⇒ câu tiếng Việt của feature', () => {
    expect(gamificationErrorMessage(axiosLike('GAME_006'), 'chung')).toBe(
      'Chỉ trưng bày được huy hiệu bạn đã đạt, tối đa 6 huy hiệu',
    );
  });

  it('mã lạ / không phải lỗi HTTP ⇒ rơi về thông điệp chung', () => {
    expect(gamificationErrorMessage(axiosLike('XYZ_999'), 'chung')).toBe('chung');
    expect(gamificationErrorMessage(new Error('x'), 'chung')).toBe('chung');
  });
});

describe('isAccessDenied', () => {
  it('404 và 403 ⇒ true; lỗi khác ⇒ false', () => {
    const http = (status: number) => ({ isAxiosError: true, response: { status } });
    expect(isAccessDenied(http(404))).toBe(true);
    expect(isAccessDenied(http(403))).toBe(true);
    expect(isAccessDenied(http(500))).toBe(false);
    expect(isAccessDenied(new Error('x'))).toBe(false);
  });
});
