import { AxiosError, type AxiosResponse } from 'axios';

import { toAuthErrorMessage } from '../auth-errors';

/**
 * Ngữ cảnh `socialLogin` (`POST /auth/firebase-login`): `AUTH_022` là 401 nhưng KHÔNG phải "sai mật khẩu" / "Token không hợp lệ".
 */
const httpError = (status: number, code: string) =>
  new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    data: { error: { code, message: 'msg-tu-be' } },
    status,
  } as unknown as AxiosResponse);

describe('toAuthErrorMessage — socialLogin', () => {
  it('AUTH_022 (token sai/hết hạn/đăng nhập cũ hơn 5 phút) ⇒ bảo thử lại, không nói "Token" hay "mật khẩu"', () => {
    const message = toAuthErrorMessage(httpError(401, 'AUTH_022'), 'socialLogin');
    expect(message).toBe('Phiên đăng nhập Google đã hết hạn. Vui lòng thử lại.');
    expect(message).not.toMatch(/token|mật khẩu/i);
  });

  it('AUTH_023 (email Google chưa xác minh / nhà cung cấp chưa hỗ trợ)', () => {
    expect(toAuthErrorMessage(httpError(401, 'AUTH_023'), 'socialLogin')).toBe(
      'Tài khoản Google này chưa có email đã xác minh nên chưa thể đăng nhập.',
    );
  });

  it('503 (BE chưa cấu hình Firebase hoặc Firebase không với tới được) ⇒ "tạm thời không khả dụng"', () => {
    expect(toAuthErrorMessage(httpError(503, 'SYS_503'), 'socialLogin')).toMatch(/tạm thời không khả dụng/);
  });

  it('AUTH_012 (chờ xoá): tài khoản chỉ-Google không có mật khẩu ⇒ chỉ lối "Quên mật khẩu"', () => {
    expect(toAuthErrorMessage(httpError(403, 'AUTH_012'), 'socialLogin')).toMatch(/Quên mật khẩu/);
  });

  it('AUTH_011 (khoá) và AUTH_018 (nonce) vẫn dùng câu chung', () => {
    expect(toAuthErrorMessage(httpError(403, 'AUTH_011'), 'socialLogin')).toBe('Tài khoản đã bị khoá');
    expect(toAuthErrorMessage(httpError(401, 'AUTH_018'), 'socialLogin')).toBe(
      'Phiên xác thực đã hết hạn. Vui lòng thử lại.',
    );
  });

  it('cùng mã AUTH_022 ở ngữ cảnh KHÁC không đổi hành vi cũ', () => {
    expect(toAuthErrorMessage(httpError(401, 'AUTH_002'), 'login')).toBe(
      'Email hoặc mật khẩu không đúng.',
    );
  });
});
