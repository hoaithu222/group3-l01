/**
 * font-metrics.mjs — đọc THẲNG file `.ttf` để lấy chiều cao thật của chữ.
 *
 * ── Vì sao phải tự đọc font ──────────────────────────────────────────────────
 * Luật "lineHeight tối thiểu bao nhiêu để Android không cắt dấu tiếng Việt" là
 * một THUỘC TÍNH CỦA FONT, không phải con số ai đó nghĩ ra. Viết cứng 1.3 rồi
 * đổi font là luật sai ngay mà không ai biết — sai kiểu im lặng, chỉ lộ ra khi
 * người dùng thật nhìn thấy chữ `Ẳ` bị cụt mũ trên máy Android thật.
 *
 * Nên `generate-typography.mjs` ĐO font ở mỗi lần chạy: mở `.ttf`, tra bảng `cmap`
 * lấy mã glyph của từng ký tự tiếng Việt, rồi đọc hộp bao (`yMin`/`yMax`) của
 * glyph đó trong bảng `glyf`.
 *
 * ── Số đo Be Vietnam Pro (đo 2026-09-08) ────────────────────────────────────
 *   Ký tự CAO nhất  : `Ẳ`  (A + dấu á + dấu hỏi — chồng ba tầng)
 *   Ký tự THẤP nhất : `Ạ`  (A + dấu nặng dưới chân)
 *
 *   | Nét      | Chỉ Latin | Latin + tiếng Việt |
 *   |----------|-----------|--------------------|
 *   | Regular  | 0.98em    | 1.426em            |
 *   | Medium   | 0.98em    | 1.441em            |
 *   | SemiBold | 0.98em    | 1.455em            |
 *   | Bold     | 0.99em    | **1.470em**        |
 *
 * Tiếng Việt cần **hơn 50% chiều cao** so với cùng font chỉ chạy Latin. Đó là
 * toàn bộ lý do của luật này — và là lý do một thang chữ chép từ dự án tiếng
 * Anh về gần như luôn cắt dấu.
 *
 * Chỉ hỗ trợ TrueType (`glyf`/`loca`). Font OpenType nét CFF (`.otf`) không có
 * hai bảng đó — nơi gọi tự lo phần dự phòng.
 */
import fs from 'node:fs';

/** Ký tự tiếng Việt có dấu, hoa và thường — tập cần đo. */
const VIETNAMESE_CHARS =
  'AÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬEÈÉẺẼẸÊỀẾỂỄỆIÌÍỈĨỊOÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢUÙÚỦŨỤƯỪỨỬỮỰYỲÝỶỸỴĐ' +
  'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵđ';

/** Latin + số + dấu câu hay gặp — để so sánh và để bắt cả trường hợp thuần Latin. */
const ASCII_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?()[]{}/@#%&*+-=';

/** Đọc danh sách bảng ở đầu file font. */
function readTableDirectory(buf) {
  const numTables = buf.readUInt16BE(4);
  const tables = {};
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables[buf.toString('ascii', rec, rec + 4)] = {
      offset: buf.readUInt32BE(rec + 8),
      length: buf.readUInt32BE(rec + 12),
    };
  }
  return tables;
}

/**
 * Dựng hàm tra `mã Unicode → chỉ số glyph` từ bảng `cmap` subtable format 4.
 * Format 4 phủ toàn bộ mặt phẳng cơ bản (BMP), mà mọi ký tự tiếng Việt đều nằm
 * trong đó — không cần đụng tới format 12.
 */
function buildCharToGlyph(buf, cmapOffset) {
  const numSubtables = buf.readUInt16BE(cmapOffset + 2);
  let format4 = null;
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapOffset + 4 + i * 8;
    const sub = cmapOffset + buf.readUInt32BE(rec + 4);
    if (buf.readUInt16BE(sub) === 4) format4 = sub;
  }
  if (format4 === null) return null;

  const segCountX2 = buf.readUInt16BE(format4 + 6);
  const segCount = segCountX2 / 2;
  const endCodes = format4 + 14;
  const startCodes = endCodes + segCountX2 + 2; // +2: ô `reservedPad`
  const idDeltas = startCodes + segCountX2;
  const idRangeOffsets = idDeltas + segCountX2;

  return (codePoint) => {
    for (let i = 0; i < segCount; i++) {
      if (buf.readUInt16BE(endCodes + i * 2) < codePoint) continue;
      const start = buf.readUInt16BE(startCodes + i * 2);
      if (start > codePoint) return 0;
      const delta = buf.readInt16BE(idDeltas + i * 2);
      const rangeOffset = buf.readUInt16BE(idRangeOffsets + i * 2);
      if (rangeOffset === 0) return (codePoint + delta) & 0xffff;
      const glyphIndex = buf.readUInt16BE(
        idRangeOffsets + i * 2 + rangeOffset + (codePoint - start) * 2,
      );
      return glyphIndex === 0 ? 0 : (glyphIndex + delta) & 0xffff;
    }
    return 0;
  };
}

