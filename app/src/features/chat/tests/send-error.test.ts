import { AxiosError, type AxiosResponse } from 'axios';

import { classifySendError, isRetryableSendCode } from '../utils/send-error';

const MINH = '507f1f77bcf86cd799439011';

function httpError(
  status: number,
  error: { code: string; message: string; details?: unknown },
): AxiosError {
  const response = { status, data: { success: false, error } } as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

describe('classifySendError — MSG_008 / MSG_020 / MSG_021', () => {
  it('MSG_008: rút userId chip bị từ chối từ details.invalidMentions; mục targetId null bị bỏ', () => {
    const info = classifySendError(
      httpError(400, {
        code: 'MSG_008',
        message: 'Nhắc tên không hợp lệ',
        details: {
          reason: 'INVALID_TARGET',
          invalidMentions: [
            { targetId: MINH, reason: 'NO_ACCESS' },
            { targetId: null, reason: 'NO_ACCESS' },
          ],
        },
      }),
    );
    expect(info.code).toBe('MSG_008');
    expect(info.invalidMentionUserIds).toEqual([MINH]);
  });

  it('lỗi mã khác không mang invalidMentionUserIds', () => {
    expect(
      classifySendError(httpError(403, { code: 'MSG_020', message: 'x' })).invalidMentionUserIds,
    ).toBeUndefined();
  });

  it('MSG_008/MSG_020 KHÔNG thử lại được (gửi y nguyên vẫn hỏng); mã khác và lỗi mạng thì được', () => {
    expect(isRetryableSendCode('MSG_008')).toBe(false);
    expect(isRetryableSendCode('MSG_020')).toBe(false);
    expect(isRetryableSendCode('MSG_021')).toBe(true);
    expect(isRetryableSendCode('RATE_002')).toBe(true);
    expect(isRetryableSendCode(undefined)).toBe(true);
  });
});
