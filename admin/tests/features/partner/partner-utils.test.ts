/**
 * Hàm thuần của phân hệ `partner` (p6-05 admin.md §4): phân loại lỗi giao hàng bằng PIN (`O2O_007` kèm `attemptsLeft`, `O2O_008` 423 kèm
 * `retryAfterSeconds`, 429), đồng hồ đếm ngược, chia đơn vào cột Kanban và "đã chờ".
 */
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { groupByStatus, formatWaiting } from '@/features/partner/utils/partner-order.utils';
import { classifyPickupError, formatCountdown } from '@/features/partner/utils/pickup-error.utils';

import { makeOrder } from './partner-fixtures';

function axiosError(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response = { status, statusText: '', data: body, headers, config } as AxiosResponse;
  return new AxiosError('lỗi', 'ERR_BAD_REQUEST', config, undefined, response);
}

const apiError = (code: string, details?: unknown) => ({
  success: false,
  error: { code, message: 'x', ...(details !== undefined && { details }) },
});

describe('classifyPickupError', () => {
  it('O2O_007 → sai PIN kèm attemptsLeft', () => {
    expect(classifyPickupError(axiosError(400, apiError('O2O_007', { attemptsLeft: 3 })))).toEqual({
      kind: 'wrong-pin',
      attemptsLeft: 3,
    });
  });

  it('O2O_007 thiếu/sai kiểu details → attemptsLeft null (không tin mù hình dạng details)', () => {
    expect(classifyPickupError(axiosError(400, apiError('O2O_007')))).toEqual({
      kind: 'wrong-pin',
      attemptsLeft: null,
    });
    expect(
      classifyPickupError(axiosError(400, apiError('O2O_007', { attemptsLeft: '3' }))),
    ).toEqual({
      kind: 'wrong-pin',
      attemptsLeft: null,
    });
  });

  it('O2O_008 (423) → khoá kèm retryAfterSeconds (làm tròn lên, tối thiểu 1)', () => {
    expect(
      classifyPickupError(axiosError(423, apiError('O2O_008', { retryAfterSeconds: 900 }))),
    ).toEqual({
      kind: 'locked',
      retryAfterSeconds: 900,
    });
    expect(
      classifyPickupError(axiosError(423, apiError('O2O_008', { retryAfterSeconds: 0.2 }))),
    ).toEqual({
      kind: 'locked',
      retryAfterSeconds: 1,
    });
  });

  it('O2O_008 thiếu retryAfterSeconds → lùi về header Retry-After, rồi 60 giây (không cho bấm liên tục)', () => {
    expect(
      classifyPickupError(axiosError(423, apiError('O2O_008'), { 'retry-after': '120' })),
    ).toEqual({
      kind: 'locked',
      retryAfterSeconds: 120,
    });
    expect(classifyPickupError(axiosError(423, apiError('O2O_008')))).toEqual({
      kind: 'locked',
      retryAfterSeconds: 60,
    });
  });

  it('429 (chặn dò xuyên đơn) → rate-limited, đọc Retry-After nếu có', () => {
    expect(
      classifyPickupError(axiosError(429, apiError('RATE_001'), { 'retry-after': '45' })),
    ).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: 45,
    });
    expect(classifyPickupError(axiosError(429, apiError('RATE_001')))).toEqual({
      kind: 'rate-limited',
      retryAfterSeconds: null,
    });
  });

  it('O2O_004 → đơn đổi trạng thái; lỗi khác / không phải axios → other', () => {
    expect(
      classifyPickupError(axiosError(409, apiError('O2O_004', { status: 'CANCELLED' }))),
    ).toEqual({ kind: 'state' });
    expect(classifyPickupError(axiosError(500, apiError('SYS_500')))).toEqual({ kind: 'other' });
    expect(classifyPickupError(new Error('mạng'))).toEqual({ kind: 'other' });
  });
});

describe('formatCountdown', () => {
  it('phút:giây, làm tròn lên, không âm', () => {
    expect(formatCountdown(900)).toBe('15:00');
    expect(formatCountdown(65)).toBe('1:05');
    expect(formatCountdown(0.4)).toBe('0:01');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});

describe('groupByStatus', () => {
  it('chia bốn cột, mỗi cột đơn chờ LÂU NHẤT lên đầu; trạng thái ngoài hàng đợi bị bỏ', () => {
    const old = makeOrder({ id: 'a', submittedAt: '2026-09-20T01:00:00.000Z' });
    const recent = makeOrder({ id: 'b', submittedAt: '2026-09-20T03:00:00.000Z' });
    const accepted = makeOrder({ id: 'c', status: 'ACCEPTED' });
    const done = makeOrder({ id: 'd', status: 'PICKED_UP' });
    const groups = groupByStatus([recent, accepted, done, old]);
    expect(groups.PENDING.map((o) => o.id)).toEqual(['a', 'b']);
    expect(groups.ACCEPTED.map((o) => o.id)).toEqual(['c']);
    expect(groups.PRINTING).toEqual([]);
    expect(groups.READY).toEqual([]);
  });
});

describe('formatWaiting', () => {
  const at = (iso: string) => makeOrder({ submittedAt: iso });
  const now = Date.parse('2026-09-20T12:00:00.000Z');

  it('vừa gửi / phút / giờ / ngày', () => {
    expect(formatWaiting(at('2026-09-20T11:59:40.000Z'), now)).toBe('Vừa gửi');
    expect(formatWaiting(at('2026-09-20T11:48:00.000Z'), now)).toBe('12 phút');
    expect(formatWaiting(at('2026-09-20T10:00:00.000Z'), now)).toBe('2 giờ');
    expect(formatWaiting(at('2026-09-20T09:55:00.000Z'), now)).toBe('2 giờ 5 phút');
    expect(formatWaiting(at('2026-09-17T12:00:00.000Z'), now)).toBe('3 ngày');
  });

  it('mốc tương lai / không hợp lệ → "Vừa gửi" (không hiện số âm hay NaN)', () => {
    expect(formatWaiting(at('2026-09-20T13:00:00.000Z'), now)).toBe('Vừa gửi');
    expect(formatWaiting(makeOrder({ submittedAt: null, createdAt: 'không-phải-ngày' }), now)).toBe(
      'Vừa gửi',
    );
  });
});
