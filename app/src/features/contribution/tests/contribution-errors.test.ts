import { AxiosError } from 'axios';

import {
  contributionErrorMessage,
  errorCodeOf,
  isAccessLost,
  isExportExpired,
  isVersionConflict,
  retryAfterSeconds,
} from '../utils/contribution-errors';

function apiError(status: number, code: string, message = 'Câu của server', details?: unknown): AxiosError {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    config: {} as never,
    data: { error: { code, details, message } },
    headers: {},
    status,
    statusText: '',
  });
}

describe('mã lỗi p4-06 (nhãn nằm TRONG feature)', () => {
  it.each([
    ['CONTRIB_001', 'Bảng đóng góp chỉ để xem, không thể chỉnh sửa.'],
    ['CONTRIB_002', 'Tổng trọng số phải bằng 100.'],
    ['CONTRIB_003', 'Kỳ báo cáo không hợp lệ.'],
    ['CONTRIB_004', 'Khoảng ngày của biểu đồ hoạt động vượt giới hạn cho phép.'],
    ['CONTRIB_005', 'Tệp báo cáo đã hết hạn, hãy xuất lại.'],
    ['CONTRIB_006', 'Báo cáo đang được tạo, vui lòng chờ.'],
  ])('%s → nhãn tiếng Việt của feature (không phụ thuộc câu chữ server)', (code, label) => {
    expect(contributionErrorMessage(apiError(400, code, 'câu khác'))).toBe(label);
  });

  it('mã ngoài p4-06 rơi về câu chung của app: mã đã có bảng dịch chung → câu đó; mã lạ → câu của server', () => {
    expect(contributionErrorMessage(apiError(400, 'VAL_001', 'câu server'))).toBe('Dữ liệu đầu vào không hợp lệ');
    expect(contributionErrorMessage(apiError(400, 'FOO_999', 'Câu của server'))).toBe('Câu của server');
  });

  it('không phải lỗi axios (TypeError) vẫn ra câu, không ném lỗi mới', () => {
    expect(contributionErrorMessage(new TypeError('x'))).toBe('x');
    expect(errorCodeOf(new TypeError('x'))).toBeUndefined();
  });
});

describe('phân loại lỗi', () => {
  it('RES_003 + 409 = công thức vừa bị người khác đổi; 409 mã khác thì không', () => {
    expect(isVersionConflict(apiError(409, 'RES_003'))).toBe(true);
    expect(isVersionConflict(apiError(409, 'CONTRIB_006'))).toBe(false);
    expect(isVersionConflict(apiError(400, 'RES_003'))).toBe(false);
  });

  it('429 kèm retryAfterSeconds → số giây (làm tròn lên); thiếu số hoặc không phải 429 → undefined', () => {
    expect(retryAfterSeconds(apiError(429, 'RATE_002', 'x', { retryAfterSeconds: 41.2 }))).toBe(42);
    expect(retryAfterSeconds(apiError(429, 'RATE_002'))).toBeUndefined();
    expect(retryAfterSeconds(apiError(500, 'SYS_500', 'x', { retryAfterSeconds: 10 }))).toBeUndefined();
  });

  it('mất quyền (403/404) khác lỗi tạm thời; hết hạn = 410 hoặc CONTRIB_005', () => {
    expect(isAccessLost(apiError(404, 'PERM_404'))).toBe(true);
    expect(isAccessLost(apiError(403, 'AUTH_005'))).toBe(true);
    expect(isAccessLost(apiError(500, 'SYS_500'))).toBe(false);
    expect(isExportExpired(apiError(410, 'CONTRIB_005'))).toBe(true);
    expect(isExportExpired(apiError(409, 'CONTRIB_006'))).toBe(false);
  });
});