/**
 * Đo một file font.
 *
 * @returns {{ unitsPerEm: number, vietnamese: Extent, ascii: Extent } | null}
 *   `null` khi file không phải TrueType có `glyf`/`loca`.
 *   Extent = `{ ratio, tallestChar, lowestChar }`, `ratio` tính theo em.
 */
export function measureFont(filePath) {
  const buf = fs.readFileSync(filePath);
  const tables = readTableDirectory(buf);
  if (!tables.head || !tables.maxp || !tables.cmap || !tables.loca || !tables.glyf) return null;

  const head = tables.head.offset;
  const unitsPerEm = buf.readUInt16BE(head + 18);
  const indexToLocFormat = buf.readInt16BE(head + 50);
  const numGlyphs = buf.readUInt16BE(tables.maxp.offset + 4);

  const charToGlyph = buildCharToGlyph(buf, tables.cmap.offset);
  if (!charToGlyph) return null;

  const locaAt = (i) =>
    indexToLocFormat === 0
      ? buf.readUInt16BE(tables.loca.offset + i * 2) * 2
      : buf.readUInt32BE(tables.loca.offset + i * 4);

  /** Hộp bao của glyph, hoặc `null` khi glyph rỗng (dấu cách). */
  const glyphBounds = (glyphId) => {
    if (glyphId <= 0 || glyphId >= numGlyphs) return null;
    const from = locaAt(glyphId);
    const to = locaAt(glyphId + 1);
    if (to <= from) return null;
    const g = tables.glyf.offset + from;
    return { yMin: buf.readInt16BE(g + 4), yMax: buf.readInt16BE(g + 8) };
  };

  const extentOf = (chars) => {
    let yMax = -Infinity;
    let yMin = Infinity;
    let tallestChar = '';
    let lowestChar = '';
    for (const ch of chars) {
      const bounds = glyphBounds(charToGlyph(ch.codePointAt(0)));
      if (!bounds) continue;
      if (bounds.yMax > yMax) {
        yMax = bounds.yMax;
        tallestChar = ch;
      }
      if (bounds.yMin < yMin) {
        yMin = bounds.yMin;
        lowestChar = ch;
      }
    }
    if (yMax === -Infinity) return null;
    return { ratio: (yMax - yMin) / unitsPerEm, tallestChar, lowestChar };
  };

  const vietnamese = extentOf(VIETNAMESE_CHARS + ASCII_CHARS);
  const ascii = extentOf(ASCII_CHARS);
  if (!vietnamese || !ascii) return null;

  return { unitsPerEm, vietnamese, ascii };
}

/**
 * Đo cả bộ font và trả về trường hợp XẤU NHẤT.
 *
 * Lấy max qua mọi nét vì một dòng chữ có thể đậm bất kỳ: nét càng đậm dấu càng
 * dày và càng cao (Bold cao hơn Regular 0.044em ở Be Vietnam Pro). Lấy trung
 * bình hay lấy riêng Regular là để lọt chính những nhãn IN HOA ĐẬM — thứ dễ vỡ
 * nhất.
 */
export function measureFontFamily(filePaths) {
  const measured = [];
  for (const file of filePaths) {
    const m = measureFont(file);
    if (m) measured.push({ file, ...m });
  }
  if (measured.length === 0) return null;

  const worst = measured.reduce((a, b) => (b.vietnamese.ratio > a.vietnamese.ratio ? b : a));
  const asciiWorst = measured.reduce((a, b) => (b.ascii.ratio > a.ascii.ratio ? b : a));
  return {
    files: measured.length,
    vietnameseRatio: worst.vietnamese.ratio,
    asciiRatio: asciiWorst.ascii.ratio,
    tallestChar: worst.vietnamese.tallestChar,
    lowestChar: worst.vietnamese.lowestChar,
    worstFile: worst.file,
  };
}
