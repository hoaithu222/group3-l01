/**
 * Kiểu dữ liệu chợ tài liệu (admin p7-02 P1) — viết tay theo BE thật `be/src/modules/coins`: `services/marketplace-presenter.ts` (`ListingDto`),
 * `dtos/marketplace.dto.ts` (`listingActionSchema`). Ngày là chuỗi ISO. Đổi hợp đồng ở BE thì đối chiếu lại file này.
 */
import type { CursorMeta } from '@/shared/types/api.types';

export type ListingContentType = 'STUDY_SET' | 'RESOURCE';
export type ListingStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'HIDDEN' | 'WITHDRAWN';

export interface AdminListing {
  id: string;
  sellerId: string;
  sellerName: string | null;
  contentType: ListingContentType;
  title: string;
  description: string | null;
  tags: string[];
  price: number;
  status: ListingStatus;
  sales: number;
  reportCount: number;
  hiddenReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** `GET /admin/economy/listings` — trang cursor (chỉ `PENDING_REVIEW`). */
export interface ListingsPage {
  data: AdminListing[];
  meta: CursorMeta;
}

export interface ListingActionPayload {
  id: string;
  reason: string;
}

/**
 * `GET/PUT /admin/system-config/economy` — cấu hình BẬT/TẮT chợ (`SystemConfigItem` phía BE, viết tay CHỈ phần dùng ở đây thay vì import feature
 * `system-config` — `feature-structure.md` admin "KHÔNG import từ feature khác"). `effective` = mặc định ⊕ override đã kẹp trần; `stored` = override
 * thô (rỗng khi chưa từng ghi/đã khôi phục mặc định).
 */
export interface EconomySettingsValue {
  marketplaceEnabled: boolean;
  marketplaceFeePercent: number;
  sellerMinLevel: number;
}

export interface EconomySettingsItem {
  effective: EconomySettingsValue;
  version: number;
  updatedAt: string | null;
}

export interface UpdateEconomySettingsPayload {
  value: Partial<EconomySettingsValue>;
  expectedVersion: number;
  reason: string;
}
