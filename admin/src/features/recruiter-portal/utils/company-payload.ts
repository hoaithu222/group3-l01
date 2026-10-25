import type { CompanyView } from '@/features/recruiter';

import type { CompanyProfileFormValues, RegisterCompanyFormValues } from '../schemas/company.schema';
import type { RegisterCompanyPayload, UpdateCompanyPayload } from '../types/portal.types';

/**
 * Form → payload đăng ký. Trường tuỳ chọn để TRỐNG thì KHÔNG gửi: `registerCompanySchema` của BE `.strict()` và ràng buộc MST bằng regex nên chuỗi rỗng bị từ chối
 * (400), còn "vắng" thì hợp lệ. `commitment` chỉ là điều kiện của giao diện, không có trong DTO của BE.
 */
export function toRegisterPayload(v: RegisterCompanyFormValues): RegisterCompanyPayload {
  return {
    name: v.name,
    website: v.website,
    ...(v.taxCode && { taxCode: v.taxCode }),
    ...(v.description && { description: v.description }),
    ...(v.industry && { industry: v.industry }),
    ...(v.sizeRange !== 'NONE' && { sizeRange: v.sizeRange }),
    ...(v.logo && { logoAssetId: v.logo.url }),
  };
}

/** Giá trị ban đầu của form hồ sơ từ doanh nghiệp đang có (`null` → rỗng). */
export function toProfileDefaults(c: CompanyView): CompanyProfileFormValues {
  return {
    name: c.name,
    website: c.website,
    taxCode: c.taxCode ?? '',
    description: c.description ?? '',
    industry: c.industry ?? '',
    sizeRange: c.sizeRange ?? 'NONE',
    logo: null,
  };
}

/**
 * Form → payload `PATCH` CHỈ với trường ĐỔI (BE ghi nhật ký đúng những gì đổi; gửi lại giá trị y nguyên vẫn hợp lệ nhưng thừa). Trường tuỳ chọn để trống mà trước đó có giá trị → `null`
 * (xoá). `locked` (đã duyệt/tạm ngưng): KHÔNG gửi tên/MST/website — BE trả `RECR_009` nếu giá trị khác; chỉ vận hành mới sửa được, giao diện đã khoá các ô đó.
 * Logo: chỉ gửi khi CHỌN logo mới (`logo` là id asset vừa tải); không có thao tác nào khác thì giữ nguyên.
 */
export function toUpdatePayload(
  v: CompanyProfileFormValues,
  company: CompanyView,
  locked: boolean,
): UpdateCompanyPayload {
  const payload: UpdateCompanyPayload = { companyId: company.id, expectedVersion: company.version };
  if (!locked) {
    if (v.name !== company.name) payload.name = v.name;
    if (v.website !== company.website) payload.website = v.website;
    const tax = v.taxCode === '' ? null : v.taxCode;
    if (tax !== company.taxCode) payload.taxCode = tax;
  }
  const description = v.description === '' ? null : v.description;
  if (description !== company.description) payload.description = description;
  const industry = v.industry === '' ? null : v.industry;
  if (industry !== company.industry) payload.industry = industry;
  const size = v.sizeRange === 'NONE' ? null : v.sizeRange;
  if (size !== company.sizeRange) payload.sizeRange = size;
  if (v.logo) payload.logoAssetId = v.logo.url;
  return payload;
}

/** Có trường nào để gửi ngoài `companyId`/`expectedVersion` không — không có thì bỏ qua lượt PATCH (không tốn phiên bản, không ghi nhật ký rỗng). */
export const hasChanges = (p: UpdateCompanyPayload): boolean =>
  Object.keys(p).some((k) => k !== 'companyId' && k !== 'expectedVersion');
