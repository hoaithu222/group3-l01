/**
 * Kiểu phản hồi chợ tài liệu — khớp `marketplace-presenter.ts` ở BE (p7-02 P1). Xu là SỐ NGUYÊN ẢO; ngày là chuỗi ISO.
 */
export type ListingContentType = 'STUDY_SET' | 'RESOURCE';
export type ListingStatus = 'PENDING_REVIEW' | 'ACTIVE' | 'HIDDEN' | 'WITHDRAWN';
export type ListingReportReason = 'COPYRIGHT' | 'SPAM' | 'INAPPROPRIATE' | 'WRONG_CONTENT' | 'OTHER';
export type ListingSort = 'new' | 'popular' | 'price';

export interface Listing {
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

export interface ListingPreviewItem {
  prompt: string;
  type: string;
}

export interface ListingDetail extends Listing {
  /** Tôi đã mua tin này — mở khoá "Mở tài liệu" thay vì "Mua". */
  purchased: boolean;
  /** `null` khi loại nội dung không có preview theo mục (RESOURCE). */
  preview: ListingPreviewItem[] | null;
}

export interface ListingsPage {
  data: Listing[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

export interface Purchase {
  id: string;
  listingId: string;
  listingTitle: string;
  listingContentType: ListingContentType;
  price: number;
  fee: number;
  accessRef: string | null;
  refundedAt: string | null;
  createdAt: string;
}

export interface PurchasesPage {
  data: Purchase[];
  meta: { nextCursor: string | null; hasMore: boolean; limit: number };
}

export interface CreateListingInput {
  contentType: ListingContentType;
  contentId: string;
  title: string;
  description?: string;
  tags: string[];
  price: number;
}

export interface UpdateListingInput {
  expectedVersion: number;
  title?: string;
  description?: string | null;
  tags?: string[];
  price?: number;
}

export interface BuyListingResult {
  balance: number;
  access: {
    kind: 'STUDY_SET_COPY' | 'RESOURCE_ENTITLEMENT';
    accessRef: string;
    note?: string;
  };
}

/** Nội dung của tôi đủ điều kiện niêm yết (`ContentPickerSheet` — chỉ bộ học PUBLIC, P1 chưa dựng luồng chọn RESOURCE trong app, xem báo cáo bàn giao). */
export interface MyStudySetOption {
  id: string;
  title: string;
  itemCount: number;
}
