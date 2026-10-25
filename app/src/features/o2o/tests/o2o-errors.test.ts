import { O2O_ERROR_MESSAGES } from '../constants/o2o.constants';
import {
  isNotAvailable,
  o2oErrorCode,
  o2oErrorMessage,
  unsupportedFieldOf,
} from '../utils/o2o-errors';

/** Lỗi axios có cấu trúc `{ error: { code, details } }` như BE trả (`AppError`). */
function apiError(status: number, code: string, details?: unknown) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { data: { error: { code, details, message: code } }, headers: {}, status },
  });
}

describe('mã lỗi O2O_* → tiếng Việt (be.md §8, error.codes.ts O2O_001..013)', () => {
  it('có câu cho ĐỦ 13 mã của BE, mỗi câu là tiếng Việt có nội dung', () => {
    for (let n = 1; n <= 13; n += 1) {
      const code = `O2O_${String(n).padStart(3, '0')}`;
      expect(O2O_ERROR_MESSAGES[code]).toEqual(expect.any(String));
      expect(O2O_ERROR_MESSAGES[code]?.length).toBeGreaterThan(10);
    }
  });

  it.each([
    ['O2O_001', 409, /tạm ngưng nhận đơn/],
    ['O2O_003', 400, /PDF/],
    ['O2O_004', 409, /chuyển sang bước khác/],
    ['O2O_010', 404, /không còn hiển thị/],
    ['O2O_011', 400, /500 trang/],
    ['O2O_012', 400, /Khoảng trang không hợp lệ/],
    ['RES_003', 409, /cập nhật ở nơi khác/],
  ])('%s → câu hướng dẫn', (code, status, pattern) => {
    expect(o2oErrorMessage(apiError(status as number, code as string))).toMatch(pattern as RegExp);
    expect(o2oErrorCode(apiError(status as number, code as string))).toBe(code);
  });

  it('O2O_002 nói ĐÚNG trường tiệm không hỗ trợ (paper/color/duplex/binding)', () => {
    expect(o2oErrorMessage(apiError(400, 'O2O_002', { field: 'paper' }))).toMatch(/khổ A3/);
    expect(o2oErrorMessage(apiError(400, 'O2O_002', { field: 'color' }))).toMatch(/không in màu/);
    expect(o2oErrorMessage(apiError(400, 'O2O_002', { field: 'duplex' }))).toMatch(/hai mặt/);
    expect(o2oErrorMessage(apiError(400, 'O2O_002', { field: 'binding' }))).toMatch(/đóng gáy/);
    expect(unsupportedFieldOf(apiError(400, 'O2O_002', { field: 'paper' }))).toBe('paper');
    // Không kèm trường → câu chung của mã.
    expect(o2oErrorMessage(apiError(400, 'O2O_002'))).toBe(O2O_ERROR_MESSAGES.O2O_002);
    expect(unsupportedFieldOf(apiError(400, 'O2O_003'))).toBeNull();
  });

  it('mã lạ và lỗi không phải axios rơi về bộ dịch chung (không ném)', () => {
    expect(o2oErrorMessage(new Error('boom'))).toBe('boom');
    expect(o2oErrorMessage(undefined)).toEqual(expect.any(String));
  });

  it('"không còn xem được": 404 hoặc cờ o2o tắt (CFG_005) — 409 thì không', () => {
    expect(isNotAvailable(apiError(404, 'O2O_010'))).toBe(true);
    expect(isNotAvailable(apiError(404, 'PERM_404'))).toBe(true);
    expect(isNotAvailable(apiError(404, 'CFG_005'))).toBe(true);
    expect(isNotAvailable(apiError(409, 'O2O_004'))).toBe(false);
    expect(isNotAvailable(new Error('mạng'))).toBe(false);
  });
});
