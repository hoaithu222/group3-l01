/**
 * Schema form "Đặt hạn mức kho tài liệu riêng" — thông báo lỗi in số theo định dạng vi-VN.
 *
 * Trước đây thông báo dựng bằng `toLocaleString('vi-VN')` ngay trong file component; nay là `formatGib`. Bẫy cần
 * khoá: hạn mức tối thiểu là 0,5 GiB — `formatNumber(0.5)` trần (0 chữ số lẻ) sẽ in "1", tức "Tối thiểu 1 GiB".
 */
import { describe, expect, it } from 'vitest';

import {
  QUOTA_GIB_MAX,
  QUOTA_GIB_MIN,
} from '@/features/workspace/constants/workspace-resources.constants';
import { resourceQuotaSchema } from '@/features/workspace/schemas/resource-quota.schema';

const REASON = 'Nhóm đồ án cần thêm dung lượng';

const messagesOf = (input: unknown): string[] => {
  const result = resourceQuotaSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('resourceQuotaSchema', () => {
  it('dưới mức tối thiểu → "Tối thiểu 0,5 GiB" (không phải "1" hay "0.5")', () => {
    expect(QUOTA_GIB_MIN).toBe(0.5);
    expect(messagesOf({ gib: 0.1, reason: REASON })).toEqual(['Tối thiểu 0,5 GiB']);
  });

  it('trên mức tối đa → "Tối đa 100 GiB"', () => {
    expect(QUOTA_GIB_MAX).toBe(100);
    expect(messagesOf({ gib: 150, reason: REASON })).toEqual(['Tối đa 100 GiB']);
  });

  it('bỏ trống hạn mức → "Nhập hạn mức (GiB)"', () => {
    expect(messagesOf({ gib: undefined, reason: REASON })).toEqual(['Nhập hạn mức (GiB)']);
  });

  it('hai biên hợp lệ; lý do được cắt khoảng trắng và phải ≥ 10 ký tự', () => {
    expect(messagesOf({ gib: QUOTA_GIB_MIN, reason: REASON })).toEqual([]);
    expect(messagesOf({ gib: QUOTA_GIB_MAX, reason: REASON })).toEqual([]);
    expect(messagesOf({ gib: 2, reason: '   ngắn    ' })).toEqual(['Lý do tối thiểu 10 ký tự']);
    expect(resourceQuotaSchema.parse({ gib: 2, reason: `  ${REASON}  ` }).reason).toBe(REASON);
  });
});
