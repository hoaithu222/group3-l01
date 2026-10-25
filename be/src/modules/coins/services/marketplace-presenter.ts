import type { ListingContentTypeValue, ListingStatusValue, MarketplaceListing, MarketplacePurchase } from "../entities/coins.interface";
import type { ContentPreviewItem } from "../ports/content-access.port";

export interface ListingDto {
  id: string;
  sellerId: string;
  sellerName: string | null;
  contentType: ListingContentTypeValue;
  title: string;
  description: string | null;
  tags: string[];
  price: number;
  status: ListingStatusValue;
  sales: number;
  reportCount: number;
  hiddenReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListingDetailDto extends ListingDto {
  /** Người gọi ĐÃ mua tin này (mở khoá nút "Mở tài liệu" thay vì "Mua"). */
  purchased: boolean;
  /** `null` khi loại nội dung không có preview theo mục (RESOURCE) — app.md "preview giới hạn". */
  preview: ContentPreviewItem[] | null;
}

export interface PurchaseDto {
  id: string;
  listingId: string;
  listingTitle: string;
  listingContentType: ListingContentTypeValue;
  price: number;
  fee: number;
  accessRef: string | null;
  refundedAt: string | null;
  createdAt: string;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export const toListingDto = (l: MarketplaceListing, sellerName: string | null): ListingDto => ({
  id: l.id,
  sellerId: l.sellerId,
  sellerName,
  contentType: l.contentType,
  title: l.title,
  description: l.description,
  tags: l.tags,
  price: l.price,
  status: l.status,
  sales: l.sales,
  reportCount: l.reportCount,
  hiddenReason: l.hiddenReason,
  version: l.version,
  createdAt: l.createdAt.toISOString(),
  updatedAt: l.updatedAt.toISOString(),
});

export const toListingDetailDto = (l: MarketplaceListing, sellerName: string | null, purchased: boolean, preview: ContentPreviewItem[] | null): ListingDetailDto => ({
  ...toListingDto(l, sellerName),
  purchased,
  preview,
});

export const toPurchaseDto = (p: MarketplacePurchase, listing: Pick<MarketplaceListing, "title" | "contentType"> | null): PurchaseDto => ({
  id: p.id,
  listingId: p.listingId,
  listingTitle: listing?.title ?? "",
  listingContentType: listing?.contentType ?? "STUDY_SET",
  price: p.price,
  fee: p.fee,
  accessRef: p.accessRef,
  refundedAt: iso(p.refundedAt),
  createdAt: p.createdAt.toISOString(),
});
