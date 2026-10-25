import { inflateSync } from "zlib";

/**
 * Trích văn bản từ PDF do `pdf-document.ts` sinh (repo chưa có `pdf-parse`): đọc bảng xref → từng đối tượng → giải nén luồng Flate → ghép glyph id
 * thành ký tự bằng CMap `ToUnicode` của đúng font mà trang dùng. Nếu dấu tiếng Việt sai/thiếu ở `ToUnicode` hay hex glyph thì kết quả ở đây sai — đó
 * chính là điều bài kiểm này bảo vệ (PM2-36: "Ưu, Đặng, Nguyễn").
 */
interface PdfObject {
  dict: string;
  data: Buffer | null;
}

function parseObjects(pdf: Buffer): Map<number, PdfObject> {
  const s = pdf.toString("latin1");
  const startxref = Number(/startxref\n(\d+)/.exec(s)?.[1]);
  const xref = s.slice(startxref);
  const offsets = [...xref.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  const objects = new Map<number, PdfObject>();
  offsets.forEach((offset, i) => {
    const end = offsets[i + 1] ?? startxref;
    const chunk = s.slice(offset, end);
    const bodyStart = chunk.indexOf("\n") + 1;
    const body = chunk.slice(bodyStart, chunk.lastIndexOf("\nendobj"));
    const streamAt = body.indexOf("\nstream\n");
    if (streamAt < 0) {
      objects.set(i + 1, { dict: body, data: null });
      return;
    }
    const dict = body.slice(0, streamAt);
    const length = Number(/\/Length (\d+)/.exec(dict)?.[1]);
    const raw = Buffer.from(body.slice(streamAt + 8, streamAt + 8 + length), "latin1");
    objects.set(i + 1, { dict, data: dict.includes("/FlateDecode") ? inflateSync(raw) : raw });
  });
  return objects;
}

function parseToUnicode(cmap: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of cmap.matchAll(/beginbfchar\n([\s\S]*?)endbfchar/g)) {
    for (const row of block[1].trim().split("\n")) {
      const m = /<([0-9a-f]{4})> <([0-9a-f]+)>/i.exec(row);
      if (m) map.set(parseInt(m[1], 16), Buffer.from(m[2], "hex").swap16().toString("utf16le"));
    }
  }
  return map;
}

export interface PdfTextItem {
  page: number;
  x: number;
  y: number;
  text: string;
}

/** Mọi đoạn chữ của PDF (theo trang, vị trí `Tm`) — dùng để dựng lại từng dòng. */
export function extractPdfItems(pdf: Buffer): PdfTextItem[] {
  const objects = parseObjects(pdf);
  const fontMaps = new Map<number, Map<number, string>>();
  for (const [id, obj] of objects) {
    if (!obj.dict.includes("/Subtype /Type0")) continue;
    const toUnicode = Number(/\/ToUnicode (\d+) 0 R/.exec(obj.dict)?.[1]);
    fontMaps.set(id, parseToUnicode(objects.get(toUnicode)?.data?.toString("latin1") ?? ""));
  }
  const items: PdfTextItem[] = [];
  let pageNo = 0;
  for (const obj of objects.values()) {
    if (!/\/Type \/Page /.test(obj.dict)) continue;
    pageNo += 1;
    const fonts = new Map([...obj.dict.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((m) => [m[1], fontMaps.get(Number(m[2])) ?? new Map<number, string>()] as const));
    const content = objects.get(Number(/\/Contents (\d+) 0 R/.exec(obj.dict)?.[1]))?.data?.toString("latin1") ?? "";
    for (const op of content.split("\n")) {
      const m = /\/(F\d+) [\d.]+ Tf 1 0 0 1 ([\d.-]+) ([\d.-]+) Tm <([0-9a-f]*)> Tj/.exec(op);
      if (!m) continue;
      const map = fonts.get(m[1]) ?? new Map<number, string>();
      let text = "";
      for (let i = 0; i < m[4].length; i += 4) text += map.get(parseInt(m[4].slice(i, i + 4), 16)) ?? "�";
      items.push({ page: pageNo, x: Number(m[2]), y: Number(m[3]), text });
    }
  }
  return items;
}

/** Các dòng chữ (gộp theo cùng trang + cùng đường cơ sở, trái → phải) từ trên xuống dưới. */
export function extractPdfLines(pdf: Buffer): string[] {
  const rows = new Map<string, PdfTextItem[]>();
  for (const item of extractPdfItems(pdf)) {
    const key = `${item.page}|${item.y.toFixed(1)}`;
    rows.set(key, [...(rows.get(key) ?? []), item]);
  }
  return [...rows.values()]
    .sort((a, b) => a[0].page - b[0].page || b[0].y - a[0].y)
    .map((cells) => cells.sort((a, b) => a.x - b.x).map((c) => c.text).join(" "));
}

export const extractPdfText = (pdf: Buffer): string => extractPdfLines(pdf).join("\n");

export function pdfPageCount(pdf: Buffer): number {
  return Number(/\/Count (\d+)/.exec(pdf.toString("latin1"))?.[1]);
}
