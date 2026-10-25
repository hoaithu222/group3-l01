/**
 * `resolveAuthError` — đổi lỗi của luồng xác thực thành MỘT câu tiếng Việt.
 *
 * Bất biến:
 *  - KHÔNG BAO GIỜ hiện mã lỗi thô / từ nội bộ ("AUTH_002", "nonce"…);
 *  - đăng nhập sai luôn ra CÙNG một câu — không phân biệt "không có tài khoản" với "sai mật khẩu";
 *  - đứt mạng / 5xx ≠ "sai thông tin".
 */
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { resolveAuthError, type AuthFlow } from '@/features/auth/utils/auth-errors';

function httpError(
  status: number | null,
  code?: string,
  extra: { message?: string; details?: unknown; headers?: Record<string, string> } = {},
): AxiosError {
  const config = { url: '/x', headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
  if (status === null) return new AxiosError('Network Error', 'ERR_NETWORK', config, null);
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
    status,
    statusText: '',
    headers: extra.headers ?? {},
    config,
    data: code
      ? {
          success: false,
          error: { code, message: extra.message ?? 'thông điệp thô của BE', details: extra.details },
        }
      : {},
  });
}

const FLOWS: AuthFlow[] = ['login', 'register', 'forgot-password', 'reset-password', 'change-password'];

