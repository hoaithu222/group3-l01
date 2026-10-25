/**
 * Hàm thuần của phần Phase 3 trong `workspace`: che email, hạn của khách, quy đổi GiB, % dung lượng.
 */
import { describe, expect, it } from 'vitest';

import {
  ACCESS_AUDIT_ACTIONS,
  GUEST_EXPIRING_SOON_HOURS,
} from '@/features/workspace/constants/workspace-access.constants';
import { RESOURCE_AUDIT_ACTIONS } from '@/features/workspace/constants/workspace-resources.constants';
import { auditActionLabel } from '@/shared/constants/audit-actions';
import { resourceTypeLabel } from '@/features/workspace/utils/workspace-resources.utils';
import {
  bytesToGib,
  formatGib,
  formatUsagePercent,
  gibToBytes,
  usagePercent,
  usageVariantOf,
} from '@/features/workspace/utils/workspace-resources.utils';
import { shortId } from '@/features/workspace/utils/short-id.utils';
import { guestExpiryState, maskEmail } from '@/features/workspace/utils/workspace-access.utils';

const GIB = 1024 ** 3;

describe('maskEmail', () => {
  it('ký tự đầu + *** + tên miền', () => {
    expect(maskEmail('linh@gmail.com')).toBe('l***@gmail.com');
    expect(maskEmail('a@b.vn')).toBe('a***@b.vn');
  });

  it('idempotent: email BE đã che giữ nguyên', () => {
    expect(maskEmail('l***@gmail.com')).toBe('l***@gmail.com');
    expect(maskEmail(maskEmail('linh@gmail.com'))).toBe('l***@gmail.com');
  });

  it('không phải email → che hết, không lộ chuỗi gốc', () => {
    expect(maskEmail('khong-phai-email')).toBe('***');
    expect(maskEmail('@gmail.com')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });
});

describe('guestExpiryState', () => {
  const now = new Date('2026-09-19T10:00:00.000Z');
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();

  it('quá hạn (≤ 0 giờ) → expired', () => {
    expect(guestExpiryState(at(-1), now)).toBe('expired');
    expect(guestExpiryState(at(0), now)).toBe('expired');
  });

  it(`còn ≤ ${GUEST_EXPIRING_SOON_HOURS} giờ → soon; quá ngưỡng một chút → ok`, () => {
    expect(guestExpiryState(at(1), now)).toBe('soon');
    expect(guestExpiryState(at(GUEST_EXPIRING_SOON_HOURS), now)).toBe('soon');
    expect(guestExpiryState(at(GUEST_EXPIRING_SOON_HOURS + 0.5), now)).toBe('ok');
    expect(guestExpiryState(at(24 * 30), now)).toBe('ok');
  });
});

describe('quy đổi và định dạng dung lượng', () => {
  it('GiB ⇄ byte, làm tròn 2 chữ số', () => {
    expect(gibToBytes(0.5)).toBe(GIB / 2);
    expect(gibToBytes(3)).toBe(3 * GIB);
    expect(bytesToGib(2 * GIB)).toBe(2);
    expect(bytesToGib(GIB / 2)).toBe(0.5);
    expect(bytesToGib(1.5 * GIB)).toBe(1.5);
  });

  it('formatGib: hạn mức nhỏ nhất in "0,5" (không làm tròn thành "1"), số nguyên không thừa ",0"', () => {
    expect(formatGib(0.5)).toBe('0,5');
    expect(formatGib(1.5)).toBe('1,5');
    expect(formatGib(100)).toBe('100');
    expect(formatGib(1000)).toBe('1.000');
  });

  it('% dùng: null khi hạn mức 0/hỏng (không nói dối 0%)', () => {
    expect(usagePercent(1.5 * GIB, 2 * GIB)).toBe(75);
    expect(usagePercent(0, 2 * GIB)).toBe(0);
    expect(usagePercent(1, 0)).toBeNull();
    expect(usagePercent(Number.NaN, 2 * GIB)).toBeNull();
    expect(formatUsagePercent(75)).toBe('75%');
    expect(formatUsagePercent(75.3)).toBe('75,3%');
    expect(formatUsagePercent(null)).toBe('—');
  });

  it('màu thanh: càng đầy càng đỏ; không tính được → trung tính', () => {
    expect(usageVariantOf(10)).toBe('primary');
    expect(usageVariantOf(70)).toBe('warning');
    expect(usageVariantOf(89.9)).toBe('warning');
    expect(usageVariantOf(90)).toBe('error');
    expect(usageVariantOf(100)).toBe('error');
    expect(usageVariantOf(null)).toBe('neutral');
  });

  it('nhãn loại tệp; loại lạ hiện chính mã', () => {
    expect(resourceTypeLabel('PDF')).toBe('PDF');
    expect(resourceTypeLabel('IMAGE')).toBe('Ảnh');
    expect(resourceTypeLabel('HOLOGRAM')).toBe('HOLOGRAM');
  });

  it('mã rút gọn: # + 6 ký tự cuối', () => {
    expect(shortId('64a1b2c3d4e5f60718293a01')).toBe('#293a01');
  });
});

describe('mã hành động của khối nhật ký (lọc IN phía BE)', () => {
  it('nhật ký truy cập: ≤ 30 mã (giới hạn `actionFilterSchema` BE), không trùng, mọi mã đều có nhãn tiếng Việt', () => {
    expect(ACCESS_AUDIT_ACTIONS.length).toBeLessThanOrEqual(30);
    expect(new Set(ACCESS_AUDIT_ACTIONS).size).toBe(ACCESS_AUDIT_ACTIONS.length);
    for (const action of ACCESS_AUDIT_ACTIONS) {
      expect(auditActionLabel(action), `thiếu nhãn ${action}`).not.toBe(action);
    }
  });

  it('nhật ký hạn mức kho tài liệu: đúng hai mã BE ghi, đều có nhãn', () => {
    expect([...RESOURCE_AUDIT_ACTIONS]).toEqual(['resource.purge', 'resource.quota-override']);
    for (const action of RESOURCE_AUDIT_ACTIONS) {
      expect(auditActionLabel(action), `thiếu nhãn ${action}`).not.toBe(action);
    }
  });
});
