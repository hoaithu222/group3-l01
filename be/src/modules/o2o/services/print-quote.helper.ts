import type { PrintQuote, PrintSettings, PrintShop } from "../entities/o2o.interface";
import { capabilityViolation, computeQuote } from "../domain/print-quote";
import { isPageRangeShapeValid, normalizePageRange } from "../domain/page-range";
import { o2oErrors } from "../o2o.errors";
import type { PrintSettingsDto } from "../dtos";

/** DTO → cấu hình miền: chuẩn hoá khoảng trang ("1 - 3, 5" → "1-3,5", rỗng → null). */
export function toSettings(dto: PrintSettingsDto): PrintSettings {
  const range = dto.pageRange ? normalizePageRange(dto.pageRange) : "";
  return { paper: dto.paper, color: dto.color, copies: dto.copies, duplex: dto.duplex, pageRange: range === "" ? null : range, binding: dto.binding };
}

/** Kiểm cấu hình KHI CHƯA BIẾT số trang: năng lực tiệm (`O2O_002`) + hình dạng khoảng trang (`O2O_012`). */
export function assertSettingsSupported(settings: PrintSettings, shop: PrintShop): void {
  const field = capabilityViolation(settings, shop.capabilities);
  if (field) throw o2oErrors.unsupportedSettings(field);
  if (settings.pageRange !== null && !isPageRangeShapeValid(settings.pageRange)) throw o2oErrors.invalidPageRange();
}

/** Báo giá theo bảng giá HIỆN TẠI của tiệm — lỗi ném đúng mã (`O2O_002`/`O2O_012`). */
export function quoteOrThrow(pages: number, settings: PrintSettings, shop: PrintShop, now: Date): PrintQuote {
  const r = computeQuote({ pages, settings, priceTable: shop.priceTable, capabilities: shop.capabilities, priceTableVersion: shop.version, now });
  if (r.ok) return r.quote;
  if (r.reason === "CAPABILITY") throw o2oErrors.unsupportedSettings(r.field);
  throw o2oErrors.invalidPageRange();
}
