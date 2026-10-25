import { deflateSync } from "zlib";
import { writeEmbeddedFont, type FontEntry } from "./pdf-font-embed";
import type { TtfFont } from "./ttf-font";

/**
 * Bộ ghi PDF TỐI THIỂU (không phụ thuộc thư viện) cho báo cáo đóng góp: trang A4, chữ Unicode nhúng font TrueType (Identity-H + `ToUnicode` nên
 * copy/tìm kiếm/trích văn bản đều đúng dấu tiếng Việt), hình chữ nhật/đường kẻ tô màu. Nội dung nén Flate. Không hỗ trợ ảnh/liên kết.
 */
export type Rgb = readonly [number, number, number];

export const A4 = { width: 595.28, height: 841.89 } as const;

export interface TextOptions {
  font?: string;
  size?: number;
  color?: Rgb;
  align?: "left" | "right" | "center";
}

const num = (n: number): string => (Math.round(n * 1000) / 1000).toString();
const color = (c: Rgb): string => c.map((v) => num(v / 255)).join(" ");
const hex4 = (n: number): string => n.toString(16).padStart(4, "0");
const utf16Hex = (s: string): string => `<FEFF${Buffer.from(s, "utf16le").swap16().toString("hex")}>`;

export class PdfPage {
  private readonly ops: string[] = [];

  constructor(
    private readonly doc: PdfDocument,
    readonly width: number,
    readonly height: number
  ) {}

  /** Chữ tại `(x, y)` — `y` tính từ ĐÁY trang (gốc PDF), là đường cơ sở của dòng. `align` so với `x`. */
  text(value: string, x: number, y: number, opts: TextOptions = {}): void {
    if (value === "") return;
    const fontKey = opts.font ?? this.doc.defaultFont;
    const size = opts.size ?? 10;
    const { hex, width } = this.doc.encode(fontKey, value, size);
    const left = opts.align === "right" ? x - width : opts.align === "center" ? x - width / 2 : x;
    this.ops.push(`BT ${color(opts.color ?? [0, 0, 0])} rg /${fontKey} ${num(size)} Tf 1 0 0 1 ${num(left)} ${num(y)} Tm <${hex}> Tj ET`);
  }

  measure(value: string, size: number, font?: string): number {
    return this.doc.encode(font ?? this.doc.defaultFont, value, size).width;
  }

  rect(x: number, y: number, w: number, h: number, opts: { fill?: Rgb; stroke?: Rgb; lineWidth?: number } = {}): void {
    const parts = ["q"];
    if (opts.fill) parts.push(`${color(opts.fill)} rg`);
    if (opts.stroke) parts.push(`${color(opts.stroke)} RG ${num(opts.lineWidth ?? 0.5)} w`);
    parts.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${opts.fill && opts.stroke ? "B" : opts.fill ? "f" : "S"}`, "Q");
    this.ops.push(parts.join(" "));
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: { stroke?: Rgb; lineWidth?: number } = {}): void {
    this.ops.push(`q ${color(opts.stroke ?? [0, 0, 0])} RG ${num(opts.lineWidth ?? 0.5)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S Q`);
  }

  /** Nội dung trang (ASCII: chuỗi chữ là hex glyph id) — dùng khi ghi tệp. */
  content(): Buffer {
    return Buffer.from(this.ops.join("\n"), "latin1");
  }
}

export interface PdfMeta {
  title: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creationDate?: Date;
}

export class PdfDocument {
  readonly defaultFont: string;
  private readonly fonts = new Map<string, FontEntry>();
  private readonly pages: PdfPage[] = [];

  /** `fonts`: khoá (tên tài nguyên PDF, vd `F1`) → font TTF. Font đầu tiên là mặc định. */
  constructor(
    private readonly meta: PdfMeta,
    fonts: Record<string, TtfFont>
  ) {
    const keys = Object.keys(fonts);
    if (keys.length === 0) throw new Error("Cần ít nhất một font");
    this.defaultFont = keys[0];
    for (const key of keys) this.fonts.set(key, { key, font: fonts[key], used: new Map() });
  }

  addPage(width: number = A4.width, height: number = A4.height): PdfPage {
    const page = new PdfPage(this, width, height);
    this.pages.push(page);
    return page;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /** Mã hoá chuỗi (NFC) thành dãy glyph id (hex 4 chữ số/glyph) + độ rộng, ghi nhận glyph đã dùng. */
  encode(fontKey: string, value: string, size: number): { hex: string; width: number } {
    const entry = this.fonts.get(fontKey);
    if (!entry) throw new Error(`Font '${fontKey}' chưa đăng ký`);
    let hex = "";
    let advance = 0;
    for (const ch of value.normalize("NFC")) {
      const cp = ch.codePointAt(0) as number;
      const glyph = entry.font.glyphId(cp);
      entry.used.set(glyph, cp);
      hex += hex4(glyph);
      advance += entry.font.advance(glyph);
    }
    return { hex, width: (advance * size) / entry.font.unitsPerEm };
  }

  /** Dựng tệp PDF hoàn chỉnh. */
  finish(): Buffer {
    const objects: Buffer[] = [];
    const add = (body: string | Buffer): number => {
      objects.push(typeof body === "string" ? Buffer.from(body, "latin1") : body);
      return objects.length;
    };
    const stream = (dict: string, data: Buffer): Buffer =>
      Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]);

    const catalogId = add("");
    const pagesId = add("");
    const fontRefs = new Map<string, number>();
    for (const entry of this.fonts.values()) fontRefs.set(entry.key, writeEmbeddedFont(entry, add, stream));

    const pageIds: number[] = [];
    for (const page of this.pages) {
      const contentId = add(stream("/Filter /FlateDecode", deflateSync(page.content())));
      const fontRes = [...fontRefs].map(([key, id]) => `/${key} ${id} 0 R`).join(" ");
      pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(page.width)} ${num(page.height)}] /Resources << /Font << ${fontRes} >> >> /Contents ${contentId} 0 R >>`));
    }
    const infoId = add(this.infoDictionary());
    objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`, "latin1");
    objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`, "latin1");

    const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")];
    const offsets: number[] = [];
    let position = chunks[0].length;
    objects.forEach((body, i) => {
      offsets.push(position);
      const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), body, Buffer.from("\nendobj\n", "latin1")]);
      chunks.push(chunk);
      position += chunk.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
    chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${position}\n%%EOF\n`, "latin1"));
    return Buffer.concat(chunks);
  }

  private infoDictionary(): string {
    const d = this.meta.creationDate ?? new Date();
    const pad = (n: number): string => String(n).padStart(2, "0");
    const date = `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
    const fields = [
      `/Title ${utf16Hex(this.meta.title)}`,
      this.meta.author ? `/Author ${utf16Hex(this.meta.author)}` : "",
      this.meta.subject ? `/Subject ${utf16Hex(this.meta.subject)}` : "",
      this.meta.keywords ? `/Keywords ${utf16Hex(this.meta.keywords)}` : "",
      "/Producer (Super App)",
      `/CreationDate (${date})`,
    ];
    return `<< ${fields.filter(Boolean).join(" ")} >>`;
  }
}
