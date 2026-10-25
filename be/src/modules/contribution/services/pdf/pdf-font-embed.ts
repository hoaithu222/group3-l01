import { deflateSync } from "zlib";
import type { TtfFont } from "./ttf-font";

export interface FontEntry {
  key: string;
  font: TtfFont;
  /** glyph id → ký tự Unicode đã dùng (cho `/W` và `ToUnicode`). */
  used: Map<number, number>;
}

const hex4 = (n: number): string => n.toString(16).padStart(4, "0");

/** Type0 + CIDFontType2 (Identity-H, `CIDToGIDMap /Identity`) + FontDescriptor + FontFile2 + ToUnicode. Trả id đối tượng Type0. */
export function writeEmbeddedFont(entry: FontEntry, add: (b: string | Buffer) => number, stream: (dict: string, data: Buffer) => Buffer): number {
  const { font } = entry;
  const scale = 1000 / font.unitsPerEm;
  const baseName = `${entry.key}${font.postScriptName}`.replace(/[^A-Za-z0-9-]/g, "");
  const fileId = add(stream(`/Filter /FlateDecode /Length1 ${font.data.length}`, deflateSync(font.data)));
  const descriptorId = add(
    `<< /Type /FontDescriptor /FontName /${baseName} /Flags 4 /FontBBox [${font.bbox.map((v) => Math.round(v * scale)).join(" ")}] ` +
      `/ItalicAngle 0 /Ascent ${Math.round(font.ascent * scale)} /Descent ${Math.round(font.descent * scale)} /CapHeight ${Math.round(700 * scale)} /StemV 80 /FontFile2 ${fileId} 0 R >>`
  );
  const glyphs = [...entry.used.keys()].sort((a, b) => a - b);
  const widths = glyphs.map((g) => `${g} [${Math.round(font.advance(g) * scale)}]`).join(" ");
  const cidId = add(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${baseName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
      `/FontDescriptor ${descriptorId} 0 R /DW 1000 /W [${widths}] /CIDToGIDMap /Identity >>`
  );
  const toUnicodeId = add(stream("/Filter /FlateDecode", deflateSync(Buffer.from(toUnicodeCMap(entry), "latin1"))));
  return add(`<< /Type /Font /Subtype /Type0 /BaseFont /${baseName} /Encoding /Identity-H /DescendantFonts [${cidId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`);
}

function toUnicodeCMap(entry: FontEntry): string {
  const pairs = [...entry.used].filter(([glyph]) => glyph !== 0).sort((a, b) => a[0] - b[0]);
  const blocks: string[] = [];
  for (let i = 0; i < pairs.length; i += 100) {
    const rows = pairs.slice(i, i + 100).map(([glyph, cp]) => `<${hex4(glyph)}> <${Buffer.from(String.fromCodePoint(cp), "utf16le").swap16().toString("hex")}>`);
    blocks.push(`${rows.length} beginbfchar\n${rows.join("\n")}\nendbfchar`);
  }
  return [
    "/CIDInit /ProcSet findresource begin",
    "12 dict begin",
    "begincmap",
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
    "/CMapName /Adobe-Identity-UCS def",
    "/CMapType 2 def",
    "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange",
    ...blocks,
    "endcmap",
    "CMapName currentdict /CMap defineresource pop",
    "end",
    "end",
  ].join("\n");
}
