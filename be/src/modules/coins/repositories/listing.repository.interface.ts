import type { ListingContentTypeValue, ListingCreateInput, ListingPatch, ListingStatusValue, MarketplaceListing } from "../entities/coins.interface";
import type { TxHandle } from "./tx";

export interface ListingListQuery {
  q?: string;
  contentType?: ListingContentTypeValue;
  sort: "new" | "popular" | "price";
  offset: number;
  limit: number;
}

export interface ListingPage {
  items: MarketplaceListing[];
  hasMore: boolean;
}

/**
 * `MarketplaceListing` (p7-02 be.md §5 "Listing create/buy", P1) — mỗi nội dung (`contentType` + `contentId`) chỉ có MỘT tin (unique), nên niêm yết lại sau khi `WITHDRAWN` phải qua nhánh
 * "đã có tin cũ" ở service (không tạo dòng mới). `setStatus`/`incrementReportCount` KHÔNG cần CAS `version` (không tranh chấp với sửa của người bán ở mức nghiêm trọng — admin/hệ thống
 * ghi đè trạng thái là hành động có audit riêng); `updateIf` (sửa title/price/tags của người bán) MỚI cần CAS.
 */
export interface IListingRepository {
  find(id: string, tx?: TxHandle): Promise<MarketplaceListing | null>;
  findByContent(contentType: ListingContentTypeValue, contentId: string): Promise<MarketplaceListing | null>;
  /** `null` khi trùng `(contentType, contentId)` (unique — nội dung đã có tin, kể cả tin đã `WITHDRAWN`). */
  create(data: ListingCreateInput): Promise<MarketplaceListing | null>;
  /** CAS theo `version` — `null` khi lệch/không có (`RES_003`). */
  updateIf(id: string, expectedVersion: number, patch: ListingPatch): Promise<MarketplaceListing | null>;
  setStatus(id: string, status: ListingStatusValue, patch: { hiddenReason?: string | null }): Promise<MarketplaceListing | null>;
  incrementSales(id: string, tx: TxHandle): Promise<void>;
  /** `$inc reportCount` NGUYÊN TỬ, trả bản ghi SAU khi tăng (để service quyết định tự ẩn theo ngưỡng); `null` nếu không còn tồn tại. */
  incrementReportCount(id: string): Promise<MarketplaceListing | null>;
  /** Chợ (P1) — CHỈ tin `ACTIVE`, phân trang theo offset (danh sách vừa phải, không cần cursor ổn định theo nhiều tiêu chí sắp xếp). */
  listActive(query: ListingListQuery): Promise<ListingPage>;
  listBySeller(sellerId: string, opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplaceListing[]>;
  listPending(opts: { after?: { at: Date; id: string }; limit: number }): Promise<MarketplaceListing[]>;
  /** Tin ĐANG bán/ĐÃ ẩn có báo cáo (`reportCount > 0`), nhiều báo cáo nhất trước — hàng đợi kiểm duyệt của tab "Chợ" (admin.md §2.3). */
  listReported(opts: { offset: number; limit: number }): Promise<ListingPage>;
  /** Số tin ĐANG hoạt động (`PENDING_REVIEW`/`ACTIVE`) của một người — chặn `LIMITS.marketplace.listingsPerUserMax`. */
  countActiveOrPending(sellerId: string): Promise<number>;
  /** Người này có từng được duyệt (đã/đang `ACTIVE`, kể cả đã `HIDDEN`/`WITHDRAWN` sau đó) — điều kiện bỏ qua kiểm duyệt cho lần niêm yết sau. */
  hasApprovedListing(sellerId: string): Promise<boolean>;
}
