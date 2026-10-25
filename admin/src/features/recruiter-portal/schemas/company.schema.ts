import { z } from 'zod';

import {
  companyNameField,
  descriptionField,
  industryField,
  taxCodeField,
  websiteField,
} from '@/features/recruiter';

/** `objectIdSchema` BE — id asset. */
const ASSET_ID_RE = /^[a-f0-9]{24}$/i;

/**
 * Logo = giá trị của `FileField` (`UploadedFile`) — `url` LÀ id asset chứ không phải URL: handler `createAssetUploader` trả id (xem `core/uploads`).
 * `null` = chưa chọn/đã gỡ. Tệp đang tải dở có `url` chưa phải id → báo lỗi thay vì lặng lẽ gửi đi thiếu logo.
 */
const logoField = z
  .object({
    id: z.string().optional(),
    name: z.string(),
    url: z.string().regex(ASSET_ID_RE, 'Logo chưa tải xong, hãy đợi hoặc chọn lại'),
    size: z.number().optional(),
  })
  .nullable();

/** Ô chọn quy mô cho phép "chưa chọn" — `NONE` (Radix Select KHÔNG nhận giá trị rỗng nên không dùng `''`); bỏ qua khi gửi. */
const sizeField = z.enum(['NONE', 'S1_10', 'S11_50', 'S51_200', 'S201_1000', 'S1000_PLUS']);

/**
 * Khớp `registerCompanySchema` của BE (`be/src/modules/recruiter/dtos/company.dto.ts`): tên 2–120, website http(s) ≤ 200, MST 10 số (hoặc 10 số-3 số), mô tả ≤ 2000, ngành ≤ 60,
 * quy mô 5 bậc. Cam kết sử dụng dữ liệu ứng viên đúng mục đích là điều kiện CỦA GIAO DIỆN (BE không có trường này): không tick thì không gửi.
 */
export const registerCompanyFormSchema = z.object({
  name: companyNameField,
  website: websiteField,
  taxCode: taxCodeField,
  description: descriptionField,
  industry: industryField,
  sizeRange: sizeField,
  logo: logoField,
  commitment: z.boolean().refine((v) => v, 'Bạn cần cam kết sử dụng dữ liệu ứng viên đúng mục đích'),
});
export type RegisterCompanyFormValues = z.infer<typeof registerCompanyFormSchema>;

/** Form hồ sơ doanh nghiệp (tab Công ty, OWNER). Tên/MST/website bị KHOÁ khi đã duyệt — khoá ở giao diện, BE trả `RECR_009` nếu vẫn gửi giá trị khác. */
export const companyProfileFormSchema = z.object({
  name: companyNameField,
  website: websiteField,
  taxCode: taxCodeField,
  description: descriptionField,
  industry: industryField,
  sizeRange: sizeField,
  logo: logoField,
});
export type CompanyProfileFormValues = z.infer<typeof companyProfileFormSchema>;
