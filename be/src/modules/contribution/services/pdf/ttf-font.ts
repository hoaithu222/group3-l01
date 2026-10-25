/**
 * Bộ đọc TrueType TỐI THIỂU cho việc nhúng font vào PDF (p4-06 — báo cáo đóng góp cần chữ tiếng Việt có dấu): đọc bảng `head`/`hhea`/`maxp`/
 * `hmtx`/`cmap`(định dạng 4 và 12)/`name`. Không tách tập con glyph — PDF nhúng nguyên tệp TTF (~130 KB/font), bù lại không cần bộ dựng glyph.
 * Không phụ thuộc thư viện ngoài (repo chưa có `pdfkit`/`fontkit`).
 */
export class TtfFont {
  readonly unitsPerEm: number;
  readonly bbox: [number, number, number, number];
  readonly ascent: number;
  readonly descent: number;
  readonly numGlyphs: number;
  readonly postScriptName: string;

  private readonly tables = new Map<string, { offset: number; length: number }>();
  private readonly numHMetrics: number;
  private readonly glyphOf: (codePoint: number) => number;

  constructor(readonly data: Buffer) {
    const signature = data.readUInt32BE(0);
    if (signature !== 0x00010000 && signature !== 0x74727565) throw new Error("Không phải tệp TrueType (.ttf) hợp lệ");
    const count = data.readUInt16BE(4);
    for (let i = 0; i < count; i += 1) {
      const at = 12 + i * 16;
      this.tables.set(data.toString("ascii", at, at + 4), { offset: data.readUInt32BE(at + 8), length: data.readUInt32BE(at + 12) });
    }
    const head = this.table("head");
    this.unitsPerEm = data.readUInt16BE(head + 18);
    this.bbox = [data.readInt16BE(head + 36), data.readInt16BE(head + 38), data.readInt16BE(head + 40), data.readInt16BE(head + 42)];
    const hhea = this.table("hhea");
    this.ascent = data.readInt16BE(hhea + 4);
    this.descent = data.readInt16BE(hhea + 6);
    this.numHMetrics = data.readUInt16BE(hhea + 34);
    this.numGlyphs = data.readUInt16BE(this.table("maxp") + 4);
    this.glyphOf = this.buildCmapLookup();
    this.postScriptName = this.readPostScriptName();
  }

  static fromBuffer(data: Buffer): TtfFont {
    return new TtfFont(data);
  }

  /** Glyph id của một ký tự (0 = `.notdef` khi font không có ký tự đó). */
  glyphId(codePoint: number): number {
    return this.glyphOf(codePoint);
  }

  /** Độ rộng tiến (đơn vị em của font) của glyph. */
  advance(glyph: number): number {
    const hmtx = this.table("hmtx");
    const index = Math.min(glyph, this.numHMetrics - 1);
    return this.data.readUInt16BE(hmtx + index * 4);
  }

  /** Độ rộng chuỗi (điểm PDF) ở cỡ chữ `size` — không tính kerning. */
  measure(text: string, size: number): number {
    let total = 0;
    for (const ch of text) total += this.advance(this.glyphId(ch.codePointAt(0) as number));
    return (total * size) / this.unitsPerEm;
  }

  private table(tag: string): number {
    const entry = this.tables.get(tag);
    if (!entry) throw new Error(`Font thiếu bảng '${tag}'`);
    return entry.offset;
  }

  private buildCmapLookup(): (codePoint: number) => number {
    const cmap = this.table("cmap");
    const d = this.data;
    const subtables: Array<{ platform: number; encoding: number; offset: number; format: number }> = [];
    for (let i = 0; i < d.readUInt16BE(cmap + 2); i += 1) {
      const platform = d.readUInt16BE(cmap + 4 + i * 8);
      const encoding = d.readUInt16BE(cmap + 6 + i * 8);
      const offset = cmap + d.readUInt32BE(cmap + 8 + i * 8);
      subtables.push({ platform, encoding, offset, format: d.readUInt16BE(offset) });
    }
    const pick =
      subtables.find((s) => s.platform === 3 && s.encoding === 10 && s.format === 12) ??
      subtables.find((s) => s.platform === 3 && s.encoding === 1 && s.format === 4) ??
      subtables.find((s) => s.platform === 0 && (s.format === 4 || s.format === 12));
    if (!pick) throw new Error("Font không có bảng cmap Unicode được hỗ trợ (định dạng 4/12)");
    return pick.format === 12 ? this.format12(pick.offset) : this.format4(pick.offset);
  }

  private format4(offset: number): (cp: number) => number {
    const d = this.data;
    const segCount = d.readUInt16BE(offset + 6) / 2;
    const ends = offset + 14;
    const starts = ends + segCount * 2 + 2;
    const deltas = starts + segCount * 2;
    const ranges = deltas + segCount * 2;
    return (cp) => {
      if (cp > 0xffff) return 0;
      let lo = 0;
      let hi = segCount - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (d.readUInt16BE(ends + mid * 2) < cp) lo = mid + 1;
        else hi = mid;
      }
      if (d.readUInt16BE(ends + lo * 2) < cp || d.readUInt16BE(starts + lo * 2) > cp) return 0;
      const delta = d.readInt16BE(deltas + lo * 2);
      const range = d.readUInt16BE(ranges + lo * 2);
      if (range === 0) return (cp + delta) & 0xffff;
      const glyph = d.readUInt16BE(ranges + lo * 2 + range + (cp - d.readUInt16BE(starts + lo * 2)) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    };
  }

  private format12(offset: number): (cp: number) => number {
    const d = this.data;
    const groups = d.readUInt32BE(offset + 12);
    const base = offset + 16;
    return (cp) => {
      let lo = 0;
      let hi = groups - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const at = base + mid * 12;
        if (cp < d.readUInt32BE(at)) hi = mid - 1;
        else if (cp > d.readUInt32BE(at + 4)) lo = mid + 1;
        else return d.readUInt32BE(at + 8) + (cp - d.readUInt32BE(at));
      }
      return 0;
    };
  }

  /** Tên PostScript (nameID 6) — dùng làm `/BaseFont`; không đọc được → tên an toàn. */
  private readPostScriptName(): string {
    try {
      const name = this.table("name");
      const d = this.data;
      const count = d.readUInt16BE(name + 2);
      const strings = name + d.readUInt16BE(name + 4);
      for (let i = 0; i < count; i += 1) {
        const rec = name + 6 + i * 12;
        if (d.readUInt16BE(rec + 6) !== 6) continue;
        const length = d.readUInt16BE(rec + 8);
        const at = strings + d.readUInt16BE(rec + 10);
        const raw = d.readUInt16BE(rec) === 3 || d.readUInt16BE(rec) === 0 ? Buffer.from(d.subarray(at, at + length)).swap16().toString("utf16le") : d.toString("latin1", at, at + length);
        const safe = raw.replace(/[^A-Za-z0-9-]/g, "");
        if (safe) return safe;
      }
    } catch {
      // dùng tên mặc định bên dưới
    }
    return "EmbeddedFont";
  }
}
