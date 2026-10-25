import { A4, PdfDocument, type PdfPage, type Rgb } from "./pdf-document";

export const COLORS = {
  ink: [33, 37, 41] as Rgb,
  muted: [108, 117, 125] as Rgb,
  line: [206, 212, 218] as Rgb,
  band: [241, 243, 245] as Rgb,
  heat: [[235, 237, 240], [198, 219, 254], [147, 187, 253], [76, 133, 247], [29, 78, 216]] as Rgb[],
};

export const PAGE = { marginX: 40, top: 46, bottom: 58, width: A4.width - 80 } as const;

export interface FlowText {
  size?: number;
  bold?: boolean;
  color?: Rgb;
  indent?: number;
  /** Khoảng cách dòng so với cỡ chữ (mặc định 1,4). */
  leading?: number;
}

/**
 * Dòng chảy nội dung theo chiều dọc: giữ trang hiện tại + con trỏ `top` (khoảng cách từ mép TRÊN, điểm PDF), tự sang trang khi hết chỗ.
 * Chân trang (mã xác thực + số trang) vẽ SAU CÙNG khi đã biết tổng số trang (`forEachPage`).
 */
export class Flow {
  page!: PdfPage;
  top = 0;
  private readonly pages: PdfPage[] = [];

  constructor(private readonly doc: PdfDocument) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage();
    this.pages.push(this.page);
    this.top = PAGE.top;
  }

  /** Sang trang mới nếu còn chưa đủ `height` điểm. */
  need(height: number): void {
    if (this.top + height > A4.height - PAGE.bottom) this.newPage();
  }

  gap(height: number): void {
    this.top += height;
  }

  /** PDF `y` (từ ĐÁY) của đường cơ sở một dòng chữ cỡ `size` đặt ở `top`. */
  baseline(size: number, top: number = this.top): number {
    return A4.height - (top + size);
  }

  /** Một dòng chữ tại `x` (từ mép trái trang). Không tự xuống dòng. */
  line(value: string, x: number, opts: FlowText & { align?: "left" | "right" | "center" } = {}): void {
    const size = opts.size ?? 10;
    this.need(size * (opts.leading ?? 1.4));
    this.page.text(value, x, this.baseline(size), { font: opts.bold ? "F2" : "F1", size, color: opts.color ?? COLORS.ink, align: opts.align });
    this.top += size * (opts.leading ?? 1.4);
  }

  /** Đoạn văn tự xuống dòng theo độ rộng còn lại. */
  paragraph(value: string, opts: FlowText = {}): void {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    for (const text of this.wrap(value, PAGE.width - indent, size, opts.bold === true)) this.line(text, PAGE.marginX + indent, opts);
  }

  wrap(value: string, maxWidth: number, size: number, bold = false): string[] {
    const font = bold ? "F2" : "F1";
    const lines: string[] = [];
    let current = "";
    for (const word of value.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && this.page.measure(candidate, size, font) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  }

  /** Gọi `fn` cho từng trang cùng chỉ số và tổng số trang — vẽ chân trang. */
  forEachPage(fn: (page: PdfPage, index: number, total: number) => void): void {
    this.pages.forEach((page, i) => fn(page, i, this.pages.length));
  }
}
