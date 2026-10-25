import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';

import { reportFormSchema, resolveReasonSchema } from '../schemas/moderation.schemas';
import { cleanExcerpt } from '../utils/excerpt';
import { isAlreadyResolved, isQueueForbidden, reportSubmitErrorMessage, resolveErrorMessage } from '../utils/moderation-errors';
import { apiError } from './test-utils';

/** Luật form + câu lỗi (p1-08) — những chỗ SAI THÌ IM LẶNG: khớp `createReportSchema`/`reasonSchema` của BE và không lộ việc bị chặn. */

describe('reportFormSchema (khớp createReportSchema của BE)', () => {
  it('lý do thường: mô tả không bắt buộc; tối đa 1.000 ký tự', () => {
    expect(reportFormSchema.safeParse({ reason: 'SPAM', description: '' }).success).toBe(true);
    expect(reportFormSchema.safeParse({ reason: 'SPAM', description: 'a'.repeat(1000) }).success).toBe(true);
    expect(reportFormSchema.safeParse({ reason: 'SPAM', description: 'a'.repeat(1001) }).success).toBe(false);
  });

  it('OTHER: mô tả ≥ 10 ký tự SAU khi cắt khoảng trắng, lỗi gắn vào đúng trường `description`', () => {
    const tooShort = reportFormSchema.safeParse({ reason: 'OTHER', description: `   ${'a'.repeat(9)}   ` });
    expect(tooShort.success).toBe(false);
    expect(tooShort.error?.issues[0]?.path).toEqual(['description']);

    const enough = reportFormSchema.safeParse({ reason: 'OTHER', description: `  ${'a'.repeat(10)}  ` });
    expect(enough.success).toBe(true);
    expect(enough.data?.description).toBe('a'.repeat(10));
  });

  it('lý do ngoài enum bị từ chối', () => {
    expect(reportFormSchema.safeParse({ reason: 'BOGUS', description: '' }).success).toBe(false);
  });
});

describe('resolveReasonSchema (khớp reasonSchema của BE: 10–500)', () => {
  it.each([
    ['ngắn', false],
    ['   chín ký t   ', false],
    ['đủ mười ký tự', true],
    ['a'.repeat(500), true],
    ['a'.repeat(501), false],
  ])('%s ⇒ %s', (input, ok) => {
    expect(resolveReasonSchema.safeParse(input).success).toBe(ok);
  });
});

describe('bảng mã lỗi p1-08', () => {
  it('có đủ MOD_001..006 và BLOCK_001..004 bằng tiếng Việt', () => {
    for (const code of ['MOD_001', 'MOD_002', 'MOD_003', 'MOD_004', 'MOD_005', 'MOD_006', 'BLOCK_001', 'BLOCK_002', 'BLOCK_003', 'BLOCK_004']) {
      expect(ERROR_CODE_MESSAGES[code]).toBeTruthy();
    }
  });

  it('⛔ ba mã "bị chặn" (MSG_004, CONV_002, BLOCK_002/003) KHÔNG tiết lộ là bị chặn', () => {
    for (const code of ['MSG_004', 'CONV_002', 'BLOCK_002', 'BLOCK_003']) {
      expect(ERROR_CODE_MESSAGES[code]).not.toMatch(/chặn|block/i);
    }
  });
});

describe('câu lỗi báo cáo/xử lý', () => {
  it('MOD_006 không có retryAfterSeconds ⇒ dùng câu của bảng mã lỗi', () => {
    expect(reportSubmitErrorMessage(apiError(429, 'MOD_006'))).toBe(ERROR_CODE_MESSAGES.MOD_006);
  });

  it('MOD_006 làm tròn LÊN theo phút', () => {
    expect(reportSubmitErrorMessage(apiError(429, 'MOD_006', { retryAfterSeconds: 61 }))).toContain('2 phút');
  });

  it('lỗi mạng (không có response) ⇒ câu lỗi mạng chung, không nổ khi đọc `response`', () => {
    expect(reportSubmitErrorMessage(new Error('Network Error'))).toBe('Network Error');
    expect(resolveErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('resolve: MOD_001 nhận diện được, 404 ⇒ "không còn khả dụng"', () => {
    expect(isAlreadyResolved(apiError(409, 'MOD_001'))).toBe(true);
    expect(isAlreadyResolved(apiError(400, 'MOD_003'))).toBe(false);
    expect(resolveErrorMessage(apiError(404, 'PERM_404'))).toBe('Báo cáo không còn khả dụng.');
  });

  it('isQueueForbidden: chỉ 403/404 (không phải lỗi mạng hay 500)', () => {
    expect(isQueueForbidden(apiError(403, 'PERM_001'))).toBe(true);
    expect(isQueueForbidden(apiError(404, 'PERM_404'))).toBe(true);
    expect(isQueueForbidden(apiError(500, 'SRV_001'))).toBe(false);
    expect(isQueueForbidden(new Error('x'))).toBe(false);
  });
});

describe('cleanExcerpt', () => {
  it('thay marker nhắc tên (user/all/role) và gộp khoảng trắng', () => {
    expect(cleanExcerpt('chào @{u:507f1f77bcf86cd799439011}  và   @{all} @{r:ADMIN}')).toBe('chào @… và @… @…');
  });

  it('marker sai dạng được giữ nguyên như chữ thường (BE cũng coi vậy)', () => {
    expect(cleanExcerpt('@{u:xyz}')).toBe('@{u:xyz}');
  });
});