describe('resolveAuthError', () => {
  it('đăng nhập 401 ⇒ luôn CÙNG một câu, bất kể BE nói gì hay dùng mã nào', () => {
    const sentences = new Set(
      [
        httpError(401, 'AUTH_001', { message: 'Email không tồn tại' }),
        httpError(401, 'AUTH_002', { message: 'Sai mật khẩu' }),
        httpError(401, 'AUTH_002', { message: 'Token không hợp lệ' }),
        httpError(401),
      ].map((e) => resolveAuthError(e, 'login')),
    );

    expect(sentences).toEqual(new Set(['Email hoặc mật khẩu không đúng.']));
  });

  it('nghĩa của 401 phụ thuộc form đang gọi', () => {
    expect(resolveAuthError(httpError(401, 'AUTH_002'), 'reset-password')).toMatch(
      /Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn/,
    );
    expect(resolveAuthError(httpError(401, 'AUTH_002'), 'change-password')).toBe(
      'Mật khẩu hiện tại không đúng.',
    );
  });

  // BE bản mới tách mã cho đúng nghĩa (AUTH_001 sai mật khẩu / mật khẩu hiện tại, AUTH_008 token đặt lại
  // sai); bản cũ dồn hết vào AUTH_002. FE ánh xạ theo status + form nên phải ra cùng câu với cả hai bộ mã
  // (FE/BE triển khai độc lập — bản nào cũng có thể gặp).
  it.each([
    { flow: 'login', code: 'AUTH_001', expected: 'Email hoặc mật khẩu không đúng.' },
    { flow: 'change-password', code: 'AUTH_001', expected: 'Mật khẩu hiện tại không đúng.' },
    {
      flow: 'reset-password',
      code: 'AUTH_008',
      expected:
        'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu gửi lại hướng dẫn.',
    },
  ] as const)('mã mới $code ở form $flow ⇒ cùng câu với mã cũ AUTH_002', ({ flow, code, expected }) => {
    expect(resolveAuthError(httpError(401, code), flow)).toBe(expected);
    expect(resolveAuthError(httpError(401, 'AUTH_002'), flow)).toBe(expected);
  });

  it.each([
    ['AUTH_011', /Tài khoản đã bị khoá/],
    ['AUTH_012', /Tài khoản đang chờ xoá/],
    ['AUTH_018', /Yêu cầu đã hết hạn/],
    ['AUTH_004', /Phiên đăng nhập đã thay đổi/],
  ])('mã %s có câu riêng', (code, expected) => {
    expect(resolveAuthError(httpError(code === 'AUTH_018' || code === 'AUTH_004' ? 401 : 403, code), 'login')).toMatch(
      expected,
    );
  });

  it.each([
    { status: null, label: 'đứt mạng' },
    { status: 408, label: 'timeout' },
    { status: 502, label: 'gateway' },
    { status: 503, label: 'bảo trì' },
    { status: 504, label: 'gateway timeout' },
  ])('$label ($status) ⇒ "kiểm tra kết nối", không nói sai thông tin', ({ status }) => {
    for (const flow of FLOWS) {
      const message = resolveAuthError(httpError(status), flow);
      expect(message).toMatch(/Không thể kết nối đến máy chủ/);
    }
  });

  it('401 mà việc làm mới token cũng không hỏi được máy chủ ⇒ cũng là lỗi kết nối', () => {
    const error = httpError(401, 'AUTH_002') as AxiosError & { sessionUnavailable?: boolean };
    error.sessionUnavailable = true;
    expect(resolveAuthError(error, 'change-password')).toMatch(/Không thể kết nối/);
  });

  it('500 ⇒ máy chủ gặp sự cố', () => {
    expect(resolveAuthError(httpError(500, 'SYS_500'), 'login')).toMatch(/Máy chủ đang gặp sự cố/);
  });

  describe('429', () => {
    it('có Retry-After ⇒ nói bao lâu (giây / phút)', () => {
      expect(resolveAuthError(httpError(429, 'RATE_001', { headers: { 'retry-after': '45' } }), 'login')).toMatch(
        /thử lại sau 45 giây/,
      );
      expect(resolveAuthError(httpError(429, 'RATE_001', { headers: { 'retry-after': '900' } }), 'login')).toMatch(
        /thử lại sau 15 phút/,
      );
      expect(resolveAuthError(httpError(429, 'RATE_001', { headers: { 'retry-after': '61' } }), 'login')).toMatch(
        /thử lại sau 2 phút/,
      );
    });

    it('không có Retry-After (hoặc header rác) ⇒ "ít phút"', () => {
      expect(resolveAuthError(httpError(429, 'RATE_001'), 'login')).toMatch(/thử lại sau ít phút/);
      expect(
        resolveAuthError(httpError(429, 'RATE_001', { headers: { 'retry-after': 'khong-phai-so' } }), 'login'),
      ).toMatch(/thử lại sau ít phút/);
    });
  });

  describe('400 (validation)', () => {
    it('lấy câu lỗi đầu tiên của BE (đã là tiếng Việt)', () => {
      const error = httpError(400, 'VAL_001', {
        details: { newPassword: ['Mật khẩu mới tối thiểu 8 ký tự', 'câu thứ hai'] },
      });
      expect(resolveAuthError(error, 'change-password')).toBe('Mật khẩu mới tối thiểu 8 ký tự');
    });

    it('không có chi tiết ⇒ câu chung', () => {
      expect(resolveAuthError(httpError(400, 'VAL_001'), 'register')).toBe(
        'Thông tin nhập vào không hợp lệ.',
      );
    });

    it('quên mật khẩu ⇒ không hé lộ gì thêm', () => {
      expect(
        resolveAuthError(httpError(400, 'VAL_001', { details: { email: ['Email không hợp lệ'] } }), 'forgot-password'),
      ).toBe('Email không hợp lệ.');
    });
  });

  it('đăng ký trùng email (409) ⇒ nói rõ', () => {
    expect(resolveAuthError(httpError(409, 'RES_002', { message: 'Email đã tồn tại' }), 'register')).toBe(
      'Email này đã được đăng ký.',
    );
  });

  it('⛔ quên mật khẩu KHÔNG BAO GIỜ nói email có tồn tại hay không', () => {
    for (const status of [400, 401, 403, 404, 409, 429, 500, 503, null]) {
      const message = resolveAuthError(httpError(status, 'RES_001', { message: 'Email không tồn tại' }), 'forgot-password');
      expect(message, `status ${status}`).not.toMatch(/tồn tại|không có trong hệ thống|chưa đăng ký/i);
    }
  });

  it('⛔ không câu nào lộ mã lỗi thô hoặc từ nội bộ', () => {
    const statuses = [null, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503];
    const codes = ['AUTH_001', 'AUTH_002', 'AUTH_003', 'AUTH_006', 'AUTH_008', 'AUTH_011', 'AUTH_018', 'VAL_001', 'RATE_001', 'SYS_500', 'RES_002'];
    for (const flow of FLOWS) {
      for (const status of statuses) {
        for (const code of codes) {
          const message = resolveAuthError(httpError(status, code, { message: `raw ${code} nonce` }), flow);
          expect(message, `${flow} ${status} ${code}`).not.toMatch(/AUTH_|VAL_|RATE_|SYS_|RES_|nonce/i);
        }
      }
    }
  });

  it('lỗi không phải axios ⇒ câu chung, không ném', () => {
    expect(resolveAuthError(new Error('boom'), 'login')).toBe('Không thực hiện được. Vui lòng thử lại sau.');
    expect(resolveAuthError('chuỗi', 'login')).toBe('Không thực hiện được. Vui lòng thử lại sau.');
    expect(resolveAuthError(undefined, 'login')).toBe('Không thực hiện được. Vui lòng thử lại sau.');
  });
});
