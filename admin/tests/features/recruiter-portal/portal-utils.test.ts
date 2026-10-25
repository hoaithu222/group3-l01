/**
 * Hàm thuần của cổng HR (p6-08): ánh xạ ứng viên (bỏ email/SĐT/tên nhóm), payload gửi (không trường tuỳ chọn trống), lỗi/đếm ngược, schema form khớp giới hạn của BE.
 */
import { describe, expect, it } from 'vitest';

import { OFFER_LIMITS } from '@/features/recruiter-portal/constants/portal.constants';
import { registerCompanyFormSchema } from '@/features/recruiter-portal/schemas/company.schema';
import { offerMessageFormSchema, sendOfferFormSchema } from '@/features/recruiter-portal/schemas/offer.schema';
import { hasChanges, toProfileDefaults, toRegisterPayload, toUpdatePayload } from '@/features/recruiter-portal/utils/company-payload';
import { toSendOfferPayload } from '@/features/recruiter-portal/utils/offer-payload';
import { formatCountdown } from '@/features/recruiter-portal/utils/portal-errors';
import { toTalentCard, toTalentProfile } from '@/features/recruiter-portal/utils/talent-mapper';
import type { TalentCard } from '@/features/recruiter-portal/types/talent.types';
import { makeCompany } from '../recruiter/recruiter-fixtures';
import { makeProfile, makeTalent } from './portal-fixtures';

describe('talent-mapper', () => {
  it('chỉ giữ trường được phép — email/SĐT/tên nhóm lọt vào bị bỏ', () => {
    const leaky = { ...makeTalent(), email: 'a@b.vn', phone: '0912345678', workspaceName: 'Nhóm Bí Mật' } as TalentCard;
    const mapped = toTalentCard(leaky);

    expect(Object.keys(mapped).sort()).toEqual(
      ['badgeCount', 'avatarUrl', 'contributionPct', 'contributionWorkspaces', 'displayName', 'headline', 'location', 'portfolioUrl', 'preferredRoles', 'skills', 'userId'].sort(),
    );
    expect(JSON.stringify(mapped)).not.toMatch(/a@b\.vn|0912345678|Nhóm Bí Mật/);
  });

  it('% đóng góp và số nhóm VẮNG khi ứng viên tắt; portfolio chỉ nhận http(s)', () => {
    const off = toTalentCard(makeTalent({ contributionPct: undefined, contributionWorkspaces: undefined, portfolioUrl: 'javascript:alert(1)' }));
    expect('contributionPct' in off).toBe(false);
    expect('contributionWorkspaces' in off).toBe(false);
    expect('portfolioUrl' in off).toBe(false);
    // Số nhóm không có nghĩa nếu không có %.
    expect('contributionWorkspaces' in toTalentCard(makeTalent({ contributionPct: undefined }))).toBe(false);
  });

  it('toTalentProfile ánh xạ cả huy hiệu và lời mời mở, bỏ trường lạ', () => {
    const p = toTalentProfile({ ...makeProfile(), secret: 'x', badges: [{ ...makeProfile().badges[0], internalNote: 'y' } as never] } as never);
    expect(JSON.stringify(p)).not.toMatch(/secret|internalNote/);
    expect(p.openOffer).toBeNull();
  });
});

describe('payload doanh nghiệp', () => {
  const base = { name: 'Công ty Acme', website: 'https://acme.vn', taxCode: '', description: '', industry: '', sizeRange: 'NONE' as const, logo: null, commitment: true };

  it('đăng ký: trường tuỳ chọn TRỐNG không gửi (BE `.strict()` + regex MST)', () => {
    expect(toRegisterPayload(base)).toEqual({ name: 'Công ty Acme', website: 'https://acme.vn' });
    expect(
      toRegisterPayload({ ...base, taxCode: '0312345678', description: 'Mô tả', industry: 'Phần mềm', sizeRange: 'S11_50', logo: { name: 'logo.png', url: '665f1c2e8a1b2c3d4e5f6a99' } }),
    ).toEqual({ name: 'Công ty Acme', website: 'https://acme.vn', taxCode: '0312345678', description: 'Mô tả', industry: 'Phần mềm', sizeRange: 'S11_50', logoAssetId: '665f1c2e8a1b2c3d4e5f6a99' });
  });

  it('cập nhật: chỉ trường ĐỔI; trường khoá (đã duyệt) không bao giờ gửi; xoá trường → null', () => {
    const company = makeCompany({ status: 'APPROVED', version: 7, description: 'Cũ', industry: 'Phần mềm', sizeRange: 'S11_50' });
    const defaults = toProfileDefaults(company);

    expect(hasChanges(toUpdatePayload(defaults, company, true))).toBe(false);
    const changed = toUpdatePayload({ ...defaults, name: 'Tên khác', description: '', sizeRange: 'NONE' }, company, true);
    expect(changed).toEqual({ companyId: company.id, expectedVersion: 7, description: null, sizeRange: null });
    expect('name' in changed).toBe(false);

    const rejected = toUpdatePayload({ ...defaults, name: 'Tên mới' }, makeCompany({ status: 'REJECTED' }), false);
    expect(rejected.name).toBe('Tên mới');
  });
});

