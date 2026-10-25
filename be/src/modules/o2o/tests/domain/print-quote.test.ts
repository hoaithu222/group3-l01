import { computeQuote, capabilityViolation } from "../../domain/print-quote";
import type { PrintCapabilities, PrintSettings } from "../../entities/o2o.interface";

const TABLE = { a4Bw: 500, a4Color: 2000, a3Bw: 1000, a3Color: 4000, duplexDiscountPct: 10, minOrder: 2000 };
const ALL: PrintCapabilities = { color: true, duplex: true, a3: true, binding: true };
const NOW = new Date("2026-09-25T00:00:00Z");
const settings = (over: Partial<PrintSettings> = {}): PrintSettings => ({ paper: "A4", color: false, copies: 1, duplex: false, pageRange: null, binding: false, ...over });
const quote = (pages: number, s: PrintSettings, caps = ALL) => computeQuote({ pages, settings: s, priceTable: TABLE, capabilities: caps, priceTableVersion: 3, now: NOW });

describe("print-quote (be.md §5 Quote)", () => {
  it("IR-08: 12 trang A4 màu 2 mặt, giảm 10 % → 12 × 2000 = 24 000 − 2 400 = 21 600, 6 tờ", () => {
    const r = quote(12, settings({ color: true, duplex: true }));
    expect(r).toEqual({
      ok: true,
      quote: { printablePages: 12, sheets: 6, unitPrice: 2000, subtotal: 24_000, duplexDiscount: 2_400, total: 21_600, priceTableVersion: 3, quotedAt: NOW },
    });
  });

  it("nhân số bản, khổ A3 đen trắng, giảm làm tròn xuống (số nguyên đồng)", () => {
    const r = quote(7, settings({ paper: "A3", copies: 3, duplex: true }));
    expect(r.ok && r.quote).toMatchObject({ printablePages: 7, sheets: 4, unitPrice: 1000, subtotal: 21_000, duplexDiscount: 2_100, total: 18_900 });
  });

  it("không đạt đơn tối thiểu → total = minOrder", () => {
    const r = quote(2, settings());
    expect(r.ok && r.quote).toMatchObject({ subtotal: 1000, total: 2000 });
  });

  it("khoảng trang: chỉ tính trang được chọn (trùng tính 1 lần)", () => {
    const r = quote(20, settings({ pageRange: "1-3,5,2-4" }));
    expect(r.ok && r.quote.printablePages).toBe(5);
  });

  it("khoảng trang vượt số trang / sai hình dạng → PAGE_RANGE (O2O_012)", () => {
    expect(quote(4, settings({ pageRange: "1-5" }))).toEqual({ ok: false, reason: "PAGE_RANGE" });
    expect(quote(4, settings({ pageRange: "3-1" }))).toEqual({ ok: false, reason: "PAGE_RANGE" });
  });

  it("vượt năng lực tiệm → CAPABILITY kèm trường (O2O_002)", () => {
    const caps = { color: false, duplex: false, a3: false, binding: false };
    expect(quote(1, settings({ paper: "A3" }), caps)).toEqual({ ok: false, reason: "CAPABILITY", field: "paper" });
    expect(capabilityViolation(settings({ color: true }), caps)).toBe("color");
    expect(capabilityViolation(settings({ duplex: true }), caps)).toBe("duplex");
    expect(capabilityViolation(settings({ binding: true }), caps)).toBe("binding");
    expect(capabilityViolation(settings(), caps)).toBeNull();
  });
});
