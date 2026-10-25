import { AxiosError, type AxiosResponse } from 'axios';

import { UNKNOWN_ERROR_MESSAGE } from '@/shared/constants/error-codes';

import { isOwnershipBlockingDeletion, toAuthErrorMessage, UserFacingError } from '../auth-errors';

/**
 * Câu lỗi của form xác thực dịch theo NGỮ CẢNH.
 *
 * Lỗi đã có thật: BE ném `UnauthorizedError("Email hoặc mật khẩu không đúng")` KHÔNG kèm mã,
 * tức là mặc định `AUTH_002`. `getErrorMessage` ưu tiên bảng mã hơn câu của BE, mà bảng ghi
 * `AUTH_002 = "Token không hợp lệ"` — nên gõ sai mật khẩu ở màn Đăng nhập hiện "Token không
 * hợp lệ".
 */

function httpError(status: number, code?: string, message = 'msg-tu-be'): AxiosError {
  const response = {
    data: code ? { error: { code, message } } : {},
    status,
  } as unknown as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

describe('login', () => {
  it.each(['AUTH_001', 'AUTH_002'])('401 %s ⇒ "Email hoặc mật khẩu không đúng."', (code) => {
    expect(toAuthErrorMessage(httpError(401, code), 'login')).toBe(
      'Email hoặc mật khẩu không đúng.',
    );
  });

  it('KHÔNG hiện "Token không hợp lệ" cho sai mật khẩu (mã AUTH_002 mặc định của BE)', () => {
    expect(toAuthErrorMessage(httpError(401, 'AUTH_002'), 'login')).not.toMatch(/token/i);
  });

  it('tài khoản khoá/chờ xoá giữ câu riêng của bảng mã', () => {
    expect(toAuthErrorMessage(httpError(403, 'AUTH_011'), 'login')).toBe('Tài khoản đã bị khoá');
    expect(toAuthErrorMessage(httpError(403, 'AUTH_012'), 'login')).toBe('Tài khoản đang chờ xoá');
  });
});

describe('changePassword', () => {
  it('401 AUTH_002/AUTH_001/USER_003 ⇒ "Mật khẩu hiện tại không đúng."', () => {
    for (const code of ['AUTH_001', 'AUTH_002', 'USER_003']) {
      expect(toAuthErrorMessage(httpError(401, code), 'changePassword')).toBe(
        'Mật khẩu hiện tại không đúng.',
      );
    }
  });
});

describe('resetPassword', () => {
  it('mã sai/hết hạn (401 AUTH_002 hoặc AUTH_008, hay 404) ⇒ CÙNG một câu, không lộ tài khoản', () => {
    const expected = 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu mã mới.';
    expect(toAuthErrorMessage(httpError(401, 'AUTH_002'), 'resetPassword')).toBe(expected);
    expect(toAuthErrorMessage(httpError(401, 'AUTH_008'), 'resetPassword')).toBe(expected);
    expect(toAuthErrorMessage(httpError(404, 'RES_001'), 'resetPassword')).toBe(expected);
  });
});

describe('register', () => {
  it('409 ⇒ email đã đăng ký (bảng mã chỉ nói "Tài nguyên đã tồn tại")', () => {
    expect(toAuthErrorMessage(httpError(409, 'RES_002'), 'register')).toMatch(/đã được đăng ký/);
  });
});

describe('mọi form', () => {
  it('AUTH_018 ⇒ câu thân thiện, KHÔNG có chữ "nonce"', () => {
    for (const context of ['login', 'register', 'resetPassword', 'changePassword'] as const) {
      const message = toAuthErrorMessage(httpError(401, 'AUTH_018'), context);
      expect(message).not.toMatch(/nonce/i);
    }
  });

  it('mất mạng (không có phản hồi) ⇒ câu lỗi kết nối, không phải "sai mật khẩu"', () => {
    const offline = new AxiosError('Network Error', 'ERR_NETWORK');
    expect(toAuthErrorMessage(offline, 'login')).toMatch(/kết nối mạng/);
  });

  it('lỗi do app chủ ý ném (UserFacingError) ⇒ hiện nguyên văn', () => {
    expect(
      toAuthErrorMessage(new UserFacingError('Chưa xác nhận được phiên'), 'changePassword'),
    ).toBe('Chưa xác nhận được phiên');
  });

  it('⛔ lỗi lạ (TypeError, lỗi kho khoá…) ⇒ câu chung, KHÔNG lộ chi tiết kỹ thuật', () => {
    const technical = new TypeError("Cannot read properties of undefined (reading 'id')");
    for (const context of ['login', 'register', 'changePassword', 'forgotPassword'] as const) {
      expect(toAuthErrorMessage(technical, context)).toBe(UNKNOWN_ERROR_MESSAGE);
    }
  });

  it('⛔ mã HTTP ngoài bảng (418) ⇒ câu chung, KHÔNG lộ "Request failed with status code 418"', () => {
    const error = new AxiosError(
      'Request failed with status code 418',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        data: {},
        status: 418,
      } as unknown as AxiosResponse,
    );
    expect(toAuthErrorMessage(error, 'login')).toBe(UNKNOWN_ERROR_MESSAGE);
  });
});

describe('confirmPassword (ô xác nhận mật khẩu của người ĐÃ đăng nhập — xoá tài khoản)', () => {
  it('401 sai mật khẩu ⇒ "Mật khẩu không đúng." (không có ô email nên đừng nhắc email)', () => {
    for (const code of ['AUTH_001', 'AUTH_002']) {
      expect(toAuthErrorMessage(httpError(401, code), 'confirmPassword')).toBe(
        'Mật khẩu không đúng.',
      );
    }
  });
});

describe('forgotPassword', () => {
  it('không có nhánh riêng: câu của bảng mã/BE (429 quá nhiều yêu cầu…) hiện nguyên', () => {
    expect(
      toAuthErrorMessage(httpError(429, 'X_TEST', 'Thử lại sau ít phút'), 'forgotPassword'),
    ).toBe('Thử lại sau ít phút');
  });
});

describe('isOwnershipBlockingDeletion', () => {
  it('chỉ đúng với USER_010 (còn là chủ nhóm)', () => {
    expect(isOwnershipBlockingDeletion(httpError(409, 'USER_010'))).toBe(true);
    expect(isOwnershipBlockingDeletion(httpError(409, 'USER_011'))).toBe(false);
    expect(isOwnershipBlockingDeletion(new Error('x'))).toBe(false);
  });
});
