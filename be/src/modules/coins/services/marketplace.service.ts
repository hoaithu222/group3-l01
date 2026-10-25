import { LIMITS } from "../../../core/constants/limits";
import { decodeCursor, decodeOffsetCursor, encodeCursor, encodeOffsetCursor } from "../../../core/utils/cursor";
import { normalizeSearch } from "../../../core/utils/normalize";
import type { AuthUser } from "../../../core/types/express";
import type { CursorResponse } from "../../../core/utils/response";
import { coinErrors } from "../coins.errors";
import type { ListingContentTypeValue, MarketplaceListing, MarketplacePurchase } from "../entities/coins.interface";
import type { IMarketplaceDirectory } from "../repositories/marketplace-directory";
import type { IListingRepository } from "../repositories/listing.repository.interface";
import type { IPurchaseRepository } from "../repositories/purchase.repository.interface";
import { UniqueViolationError, type ITxRunner } from "../repositories/tx";
import type { ICoinWalletRepository } from "../repositories/wallet.repository.interface";
import type { IContentAccessPort } from "../ports/content-access.port";
import type { CoinLedgerService } from "./coin-ledger.service";
import { toListingDetailDto, toListingDto, toPurchaseDto, type ListingDetailDto, type ListingDto, type PurchaseDto } from "./marketplace-presenter";
import type { ICoinsAudit, ICoinsEmitter } from "./coins.ports";
import type { IMarketplaceConfig } from "./marketplace.ports";

export interface MarketplaceDeps {
  listings: IListingRepository;
  purchases: IPurchaseRepository;
  wallets: ICoinWalletRepository;
  ledger: CoinLedgerService;
  content: IContentAccessPort;
  directory: IMarketplaceDirectory;
  config: IMarketplaceConfig;
  tx: ITxRunner;
  emitter: ICoinsEmitter;
  audit: ICoinsAudit;
  now?: () => Date;
}

export interface CreateListingInput {
  contentType: ListingContentTypeValue;
  contentId: string;
  title: string;
  description?: string | null;
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

export interface ListingListQueryDto {
  cursor?: string;
  limit: number;
  q?: string;
  contentType?: ListingContentTypeValue;
  sort: "new" | "popular" | "price";
}

export interface ReportListingInput {
  reason: string;
  description?: string;
}

/**
 * Chợ tài liệu (p7-02 be.md §5 "Listing create/buy/report", "Hide & refund", P1). Cờ `economy.marketplaceEnabled` (mặc định TẮT) chặn MỌI endpoint đọc/ghi công khai — trang admin (duyệt/ẩn)
 * KHÔNG bị chặn bởi cờ này (quản trị viên vẫn xử lý hàng chờ dù chợ đang tắt với người dùng).
 *
 * Mua: nhân MỘT `MarketplacePurchase` (unique `[listingId, buyerId]`) → `CoinLedgerService.transfer` (refType `PURCHASE`, refId = id của chính dòng mua — duy nhất theo TỪNG lần mua nên
 * một tin bán được cho NHIỀU người không đụng khoá idempotent của sổ cái) → `incrementSales` cùng transaction → cấp quyền nội dung (NGOÀI transaction — best-effort, xem `content-access.port`).
 *
 * Ẩn & hoàn tiền: đồng bộ NGAY trong cùng lượt gọi (admin ẩn / tự ẩn do đủ số báo cáo) thay vì outbox job `listing.refund` như bản kế hoạch — đơn giản hoá phạm vi P1 (không thêm hàng đợi
 * mới), xem báo cáo bàn giao. Người bán không đủ xu hoàn: hoàn tối đa số dư hiện có, phần thiếu người mua vẫn được hoàn ĐỦ qua dòng `ADJUST_ADMIN` hệ thống (`actorId: null`).
 */
export class MarketplaceService {
  private readonly now: () => Date;

  constructor(private readonly d: MarketplaceDeps) {
    this.now = d.now ?? (() => new Date());
  }

  private async assertEnabled(): Promise<void> {
    const cfg = await this.d.config.settings();
    if (!cfg.enabled) throw coinErrors.marketplaceDisabled();
  }

  private async requireListing(id: string): Promise<MarketplaceListing> {
    const listing = await this.d.listings.find(id);
    if (!listing) throw coinErrors.notFound("Không tìm thấy tin niêm yết");
    return listing;
  }

  private async withSellerNames(rows: MarketplaceListing[]): Promise<Map<string, string>> {
    const names = await this.d.directory.getUsersBrief(rows.map((r) => r.sellerId));
    return new Map([...names].map(([id, v]) => [id, v.name]));
  }

  // ── chợ công khai ──

