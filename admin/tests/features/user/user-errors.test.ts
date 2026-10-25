/**
 * `resolveUserActionError` — câu lỗi đúng nghĩa cho 400/409 của thao tác quản trị người dùng.
 *
 * BE dùng mã CHUNG cho các từ chối nghiệp vụ ở đây (409 → `RES_002`, 400 → `VAL_001`), nên câu do
 * interceptor dựng theo mã ("Tài nguyên đã tồn tại" / "Dữ liệu đầu vào không hợp lệ") không nói được
 * điều gì sai. Các bài kiểm dựng lỗi axios GIỐNG HỆT payload thật của BE
 * (`be/src/modules/users/services/user.service.ts` + `errorHandler`).
 */
import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  CHANGE_ROLE_SELF_REASON,
  LOCK_BLOCKED_REASON,
} from '@/features/user/constants/user.constants';
import {
  EMAIL_TAKEN_MESSAGE,
  isConflictError,
  resolveUserActionError,
} from '@/features/user/utils/user-errors';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';

/** Lỗi axios có response `{ success:false, error:{ code, message, details? } }` như BE trả. */
function apiError(status: number, code: string, message: string, details?: unknown): AxiosError {
  const response = {
    status,
    statusText: '',
    headers: {},
    config: {},
    data: { success: false, error: { code, message, ...(details ? { details } : {}) } },
  } as unknown as AxiosResponse;
  return new AxiosError(
    `Request failed with status code ${status}`,
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    response,
  );
}

describe('resolveUserActionError — 409', () => {
  const conflict = () =>
    apiError(409, 'RES_002', 'Không thể khoá tài khoản đang chờ xoá — hãy huỷ yêu cầu xoá trước');

  it('khoá / mở khoá tài khoản đang chờ xoá hoặc đã ẩn danh → câu nói đúng nguyên nhân, KHÔNG phải "Tài nguyên đã tồn tại"', () => {
    for (const action of ['lock', 'unlock'] as const) {
      const message = resolveUserActionError(conflict(), action);
      expect(message).toContain('đang chờ xoá hoặc đã ẩn danh hoá');
      expect(message).toContain('huỷ yêu cầu xoá');
      expect(message).not.toBe(ERROR_CODE_MESSAGES.RES_002);
    }
  });

  it('tạo người dùng trùng email → "email đã được sử dụng"', () => {
    const err = apiError(409, 'RES_002', 'Email đã tồn tại');
    expect(resolveUserActionError(err, 'create')).toBe(EMAIL_TAKEN_MESSAGE);
    expect(isConflictError(err)).toBe(true);
  });
});

describe('resolveUserActionError — 400 do luật nghiệp vụ trong service (không kèm details)', () => {
  it('tự khoá tài khoản của chính mình', () => {
    const err = apiError(400, 'VAL_001', 'Không thể tự khoá tài khoản của chính mình');
    expect(resolveUserActionError(err, 'lock')).toBe(LOCK_BLOCKED_REASON.SELF);
  });

  it('tự đổi vai trò của chính mình', () => {
    const err = apiError(400, 'VAL_001', 'Không thể đổi vai trò của chính mình');
    expect(resolveUserActionError(err, 'change-role')).toBe(CHANGE_ROLE_SELF_REASON);
  });

  it('400 do Zod (có details theo trường) KHÔNG bị hiểu nhầm là "tự khoá mình"', () => {
    const err = apiError(400, 'VAL_001', 'Dữ liệu không hợp lệ', {
      reason: ['Lý do tối thiểu 10 ký tự'],
    });
    const message = resolveUserActionError(err, 'lock');
    expect(message).not.toBe(LOCK_BLOCKED_REASON.SELF);
    // Rơi về đúng câu interceptor sẽ hiện cho VAL_001.
    expect(message).toBe(ERROR_CODE_MESSAGES.VAL_001);
  });
});

describe('resolveUserActionError — phần còn lại giữ nguyên hành vi của interceptor', () => {
  it('403 quyền / 404 / mã lạ đi theo bảng mã lỗi chung', () => {
    expect(resolveUserActionError(apiError(403, 'AUTH_005', 'x'), 'lock')).toBe(
      ERROR_CODE_MESSAGES.AUTH_005,
    );
    expect(resolveUserActionError(apiError(404, 'USER_001', 'x'), 'unlock')).toBe(
      ERROR_CODE_MESSAGES.USER_001,
    );
    // Mã chưa có trong bảng → câu của BE (đúng như interceptor).
    expect(resolveUserActionError(apiError(500, 'SYS_999', 'Máy chủ bận'), 'change-role')).toBe(
      'Máy chủ bận',
    );
  });

  it('tài khoản của CHÍNH người thao tác vừa bị khoá/chờ xoá (AUTH_011/012) → không toast (đã bị đăng xuất)', () => {
    expect(resolveUserActionError(apiError(403, 'AUTH_011', 'x'), 'lock')).toBeNull();
    expect(resolveUserActionError(apiError(403, 'AUTH_012', 'x'), 'create')).toBeNull();
  });

  it('không phải lỗi HTTP → câu chung, không lộ Error.message thô', () => {
    const message = resolveUserActionError(
      new Error('Cannot read properties of undefined'),
      'lock',
    );
    expect(message).toBe('Không thực hiện được. Vui lòng thử lại.');
    expect(isConflictError(new Error('x'))).toBe(false);
  });
});
