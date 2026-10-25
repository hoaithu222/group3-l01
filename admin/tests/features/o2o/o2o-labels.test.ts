/**
 * Nhãn dùng chung cho O2O (p6-05 admin.md §4): mọi mã lỗi `O2O_001..013` của BE (`o2o.errors.ts`) có thông điệp tiếng Việt (interceptor ưu tiên nhãn
 * theo mã), mọi hành động audit mà module `o2o` ghi có nhãn, và các `targetType` mới được đặt tên (không rơi về mã thô ở trang Nhật ký).
 */
import { describe, expect, it } from 'vitest';

import { getMessageByCode } from '@/core/api/error.handler';
import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  auditTargetTypeLabel,
} from '@/shared/constants/audit-actions';

const O2O_CODES = Array.from({ length: 13 }, (_, i) => `O2O_${String(i + 1).padStart(3, '0')}`);

/** Hành động audit mà `be/src/modules/o2o` ghi thật (`grep "o2o\.\|print\."` các service admin/partner). */
const O2O_AUDIT_ACTIONS = [
  'o2o.location-create',
  'o2o.location-update',
  'o2o.location-hide',
  'o2o.location-unhide',
  'o2o.review-hide',
  'o2o.review-unhide',
  'print.shop-create',
  'print.shop-update',
  'print.shop-approve',
  'print.shop-suspend',
  'print.shop-accepting',
  'print.order-cancel-admin',
  'print.file-download',
];

describe('nhãn lỗi O2O', () => {
  it.each(O2O_CODES)('%s có thông điệp tiếng Việt', (code) => {
    expect(ERROR_CODE_MESSAGES[code]).toBeTruthy();
    expect(getMessageByCode(code)).toBe(ERROR_CODE_MESSAGES[code]);
  });

  it('O2O_007 / O2O_008 nói đúng ý PIN sai / bị khoá', () => {
    expect(ERROR_CODE_MESSAGES.O2O_007).toMatch(/PIN/);
    expect(ERROR_CODE_MESSAGES.O2O_008).toMatch(/PIN/);
  });
});

describe('nhãn audit O2O', () => {
  it.each(O2O_AUDIT_ACTIONS)('%s có nhãn (không rơi về mã thô)', (action) => {
    expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    expect(auditActionLabel(action)).not.toBe(action);
  });

  it.each([
    ['Location', 'Địa điểm'],
    ['LocationReview', 'Đánh giá địa điểm'],
    ['PrintShop', 'Tiệm in'],
    ['PrintOrder', 'Đơn in'],
  ])('targetType %s → %s', (type, label) => {
    expect(auditTargetTypeLabel(type)).toBe(label);
  });
});