  async list(_userId: string, query: ListingListQueryDto): Promise<CursorResponse<ListingDto>> {
    await this.assertEnabled();
    const offset = query.cursor ? decodeOffsetCursor(query.cursor) : 0;
    const page = await this.d.listings.listActive({ q: query.q ? normalizeSearch(query.q) : undefined, contentType: query.contentType, sort: query.sort, offset, limit: query.limit });
    const names = await this.withSellerNames(page.items);
    return {
      data: page.items.map((l) => toListingDto(l, names.get(l.sellerId) ?? null)),
      meta: { nextCursor: page.hasMore ? encodeOffsetCursor(offset + query.limit) : null, hasMore: page.hasMore, limit: query.limit },
    };
  }

  async detail(userId: string, listingId: string): Promise<ListingDetailDto> {
    await this.assertEnabled();
    const listing = await this.requireListing(listingId);
    if (listing.status === "WITHDRAWN" || (listing.status === "PENDING_REVIEW" && listing.sellerId !== userId)) throw coinErrors.notFound("Không tìm thấy tin niêm yết");
    const [names, purchase, preview] = await Promise.all([
      this.withSellerNames([listing]),
      this.d.purchases.findByListingAndBuyer(listing.id, userId),
      this.d.content.preview(listing.contentType, listing.contentId),
    ]);
    return toListingDetailDto(listing, names.get(listing.sellerId) ?? null, purchase !== null, preview);
  }

  // ── người bán ──

  async create(seller: AuthUser, dto: CreateListingInput): Promise<ListingDto> {
    await this.assertEnabled();
    const activeCount = await this.d.listings.countActiveOrPending(seller.id);
    if (activeCount >= LIMITS.marketplace.listingsPerUserMax) throw coinErrors.listingLimitReached(LIMITS.marketplace.listingsPerUserMax);
    await this.d.content.assertEligible(seller.id, dto.contentType, dto.contentId);
    const [cfg, level, approved] = await Promise.all([this.d.config.settings(), this.d.directory.getLevel(seller.id), this.d.listings.hasApprovedListing(seller.id)]);
    const status = level >= cfg.sellerMinLevel && approved ? "ACTIVE" : "PENDING_REVIEW";
    const created = await this.d.listings.create({
      sellerId: seller.id,
      contentType: dto.contentType,
      contentId: dto.contentId,
      title: dto.title,
      normalizedTitle: normalizeSearch(dto.title),
      description: dto.description ?? null,
      tags: dto.tags,
      price: dto.price,
      status,
      hiddenReason: null,
    });
    if (!created) throw coinErrors.alreadyListed();
    const names = await this.withSellerNames([created]);
    return toListingDto(created, names.get(created.sellerId) ?? null);
  }

  async update(seller: AuthUser, listingId: string, dto: UpdateListingInput): Promise<ListingDto> {
    const listing = await this.requireListing(listingId);
    if (listing.sellerId !== seller.id) throw coinErrors.notFound("Không tìm thấy tin niêm yết");
    if (listing.status !== "PENDING_REVIEW" && listing.status !== "ACTIVE") throw coinErrors.wrongListingStatus("Tin niêm yết không ở trạng thái có thể sửa");
    const updated = await this.d.listings.updateIf(listing.id, dto.expectedVersion, {
      ...(dto.title !== undefined && { title: dto.title, normalizedTitle: normalizeSearch(dto.title) }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.tags !== undefined && { tags: dto.tags }),
      ...(dto.price !== undefined && { price: dto.price }),
    });
    if (!updated) throw coinErrors.listingVersionConflict(listing.version);
    const names = await this.withSellerNames([updated]);
    return toListingDto(updated, names.get(updated.sellerId) ?? null);
  }

  async withdraw(seller: AuthUser, listingId: string): Promise<ListingDto> {
    const listing = await this.requireListing(listingId);
    if (listing.sellerId !== seller.id) throw coinErrors.notFound("Không tìm thấy tin niêm yết");
    if (listing.status === "WITHDRAWN") return toListingDto(listing, null);
    const updated = await this.d.listings.setStatus(listing.id, "WITHDRAWN", { hiddenReason: null });
    const names = await this.withSellerNames(updated ? [updated] : []);
    return toListingDto(updated ?? listing, updated ? (names.get(updated.sellerId) ?? null) : null);
  }

