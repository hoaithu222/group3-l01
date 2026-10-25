import { classifyVerifyEmailError } from '@/shared/verify-email';

import { apiError } from './test-utils';

/**
 * Phân loại lỗi xác minh email (BE trả 400 `VAL_001` cho CẢ "Email đã được xác minh" lẫn "mã sai"; bảng mã chung dịch `VAL_001` thành câu chung
 * nên phải đọc câu gốc của BE để phân biệt).
 */
function validationError(message: string) {
  return Object.assign(new Error('HTTP 400'), {
    isAxiosError: true,
    response: { data: { error: { code: 'VAL_001', message } }, headers: {}, status: 400 },
  });
}

describe('classifyVerifyEmailError', () => {
  it('gửi mã: mọi 400 = đã xác minh (không có thân yêu cầu để sai); xác nhận: theo câu gốc của BE', () => {
    expect(classifyVerifyEmailError(validationError('Email đã được xác minh'), 'send')).toEqual({
      kind: 'ALREADY_VERIFIED',
    });
    expect(classifyVerifyEmailError(validationError('Email đã được xác minh'), 'confirm')).toEqual({
      kind: 'ALREADY_VERIFIED',
    });
    expect(
      classifyVerifyEmailError(
        validationError('Mã xác minh không hợp lệ hoặc đã hết hạn'),
        'confirm',
      ),
    ).toEqual({ kind: 'BAD_CODE' });
  });

  it('429/mất mạng → OTHER kèm câu người dùng đọc được', () => {
    expect(classifyVerifyEmailError(apiError(429, 'RATE_002'), 'confirm')).toEqual({
      kind: 'OTHER',
      message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau',
    });
    expect(classifyVerifyEmailError(new Error('Network Error'), 'send').kind).toBe('OTHER');
  });
});