describe('payload gửi lời mời', () => {
  const values = { title: 'Thực tập', employmentType: 'INTERNSHIP' as const, location: '', message: 'Nội dung đủ dài hai mươi ký tự', jd: null };
  const ctx = { companyId: 'c1', studentId: 's1', idempotencyKey: 'key-12345678' };

  it('khu vực/JD trống thì không gửi', () => {
    expect(toSendOfferPayload(values, ctx)).toEqual({
      companyId: 'c1',
      studentId: 's1',
      idempotencyKey: 'key-12345678',
      title: 'Thực tập',
      message: 'Nội dung đủ dài hai mươi ký tự',
      employmentType: 'INTERNSHIP',
    });
    const full = toSendOfferPayload({ ...values, location: 'Hà Nội', jd: { name: 'jd.pdf', url: '665f1c2e8a1b2c3d4e5f6a99' } }, ctx);
    expect(full.location).toBe('Hà Nội');
    expect(full.jdAssetId).toBe('665f1c2e8a1b2c3d4e5f6a99');
  });
});

describe('schema khớp giới hạn BE', () => {
  it('lời mời: tiêu đề 3–120, nội dung 20–2000, khu vực ≤ 60, JD chưa tải xong bị chặn', () => {
    const ok = { title: 'abc', employmentType: 'FULL_TIME', location: '', message: 'x'.repeat(OFFER_LIMITS.messageMin), jd: null };
    expect(sendOfferFormSchema.safeParse(ok).success).toBe(true);
    expect(sendOfferFormSchema.safeParse({ ...ok, title: 'ab' }).success).toBe(false);
    expect(sendOfferFormSchema.safeParse({ ...ok, title: 'a'.repeat(OFFER_LIMITS.titleMax + 1) }).success).toBe(false);
    expect(sendOfferFormSchema.safeParse({ ...ok, message: 'x'.repeat(OFFER_LIMITS.messageMin - 1) }).success).toBe(false);
    expect(sendOfferFormSchema.safeParse({ ...ok, message: 'x'.repeat(OFFER_LIMITS.messageMax + 1) }).success).toBe(false);
    expect(sendOfferFormSchema.safeParse({ ...ok, location: 'x'.repeat(OFFER_LIMITS.locationMax + 1) }).success).toBe(false);
    expect(sendOfferFormSchema.safeParse({ ...ok, jd: { name: 'jd.pdf', url: 'blob:dang-tai' } }).success).toBe(false);
    // Toàn khoảng trắng không qua `.trim().min()`.
    expect(sendOfferFormSchema.safeParse({ ...ok, title: '     ' }).success).toBe(false);
  });

  it('tin nhắn 1–2000 ký tự sau khi cắt trắng', () => {
    expect(offerMessageFormSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(offerMessageFormSchema.safeParse({ content: 'ok' }).success).toBe(true);
    expect(offerMessageFormSchema.safeParse({ content: 'x'.repeat(OFFER_LIMITS.threadMessageMax + 1) }).success).toBe(false);
  });

  it('đăng ký doanh nghiệp: tên ≥ 2, website http(s), MST 10 số (hoặc 10-3), cam kết bắt buộc', () => {
    const ok = { name: 'Ac', website: 'https://acme.vn', taxCode: '', description: '', industry: '', sizeRange: 'NONE', logo: null, commitment: true };
    expect(registerCompanyFormSchema.safeParse(ok).success).toBe(true);
    expect(registerCompanyFormSchema.safeParse({ ...ok, name: 'A' }).success).toBe(false);
    expect(registerCompanyFormSchema.safeParse({ ...ok, website: 'ftp://acme.vn' }).success).toBe(false);
    expect(registerCompanyFormSchema.safeParse({ ...ok, taxCode: '0312345678' }).success).toBe(true);
    expect(registerCompanyFormSchema.safeParse({ ...ok, taxCode: '0312345678-001' }).success).toBe(true);
    expect(registerCompanyFormSchema.safeParse({ ...ok, taxCode: '12345' }).success).toBe(false);
    expect(registerCompanyFormSchema.safeParse({ ...ok, commitment: false }).success).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('m:ss dưới 1 giờ, h:mm:ss từ 1 giờ, không bao giờ âm', () => {
    expect(formatCountdown(125)).toBe('2:05');
    expect(formatCountdown(59)).toBe('0:59');
    expect(formatCountdown(3725)).toBe('1:02:05');
    expect(formatCountdown(-5)).toBe('0:00');
  });
});