  async myListings(sellerId: string, query: { cursor?: string; limit: number }): Promise<CursorResponse<ListingDto>> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.d.listings.listBySeller(sellerId, { after: after ?? undefined, limit: query.limit + 1 });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return { data: page.map((l) => toListingDto(l, null)), meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit: query.limit } };
  }

  // ── mua / báo cáo ──

  async buy(buyer: AuthUser, listingId: string): Promise<{ balance: number; access: { kind: string; accessRef: string; note?: string } }> {
    const cfg = await this.d.config.settings();
    if (!cfg.enabled) throw coinErrors.marketplaceDisabled();
    const listing = await this.requireListing(listingId);
    if (listing.status !== "ACTIVE") throw coinErrors.notFound("Không tìm thấy tin niêm yết");
    if (listing.sellerId === buyer.id) throw coinErrors.contentNotEligible();
    if (await this.d.purchases.findByListingAndBuyer(listing.id, buyer.id)) throw coinErrors.alreadyOwned();
    await this.d.ledger.ensureWallets([buyer.id, listing.sellerId]);
    const fee = Math.floor((listing.price * cfg.feePercent) / 100);
    try {
      const out = await this.d.tx.run(async (tx) => {
        const purchase = await this.d.purchases.create({ listingId: listing.id, buyerId: buyer.id, price: listing.price, fee }, tx);
        const transfer = await this.d.ledger.transfer(tx, { fromUserId: buyer.id, toUserId: listing.sellerId, amount: listing.price, fee, refType: "PURCHASE", refId: purchase.id });
        await this.d.listings.incrementSales(listing.id, tx);
        return { purchase, transfer };
      });
      const access = await this.d.content.grantAccess(buyer.id, listing.contentType, listing.contentId);
      await this.d.purchases.setAccessRef(out.purchase.id, access.accessRef);
      this.d.emitter.updated(buyer.id, { coins: { balance: out.transfer.from.balance, delta: -listing.price, reason: "SALE" } });
      this.d.emitter.updated(listing.sellerId, { coins: { balance: out.transfer.to.balance, delta: listing.price - fee, reason: "SALE" } });
      return { balance: out.transfer.from.balance, access };
    } catch (err) {
      if (err instanceof UniqueViolationError) throw coinErrors.alreadyOwned();
      throw err;
    }
  }

  async myPurchases(buyerId: string, query: { cursor?: string; limit: number }): Promise<CursorResponse<PurchaseDto>> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.d.purchases.listByBuyer(buyerId, { after: after ?? undefined, limit: query.limit + 1 });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const listings = new Map((await Promise.all(page.map((p) => this.d.listings.find(p.listingId)))).flatMap((l) => (l ? [[l.id, l] as const] : [])));
    return {
      data: page.map((p) => toPurchaseDto(p, listings.get(p.listingId) ?? null)),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit: query.limit },
    };
  }

  async report(reporter: AuthUser, listingId: string, _dto: ReportListingInput): Promise<{ reportCount: number }> {
    const listing = await this.requireListing(listingId);
    if (listing.status === "WITHDRAWN") throw coinErrors.notFound("Không tìm thấy tin niêm yết");
    const updated = await this.d.listings.incrementReportCount(listing.id);
    if (!updated) throw coinErrors.notFound("Không tìm thấy tin niêm yết");
    if (updated.status === "ACTIVE" && updated.reportCount >= LIMITS.marketplace.autoHideReports) {
      await this.applyHide(updated, `Tự động ẩn — đạt ${String(LIMITS.marketplace.autoHideReports)} lượt báo cáo`);
    }
    return { reportCount: updated.reportCount };
  }

  // ── admin ──

  /** Tin ĐANG bán/ĐÃ ẩn có báo cáo (admin.md §2.3 "Moderation — listing") — nhiều báo cáo nhất trước, phân trang offset (hàng đợi nhỏ, không cần cursor ổn định). */
  async adminListReported(query: { cursor?: string; limit: number }): Promise<CursorResponse<ListingDto>> {
    const offset = query.cursor ? decodeOffsetCursor(query.cursor) : 0;
    const page = await this.d.listings.listReported({ offset, limit: query.limit });
    const names = await this.withSellerNames(page.items);
    return {
      data: page.items.map((l) => toListingDto(l, names.get(l.sellerId) ?? null)),
      meta: { nextCursor: page.hasMore ? encodeOffsetCursor(offset + query.limit) : null, hasMore: page.hasMore, limit: query.limit },
    };
  }

  async adminListPending(query: { cursor?: string; limit: number }): Promise<CursorResponse<ListingDto>> {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.d.listings.listPending({ after: after ?? undefined, limit: query.limit + 1 });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const names = await this.withSellerNames(page);
    return {
      data: page.map((l) => toListingDto(l, names.get(l.sellerId) ?? null)),
      meta: { nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null, hasMore, limit: query.limit },
    };
  }

  async adminApprove(admin: AuthUser, listingId: string, reason: string): Promise<ListingDto> {
    const listing = await this.requireListing(listingId);
    if (listing.status !== "PENDING_REVIEW") throw coinErrors.wrongListingStatus("Tin không ở trạng thái chờ duyệt");
    const updated = await this.d.listings.setStatus(listing.id, "ACTIVE", {});
    await this.d.audit.record({ actorId: admin.id, actorRole: admin.role, action: "marketplace.listing.approve", targetType: "MarketplaceListing", targetId: listing.id, reason });
    const names = await this.withSellerNames(updated ? [updated] : []);
    return toListingDto(updated ?? listing, updated ? (names.get(updated.sellerId) ?? null) : null);
  }

  async adminReject(admin: AuthUser, listingId: string, reason: string): Promise<ListingDto> {
    const listing = await this.requireListing(listingId);
    if (listing.status !== "PENDING_REVIEW") throw coinErrors.wrongListingStatus("Tin không ở trạng thái chờ duyệt");
    const updated = await this.d.listings.setStatus(listing.id, "WITHDRAWN", { hiddenReason: reason });
    await this.d.audit.record({ actorId: admin.id, actorRole: admin.role, action: "marketplace.listing.reject", targetType: "MarketplaceListing", targetId: listing.id, reason });
    const names = await this.withSellerNames(updated ? [updated] : []);
    return toListingDto(updated ?? listing, updated ? (names.get(updated.sellerId) ?? null) : null);
  }

  async adminHide(admin: AuthUser, listingId: string, reason: string): Promise<ListingDto> {
    const listing = await this.requireListing(listingId);
    if (listing.status !== "ACTIVE") throw coinErrors.wrongListingStatus("Tin không ở trạng thái đang bán");
    const updated = await this.applyHide(listing, reason);
    await this.d.audit.record({ actorId: admin.id, actorRole: admin.role, action: "marketplace.listing.hide", targetType: "MarketplaceListing", targetId: listing.id, reason });
    const names = await this.withSellerNames([updated]);
    return toListingDto(updated, names.get(updated.sellerId) ?? null);
  }

  async adminRestore(admin: AuthUser, listingId: string, reason: string): Promise<ListingDto> {
    const listing = await this.requireListing(listingId);
    if (listing.status !== "HIDDEN") throw coinErrors.wrongListingStatus("Tin không ở trạng thái đã ẩn");
    const updated = await this.d.listings.setStatus(listing.id, "ACTIVE", { hiddenReason: null });
    await this.d.audit.record({ actorId: admin.id, actorRole: admin.role, action: "marketplace.listing.restore", targetType: "MarketplaceListing", targetId: listing.id, reason });
    const names = await this.withSellerNames(updated ? [updated] : []);
    return toListingDto(updated ?? listing, updated ? (names.get(updated.sellerId) ?? null) : null);
  }

  // ── ẩn & hoàn tiền ──

  private async applyHide(listing: MarketplaceListing, reason: string): Promise<MarketplaceListing> {
    const updated = await this.d.listings.setStatus(listing.id, "HIDDEN", { hiddenReason: reason });
    const current = updated ?? listing;
    await this.refundEligiblePurchases(current);
    return current;
  }

  private async refundEligiblePurchases(listing: MarketplaceListing): Promise<void> {
    const cutoff = new Date(this.now().getTime() - LIMITS.marketplace.refundWindowDays * 86_400_000);
    const purchases = await this.d.purchases.listByListingUnrefunded(listing.id, cutoff);
    for (const purchase of purchases) await this.refundOne(listing.sellerId, purchase);
  }

  private async refundOne(sellerId: string, purchase: MarketplacePurchase): Promise<void> {
    await this.d.ledger.ensureWallets([sellerId, purchase.buyerId]);
    try {
      await this.d.tx.run(async (tx) => {
        const sellerWallet = await this.d.wallets.find(sellerId, tx);
        const recoverable = Math.min(purchase.price, sellerWallet?.balance ?? 0);
        if (recoverable > 0) {
          await this.d.ledger.debit(tx, { userId: sellerId, amount: recoverable, type: "REFUND", refType: "PURCHASE", refId: purchase.id, counterpartyId: purchase.buyerId });
          await this.d.ledger.credit(tx, { userId: purchase.buyerId, amount: recoverable, type: "REFUND", refType: "PURCHASE", refId: purchase.id, counterpartyId: sellerId });
        }
        const shortfall = purchase.price - recoverable;
        if (shortfall > 0) {
          await this.d.ledger.credit(tx, {
            userId: purchase.buyerId,
            amount: shortfall,
            type: "ADJUST_ADMIN",
            refType: "ADMIN",
            refId: `refund-gap:${purchase.id}`,
            note: "Nền tảng bù phần người bán không đủ xu khi hoàn tiền do gỡ tin niêm yết",
            actorId: null,
          });
        }
        await this.d.purchases.markRefunded(purchase.id, this.now(), tx);
      });
      this.d.emitter.updated(purchase.buyerId, { coins: { balance: (await this.d.wallets.find(purchase.buyerId))?.balance ?? 0, delta: purchase.price, reason: "REFUND" } });
    } catch (err) {
      // Đã hoàn từ trước (phát lại — unique `type,refType,refId,userId`) → bỏ qua êm.
      if (err instanceof UniqueViolationError) return;
      throw err;
    }
  }
}
