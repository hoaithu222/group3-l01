/**
 * Hàm thuần của phân hệ `recruiter` (p6-08): đối chiếu email chủ sở hữu ↔ website, liên kết ngoài an toàn, tổng hợp/tỉ lệ thống kê, nhãn kỳ.
 */
import { describe, expect, it } from 'vitest';

import { COMPANY_STATUS_META, ACTIONS_BY_STATUS } from '@/features/recruiter/constants/recruiter.constants';
import { domainOfEmail, ownerEmailMismatchesWebsite } from '@/features/recruiter/utils/email-domain';
import { safeExternalUrl } from '@/features/recruiter/utils/external-url';
import { periodLabel, ratePercent, totalOffers } from '@/features/recruiter/utils/stats.utils';

describe('ownerEmailMismatchesWebsite', () => {
  const owner = (email: string) => ({ role: 'OWNER' as const, email });

  it('cùng tên miền hoặc tên miền phụ → không cảnh báo', () => {
    expect(ownerEmailMismatchesWebsite([owner('an@acme.vn')], 'acme.vn')).toBe(false);
    expect(ownerEmailMismatchesWebsite([owner('an@hr.acme.vn')], 'acme.vn')).toBe(false);
    expect(ownerEmailMismatchesWebsite([owner('AN@ACME.VN')], 'acme.vn')).toBe(false);
  });

  it('email khác tên miền (kể cả hậu tố trùng chữ nhưng không phải tên miền phụ) → cảnh báo', () => {
    expect(ownerEmailMismatchesWebsite([owner('an@gmail.com')], 'acme.vn')).toBe(true);
    expect(ownerEmailMismatchesWebsite([owner('an@notacme.vn')], 'acme.vn')).toBe(true);
  });

  it('chỉ cần MỘT chủ sở hữu khớp là đủ; nhân viên thường không tính', () => {
    expect(ownerEmailMismatchesWebsite([owner('an@gmail.com'), owner('binh@acme.vn')], 'acme.vn')).toBe(false);
    expect(ownerEmailMismatchesWebsite([{ role: 'RECRUITER' as const, email: 'x@acme.vn' }, owner('an@gmail.com')], 'acme.vn')).toBe(true);
  });

  it('thiếu dữ liệu để so (không tên miền website, không chủ sở hữu, email trống do ẩn danh hoá) → KHÔNG cảnh báo', () => {
    expect(ownerEmailMismatchesWebsite([owner('an@gmail.com')], null)).toBe(false);
    expect(ownerEmailMismatchesWebsite([], 'acme.vn')).toBe(false);
    expect(ownerEmailMismatchesWebsite([owner('')], 'acme.vn')).toBe(false);
  });

  it('domainOfEmail', () => {
    expect(domainOfEmail('an@Acme.VN')).toBe('acme.vn');
    expect(domainOfEmail('khong-co-a-cong')).toBeNull();
    expect(domainOfEmail('an@')).toBeNull();
  });
});

describe('safeExternalUrl', () => {
  it('chỉ nhận http(s)', () => {
    expect(safeExternalUrl('https://acme.vn')).toBe('https://acme.vn/');
    expect(safeExternalUrl('http://acme.vn/about')).toBe('http://acme.vn/about');
  });

  it('javascript:, data:, file:, chuỗi rỗng/hỏng → null', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'acme.vn', '', null, undefined]) {
      expect(safeExternalUrl(bad)).toBeNull();
    }
  });
});

describe('thống kê', () => {
  const byMonth = [
    { period: '2026-08', sent: 20, read: 10, interested: 4, declined: 3, expired: 1 },
    { period: '2026-09', sent: 30, read: 20, interested: 6, declined: 2, expired: 0 },
  ];

  it('totalOffers cộng dồn các tháng', () => {
    expect(totalOffers(byMonth)).toEqual({ sent: 50, read: 30, interested: 10, declined: 5, expired: 1 });
    expect(totalOffers([])).toEqual({ sent: 0, read: 0, interested: 0, declined: 0, expired: 0 });
  });

  it('ratePercent làm tròn 1 chữ số; chưa có mẫu số → null (không phải 0)', () => {
    expect(ratePercent(30, 50)).toBe(60);
    expect(ratePercent(1, 3)).toBe(33.3);
    expect(ratePercent(0, 10)).toBe(0);
    expect(ratePercent(5, 0)).toBeNull();
  });

  it('periodLabel 2026-09 → 09/2026; giá trị lạ giữ nguyên', () => {
    expect(periodLabel('2026-09')).toBe('09/2026');
    expect(periodLabel('lạ')).toBe('lạ');
  });
});

describe('máy trạng thái ở giao diện khớp BE', () => {
  it('hành động theo trạng thái', () => {
    expect(ACTIONS_BY_STATUS.PENDING).toEqual(['approve', 'reject']);
    expect(ACTIONS_BY_STATUS.APPROVED).toEqual(['suspend']);
    expect(ACTIONS_BY_STATUS.SUSPENDED).toEqual(['reinstate']);
    expect(ACTIONS_BY_STATUS.REJECTED).toEqual([]);
  });

  it('nhãn trạng thái tiếng Việt cho cả bốn trạng thái', () => {
    expect(Object.values(COMPANY_STATUS_META).map((m) => m.label)).toEqual(['Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Tạm ngưng']);
  });
});
