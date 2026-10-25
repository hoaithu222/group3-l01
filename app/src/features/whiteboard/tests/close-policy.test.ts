import { backoffDelayMs, decideOnClose } from '../collab/close-policy';

/** Bảng `collab/README.md` §3.4 — mỗi hàng là MỘT hành vi client PHẢI làm; lệch một hàng là vòng nối lại vô hạn hoặc người dùng kẹt. */
describe('decideOnClose', () => {
  it.each([
    ['forbidden', 4403, { code: 'FORBIDDEN', kind: 'stop' }],
    ['not-found', 4404, { code: 'NOT_FOUND', kind: 'stop' }],
    ['unsupported-message', 4400, { code: 'LOAD_FAILED', kind: 'stop' }],
    ['awareness-invalid', 4400, { code: 'LOAD_FAILED', kind: 'stop' }],
    ['unauthorized', 4401, { kind: 'refresh-token' }],
    ['too-many-connections', 4429, { kind: 'backoff' }],
    ['rate-limited', 4429, { kind: 'backoff' }],
    ['unavailable', 4503, { kind: 'backoff' }],
    ['revoked', 4403, { archived: false, kind: 'reconnect' }],
    ['archived', 4409, { archived: true, kind: 'reconnect' }],
    ['auth-timeout', 4408, { archived: false, kind: 'reconnect' }],
  ] as const)('reason %s → %j', (reason, code, expected) => {
    expect(decideOnClose({ code, reason })).toEqual(expected);
  });

  it('`reason` thắng mã đóng: 4403 + forbidden dừng, 4403 + revoked nối lại để xác thực lại', () => {
    expect(decideOnClose({ code: 4403, reason: 'forbidden' }).kind).toBe('stop');
    expect(decideOnClose({ code: 4403, reason: 'revoked' }).kind).toBe('reconnect');
  });

  it('thiếu reason thì theo mã đóng thô; 4403 trần → nối lại; 1009 (khung > 6 MiB) → dừng "quá lớn"', () => {
    expect(decideOnClose({ code: 4403 })).toEqual({ archived: false, kind: 'reconnect' });
    expect(decideOnClose({ code: 1009 })).toEqual({ code: 'TOO_LARGE', kind: 'stop' });
    expect(decideOnClose({ code: 4404 })).toEqual({ code: 'NOT_FOUND', kind: 'stop' });
  });

  it('lỗi mạng thường (1000/1001/1006) và lý do lạ → bỏ qua (provider tự nối lại)', () => {
    for (const code of [1000, 1001, 1006]) expect(decideOnClose({ code }).kind).toBe('ignore');
    expect(decideOnClose({ reason: 'gì-đó-lạ' }).kind).toBe('ignore');
    expect(decideOnClose({})).toEqual({ kind: 'ignore' });
  });

  it('reason không phân biệt hoa/thường và khoảng trắng', () => {
    expect(decideOnClose({ reason: ' Forbidden ' }).kind).toBe('stop');
  });
});

describe('backoffDelayMs', () => {
  it('2 s → 4 s → 8 s … trần 30 s, cộng nhiễu ≤ 20%', () => {
    expect(backoffDelayMs(1, () => 0)).toBe(2000);
    expect(backoffDelayMs(2, () => 0)).toBe(4000);
    expect(backoffDelayMs(3, () => 0)).toBe(8000);
    expect(backoffDelayMs(10, () => 0)).toBe(30_000);
    expect(backoffDelayMs(1, () => 1)).toBe(2400);
    expect(backoffDelayMs(10, () => 1)).toBe(36_000);
  });
});
