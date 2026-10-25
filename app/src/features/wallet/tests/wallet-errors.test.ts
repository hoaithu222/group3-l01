import { apiError } from './api-error.helpers';
import {
  httpStatusOf,
  invalidUserIdsOf,
  isDefinitiveRejection,
  isExpenseLocked,
  isVersionConflict,
  isWalletDenied,
  retryAfterSeconds,
  walletErrorCode,
} from '../utils/wallet-errors';
import { newIdempotencyKey } from '../utils/idempotency-key';

describe('wallet-errors — rẽ nhánh theo mã lỗi BE', () => {
  it('đọc mã, mã HTTP, 404 ⇒ không có quyền', () => {
    expect(walletErrorCode(apiError(409, 'WALLET_004'))).toBe('WALLET_004');
    expect(walletErrorCode(new Error('x'))).toBeNull();
    expect(httpStatusOf(apiError(404))).toBe(404);
    expect(isWalletDenied(apiError(404))).toBe(true);
    expect(isWalletDenied(apiError(500))).toBe(false);
  });

  it('WALLET_004 = khoản đã có người thanh toán → CTA "Tạo khoản điều chỉnh"', () => {
    expect(isExpenseLocked(apiError(409, 'WALLET_004'))).toBe(true);
    expect(isExpenseLocked(apiError(409, 'WALLET_007'))).toBe(false);
    expect(isExpenseLocked(undefined)).toBe(false);
  });

  it('xung đột phiên bản là 409 KHÁC WALLET_004/WALLET_007', () => {
    expect(isVersionConflict(apiError(409, 'RES_003'))).toBe(true);
    expect(isVersionConflict(apiError(409, 'WALLET_004'))).toBe(false);
    expect(isVersionConflict(apiError(409, 'WALLET_007'))).toBe(false);
    expect(isVersionConflict(apiError(400, 'WALLET_002'))).toBe(false);
  });

  it('WALLET_001 kèm details.invalidUserIds; mã khác thì rỗng', () => {
    expect(
      invalidUserIdsOf(apiError(400, 'WALLET_001', { invalidUserIds: ['u1', 'u2', 3] })),
    ).toEqual(['u1', 'u2']);
    expect(invalidUserIdsOf(apiError(400, 'WALLET_002', { invalidUserIds: ['u1'] }))).toEqual([]);
  });

  it('WALLET_010: số giây chờ từ details.retryAfter hoặc header Retry-After; không có thì null (không đoán)', () => {
    expect(retryAfterSeconds(apiError(429, 'WALLET_010', { retryAfter: 1800 }))).toBe(1800);
    expect(retryAfterSeconds(apiError(429, 'WALLET_010', undefined, { 'retry-after': '90' }))).toBe(
      90,
    );
    expect(retryAfterSeconds(apiError(429, 'WALLET_010'))).toBeNull();
    expect(retryAfterSeconds(new Error('x'))).toBeNull();
  });

  it('chỉ 4xx là "dứt khoát" (BE cache phản hồi này với Idempotency-Key); mạng/5xx thì không', () => {
    expect(isDefinitiveRejection(apiError(400, 'WALLET_002'))).toBe(true);
    expect(isDefinitiveRejection(apiError(409, 'WALLET_005'))).toBe(true);
    expect(isDefinitiveRejection(apiError(500))).toBe(false);
    expect(isDefinitiveRejection(new Error('mất mạng'))).toBe(false);
  });
});

describe('Idempotency-Key', () => {
  it('nằm trong 8–128 ký tự BE yêu cầu và không trùng giữa các lần sinh', () => {
    const keys = new Set(
      Array.from({ length: 200 }, () => newIdempotencyKey('wallet-expense', 'x')),
    );
    expect(keys.size).toBe(200);
    for (const key of keys) {
      expect(key.length).toBeGreaterThanOrEqual(8);
      expect(key.length).toBeLessThanOrEqual(128);
    }
  });

  it('chữ ký body khác nhau ⇒ khoá khác nhau (BE cache phản hồi 4xx theo khoá 24 giờ)', () => {
    const a = newIdempotencyKey('p', '{"amount":1}');
    const b = newIdempotencyKey('p', '{"amount":2}');
    expect(a.split('-')[1]).not.toBe(b.split('-')[1]);
  });
});
