import { LIMITS } from "../../../core/constants/limits";
import { ErrorCode } from "../../../core/utils/error.codes";
import type { PrintOrder } from "../entities/o2o.interface";
import { countPdfPages } from "../domain/pdf-page-count";
import { computeQuote } from "../domain/print-quote";
import type { OrderSetPatch } from "../repositories/print-order.repository.interface";
import type { O2oDeps } from "./o2o.deps";

/**
 * Job `print.count-pages` (be.md §5): đọc tệp → đếm trang → DRAFT + `pageCountError` (O2O_003 tệp hỏng/không phải PDF, O2O_011
 * vượt `orderPagesMax`, O2O_002/O2O_012 cấu hình không hợp lệ với số trang) hoặc QUOTED + báo giá theo bảng giá hiện tại.
 * Idempotent: chỉ ghi khi đơn còn DRAFT/QUOTED và vẫn trỏ đúng asset; đã có số trang hợp lệ → bỏ qua.
 */
export class PageCountService {
  constructor(private readonly deps: O2oDeps) {}

  async handle(input: { orderId: string; assetId: string }): Promise<PrintOrder | null> {
    const order = await this.deps.orders.findById(input.orderId);
    if (!order || order.fileAssetId !== input.assetId || (order.status !== "DRAFT" && order.status !== "QUOTED")) return null;
    if (order.pages !== null && order.pageCountError === null) return null;

    const pages = await this.count(input.assetId);
    const set = await this.resultFor(order, pages);
    const note = set.pages ? `${set.pages} trang` : null;
    return this.deps.orders.setPageCount(order.id, input.assetId, set, {
      status: set.status ?? order.status,
      at: this.deps.now(),
      by: null,
      note,
    });
  }

  private async count(assetId: string): Promise<number | null> {
    const asset = await this.deps.assets.get(assetId);
    if (!asset || asset.status !== "READY" || asset.size === null || asset.size > LIMITS.o2o.fileMaxBytes) return null;
    const r = countPdfPages(await this.deps.assets.read(asset));
    return r.ok ? r.pages : null;
  }

  private async resultFor(order: PrintOrder, pages: number | null): Promise<OrderSetPatch> {
    if (pages === null) return { pages: null, pageCountError: ErrorCode.O2O_003, quote: null, status: "DRAFT" };
    if (pages > LIMITS.o2o.orderPagesMax) return { pages, pageCountError: ErrorCode.O2O_011, quote: null, status: "DRAFT" };
    const shop = await this.deps.shops.findById(order.shopId);
    if (!shop) return { pages, pageCountError: null, quote: null, status: "DRAFT" };
    const r = computeQuote({
      pages,
      settings: order.settings,
      priceTable: shop.priceTable,
      capabilities: shop.capabilities,
      priceTableVersion: shop.version,
      now: this.deps.now(),
    });
    if (!r.ok) return { pages, pageCountError: r.reason === "CAPABILITY" ? ErrorCode.O2O_002 : ErrorCode.O2O_012, quote: null, status: "DRAFT" };
    return { pages, pageCountError: null, quote: r.quote, status: "QUOTED" };
  }
}
