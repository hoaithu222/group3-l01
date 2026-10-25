import type { PrintCapabilities, PrintPriceTable, PrintQuote, PrintSettings } from "../entities/o2o.interface";
import { countPrintablePages } from "./page-range";

/**
 * Báo giá in (p6-05 be.md §5 "Quote") — hàm THUẦN, tiền là SỐ NGUYÊN đồng (không số thực):
 * - `printablePages` = số trang theo `pageRange` (trùng tính một lần);
 * - `sheets` = số tờ MỘT bản (2 mặt → ceil(trang/2)) — chỉ để hiển thị;
 * - `unitPrice` = bảng giá theo khổ × màu (đồng/trang);
 * - `subtotal` = trang × bản × đơn giá; `duplexDiscount` = floor(subtotal × % / 100) khi in 2 mặt;
 * - `total` = max(`minOrder`, subtotal − giảm).
 * Cấu hình vượt năng lực tiệm → `CAPABILITY` (O2O_002, kèm trường sai); khoảng trang sai → `PAGE_RANGE` (O2O_012).
 */
export type QuoteResult =
  | { ok: true; quote: PrintQuote }
  | { ok: false; reason: "CAPABILITY"; field: keyof PrintCapabilities | "paper" }
  | { ok: false; reason: "PAGE_RANGE" };

/** Trường cấu hình tiệm không hỗ trợ (ưu tiên khổ → màu → 2 mặt → đóng gáy), `null` nếu hợp lệ. */
export function capabilityViolation(settings: PrintSettings, caps: PrintCapabilities): "paper" | "color" | "duplex" | "binding" | null {
  if (settings.paper === "A3" && !caps.a3) return "paper";
  if (settings.color && !caps.color) return "color";
  if (settings.duplex && !caps.duplex) return "duplex";
  if (settings.binding && !caps.binding) return "binding";
  return null;
}

export function unitPriceOf(settings: Pick<PrintSettings, "paper" | "color">, table: PrintPriceTable): number {
  if (settings.paper === "A3") return settings.color ? table.a3Color : table.a3Bw;
  return settings.color ? table.a4Color : table.a4Bw;
}

export interface QuoteInput {
  pages: number;
  settings: PrintSettings;
  priceTable: PrintPriceTable;
  capabilities: PrintCapabilities;
  priceTableVersion: number;
  now: Date;
}

export function computeQuote(input: QuoteInput): QuoteResult {
  const violation = capabilityViolation(input.settings, input.capabilities);
  if (violation) return { ok: false, reason: "CAPABILITY", field: violation };
  const printablePages = countPrintablePages(input.settings.pageRange, input.pages);
  if (printablePages === null) return { ok: false, reason: "PAGE_RANGE" };

  const unitPrice = unitPriceOf(input.settings, input.priceTable);
  const subtotal = printablePages * input.settings.copies * unitPrice;
  const pct = Math.min(100, Math.max(0, input.priceTable.duplexDiscountPct));
  const duplexDiscount = input.settings.duplex ? Math.floor((subtotal * pct) / 100) : 0;
  const total = Math.max(input.priceTable.minOrder, subtotal - duplexDiscount);
  return {
    ok: true,
    quote: {
      printablePages,
      sheets: input.settings.duplex ? Math.ceil(printablePages / 2) : printablePages,
      unitPrice,
      subtotal,
      duplexDiscount,
      total,
      priceTableVersion: input.priceTableVersion,
      quotedAt: input.now,
    },
  };
}
