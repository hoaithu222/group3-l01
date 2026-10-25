/**
 * Kiểu cổng HR (p6-08) — viết tay theo BE thật (`be/src/modules/recruiter/services/{recruiter.presenter,company.service,company-member.service}.ts`,
 * `dtos/company.dto.ts`). Hồ sơ doanh nghiệp/nhân sự/hạn mức dùng chung với vận hành nên lấy từ `@/features/recruiter`.
 * `companyId` LUÔN lấy từ `GET /me/company` (một người ≤ 1 doanh nghiệp) — không bao giờ cho người dùng nhập.
 */
import type {
  CompanySize,
  CompanyUsage,
  CompanyView,
  MemberRole,
} from '@/features/recruiter';
import type { CursorMeta } from '@/shared/types/api.types';

/** Danh sách phân trang cursor — `meta.nextCursor` null khi hết. */
export interface CursorPage<T> {
  data: T[];
  meta: CursorMeta;
}

/** Hành động của thành viên trong doanh nghiệp (`companyActionsFor` ở BE): `talent`/`offer` CHỈ khi công ty đã được duyệt. */
export type CompanyScopeAction = 'company.view' | 'company.manage' | 'company.talent' | 'company.offer';

/** `GET /me/company` — kể cả doanh nghiệp đang chờ duyệt / bị từ chối / tạm ngưng. */
export interface MyCompany {
  company: CompanyView;
  membership: { role: MemberRole; status: string; joinedAt: string };
  permissions: CompanyScopeAction[];
}

/** `GET /companies/:id` — hồ sơ + hạn mức tháng. */
export interface CompanyDetail {
  company: CompanyView;
  usage: CompanyUsage;
}

/** `POST /companies` (`registerCompanySchema`, `.strict()`): trường tuỳ chọn để TRỐNG thì KHÔNG gửi (BE từ chối chuỗi rỗng ở MST). */
export interface RegisterCompanyPayload {
  name: string;
  website: string;
  taxCode?: string;
  description?: string;
  logoAssetId?: string;
  industry?: string;
  sizeRange?: CompanySize;
}

/** `PATCH /companies/:id` (OWNER) — chỉ trường GỬI mới đổi; `null` xoá trường tuỳ chọn; `expectedVersion` lệch → `409 RES_003`. */
export interface UpdateCompanyPayload {
  companyId: string;
  expectedVersion: number;
  name?: string;
  website?: string;
  taxCode?: string | null;
  description?: string | null;
  logoAssetId?: string | null;
  industry?: string | null;
  sizeRange?: CompanySize | null;
}

export interface AddMemberPayload {
  companyId: string;
  email: string;
  role: MemberRole;
}

export interface RemoveMemberPayload {
  companyId: string;
  userId: string;
}

