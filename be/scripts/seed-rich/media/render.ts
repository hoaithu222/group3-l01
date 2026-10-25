/**
 * Dựng ảnh/tệp mẫu hoàn toàn cục bộ (không mạng): ảnh đại diện minh hoạ, ảnh bìa & logo nhóm, poster dạng lưới thẻ, PDF slide,
 * DOCX, XLSX. Chữ tiếng Việt vẽ bằng SVG → PNG/JPEG qua `sharp` (librsvg + phông hệ thống).
 */
import sharp from "sharp";
import JSZip from "jszip";
import { rngFrom } from "../lib/core";
import type { PosterSpec, Theme } from "./types";

interface Palette {
  bg: string;
  bg2: string;
  ink: string;
  accent: string;
  card: string;
  muted: string;
}

const THEMES: Record<Theme, Palette> = {
  violet: { bg: "#f5f3ff", bg2: "#ddd6fe", ink: "#2e1065", accent: "#7c3aed", card: "#ffffff", muted: "#6d28d9" },
  amber: { bg: "#fffbeb", bg2: "#fde68a", ink: "#451a03", accent: "#d97706", card: "#ffffff", muted: "#b45309" },
  ocean: { bg: "#ecfeff", bg2: "#a5f3fc", ink: "#083344", accent: "#0891b2", card: "#ffffff", muted: "#0e7490" },
  forest: { bg: "#f0fdf4", bg2: "#bbf7d0", ink: "#052e16", accent: "#16a34a", card: "#ffffff", muted: "#15803d" },
  sunset: { bg: "#fff7ed", bg2: "#fdba74", ink: "#431407", accent: "#ea580c", card: "#ffffff", muted: "#c2410c" },
  rose: { bg: "#fff1f2", bg2: "#fecdd3", ink: "#4c0519", accent: "#e11d48", card: "#ffffff", muted: "#be123c" },
  slate: { bg: "#f8fafc", bg2: "#cbd5e1", ink: "#0f172a", accent: "#475569", card: "#ffffff", muted: "#334155" },
};

const FONT = "Segoe UI, Arial, Helvetica, sans-serif";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Ngắt dòng gần đúng theo độ rộng ký tự trung bình (≈ 0.55 × cỡ chữ). */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

async function png(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function jpeg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

// ───────────────────────── Poster (lưới thẻ) ─────────────────────────

export function posterSvg(spec: PosterSpec, width = 1600, height = 900): string {
  const t = THEMES[spec.theme];
  const n = spec.sections.length;
  const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const top = spec.subtitle ? 200 : 170;
  const pad = 48;
  const gap = 28;
  const cw = (width - pad * 2 - gap * (cols - 1)) / cols;
  const ch = (height - top - pad - gap * (rows - 1)) / rows;
  // Chọn cỡ chữ lớn nhất mà mọi thẻ đều chứa đủ dòng (sau khi ngắt dòng) — không cắt nội dung.
  const layout = (size: number): { maxChars: number; fits: boolean } => {
    const maxChars = Math.floor((cw - 48) / (size * 0.56));
    const cap = Math.floor((ch - 84) / (size * 1.45));
    return { maxChars, fits: spec.sections.every((s) => s.lines.flatMap((l) => wrap(l, maxChars)).length <= cap) };
  };
  let fs = ch > 300 ? 28 : 24;
  while (fs > 16 && !layout(fs).fits) fs -= 1;
  const { maxChars, fits } = layout(fs);
  if (!fits) console.warn(`  ! poster "${spec.title}" quá dài, bị cắt bớt dòng`);
  const parts: string[] = [];
  spec.sections.forEach((s, i) => {
    const x = pad + (i % cols) * (cw + gap);
    const y = top + Math.floor(i / cols) * (ch + gap);
    const lines = s.lines.flatMap((l) => wrap(l, maxChars)).slice(0, Math.floor((ch - 84) / (fs * 1.45)));
    parts.push(
      `<g><rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="22" fill="${t.card}" stroke="${t.bg2}" stroke-width="3"/>` +
        `<rect x="${x}" y="${y}" width="${cw}" height="64" rx="22" fill="${t.accent}"/><rect x="${x}" y="${y + 40}" width="${cw}" height="24" fill="${t.accent}"/>` +
        `<text x="${x + 24}" y="${y + 43}" font-family="${FONT}" font-size="${fs + 2}" font-weight="700" fill="#ffffff">${esc(s.head)}</text>` +
        lines.map((l, k) => `<text x="${x + 24}" y="${y + 100 + k * fs * 1.45}" font-family="${FONT}" font-size="${fs}" fill="${t.ink}">${esc(l)}</text>`).join("") +
        `</g>`
    );
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg}"/><stop offset="1" stop-color="${t.bg2}"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#bg)"/>` +
    `<text x="${pad}" y="92" font-family="${FONT}" font-size="58" font-weight="800" fill="${t.ink}">${esc(spec.title)}</text>` +
    (spec.subtitle ? `<text x="${pad}" y="150" font-family="${FONT}" font-size="30" fill="${t.muted}">${esc(spec.subtitle)}</text>` : "") +
    `<rect x="${pad}" y="${top - 26}" width="140" height="8" rx="4" fill="${t.accent}"/>` +
    parts.join("") +
    `</svg>`
  );
}

export const renderPoster = async (spec: PosterSpec): Promise<Buffer> => png(posterSvg(spec));

// ───────────────────────── PDF slide ─────────────────────────

function slideSvg(theme: Theme, title: string, bullets: string[], index: number, total: number): string {
  const t = THEMES[theme];
  const w = 1280;
  const h = 720;
  const maxChars = 62;
  const items = bullets.flatMap((b, i) => wrap(b, maxChars).map((l, k) => ({ l, first: k === 0, i })));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="100%" height="100%" fill="${t.bg}"/><rect width="${w}" height="14" fill="${t.accent}"/>` +
    `<rect x="0" y="${h - 14}" width="${w}" height="14" fill="${t.accent}"/>` +
    `<text x="64" y="120" font-family="${FONT}" font-size="50" font-weight="800" fill="${t.ink}">${esc(title)}</text>` +
    `<rect x="64" y="146" width="120" height="7" rx="3" fill="${t.accent}"/>` +
    items
      .map((it, k) => {
        const y = 230 + k * 52;
        return (it.first ? `<circle cx="78" cy="${y - 12}" r="8" fill="${t.accent}"/>` : "") + `<text x="104" y="${y}" font-family="${FONT}" font-size="34" fill="${t.ink}">${esc(it.l)}</text>`;
      })
      .join("") +
    `<text x="${w - 64}" y="${h - 36}" text-anchor="end" font-family="${FONT}" font-size="22" fill="${t.muted}">${index}/${total}</text>` +
    `</svg>`
  );
}

/** PDF nhiều trang: mỗi trang là một ảnh JPEG của slide (đủ để xem được bằng bất kỳ trình đọc PDF nào). */
export async function renderSlidesPdf(theme: Theme, slides: Array<{ title: string; bullets: string[] }>): Promise<Buffer> {
  const pages: Buffer[] = [];
  for (let i = 0; i < slides.length; i++) pages.push(await jpeg(slideSvg(theme, slides[i].title, slides[i].bullets, i + 1, slides.length)));
  return buildImagePdf(pages, 1280, 720);
}

function buildImagePdf(jpegs: Buffer[], w: number, h: number): Buffer {
  // Trang 960×540 pt (16:9). Cấu trúc: 1 Catalog, 2 Pages, rồi mỗi trang 3 đối tượng (Page, Content, Image).
  const pageW = 960;
  const pageH = Math.round((960 * h) / w);
  const objs: Buffer[] = [];
  const add = (b: Buffer | string): number => {
    objs.push(Buffer.isBuffer(b) ? b : Buffer.from(b, "latin1"));
    return objs.length;
  };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(""); // placeholder cho Pages
  const kids: number[] = [];
  jpegs.forEach((img, i) => {
    const imgId = 3 + i * 3 + 2;
    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im${i} Do Q`;
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im${i} ${imgId} 0 R >> >> /Contents ${3 + i * 3 + 1} 0 R >>`));
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, "latin1"), img, Buffer.from("\nendstream", "latin1")]));
  });
  objs[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`, "latin1");

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets: number[] = [];
  let pos = chunks[0].length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const body = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, "latin1"), o, Buffer.from("\nendobj\n", "latin1")]);
    chunks.push(body);
    pos += body.length;
  });
  const xrefPos = pos;
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}

// ───────────────────────── DOCX / XLSX ─────────────────────────

const xmlEsc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function renderDocx(title: string, sections: Array<{ heading: string; paragraphs?: string[]; bullets?: string[] }>): Promise<Buffer> {
  const p = (text: string, style?: string): string =>
    `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
  const body = [
    p(title, "Title"),
    ...sections.flatMap((s) => [p(s.heading, "Heading1"), ...(s.paragraphs ?? []).map((x) => p(x)), ...(s.bullets ?? []).map((b) => p(`• ${b}`))]),
  ].join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style></w:styles>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

function colName(i: number): string {
  let s = "";
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export async function renderXlsx(sheetName: string, rows: string[][]): Promise<Buffer> {
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((c, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          return /^-?\d+(\.\d+)?$/.test(c.trim()) && c.trim() !== "" ? `<c r="${ref}"><v>${c.trim()}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ───────────────────────── Ảnh đại diện / bìa / logo ─────────────────────────

const SKINS = ["#f6d3b8", "#eebd96", "#d99a6c", "#b97a4b", "#8d5a34"];
const HAIRS = ["#1f1a17", "#2c1d12", "#4a2c17", "#6b3f1d", "#111827", "#3b2f2f"];
const SHIRTS = ["#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#e11d48", "#2563eb", "#d97706", "#0d9488", "#9333ea", "#475569"];
const BGS = ["#ede9fe", "#cffafe", "#dcfce7", "#ffedd5", "#ffe4e6", "#dbeafe", "#fef3c7", "#ccfbf1"];

/** Ảnh đại diện minh hoạ phẳng (đầu + vai + tóc), tất định theo `seed` — KHÔNG phải ảnh người thật. */
export async function renderAvatar(seed: string): Promise<Buffer> {
  const r = rngFrom(`avatar:${seed}`);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const skin = pick(SKINS);
  const hair = pick(HAIRS);
  const shirt = pick(SHIRTS);
  const bg = pick(BGS);
  const style = Math.floor(r() * 5);
  const glasses = r() < 0.35;
  const S = 512;
  const hairBack =
    style === 0 ? `<path d="M150 250 C130 120 380 120 362 250 L362 320 L150 320 Z" fill="${hair}"/>` :
    style === 1 ? `<path d="M140 270 C120 90 392 90 372 270 C372 360 340 380 340 380 L172 380 C172 380 140 360 140 270 Z" fill="${hair}"/>` :
    style === 2 ? `<circle cx="256" cy="96" r="44" fill="${hair}"/>` : "";
  const hairFront =
    style === 0 ? `<path d="M162 236 C170 150 340 150 350 236 C320 200 200 200 162 236 Z" fill="${hair}"/>` :
    style === 1 ? `<path d="M158 238 C170 140 342 140 354 238 C330 190 190 190 158 238 Z" fill="${hair}"/>` :
    style === 2 ? `<path d="M160 240 C168 150 344 150 352 240 C322 196 192 196 160 240 Z" fill="${hair}"/>` :
    style === 3 ? `<path d="M160 244 C150 120 362 120 352 244 C340 180 172 180 160 244 Z" fill="${hair}"/><circle cx="170" cy="190" r="26" fill="${hair}"/><circle cx="342" cy="190" r="26" fill="${hair}"/><circle cx="214" cy="160" r="30" fill="${hair}"/><circle cx="298" cy="160" r="30" fill="${hair}"/><circle cx="256" cy="148" r="32" fill="${hair}"/>` :
    `<path d="M160 236 C176 156 336 156 352 236 L352 214 C340 168 172 168 160 214 Z" fill="${hair}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<rect width="${S}" height="${S}" fill="${bg}"/>` +
    hairBack +
    `<path d="M70 512 C70 410 150 370 256 370 C362 370 442 410 442 512 Z" fill="${shirt}"/>` +
    `<rect x="226" y="320" width="60" height="62" rx="20" fill="${skin}"/>` +
    `<ellipse cx="256" cy="262" rx="98" ry="110" fill="${skin}"/>` +
    hairFront +
    `<circle cx="218" cy="268" r="9" fill="#1f2937"/><circle cx="294" cy="268" r="9" fill="#1f2937"/>` +
    `<path d="M222 318 Q256 346 290 318" stroke="#7c2d12" stroke-width="8" fill="none" stroke-linecap="round"/>` +
    (glasses ? `<g fill="none" stroke="#111827" stroke-width="7"><circle cx="218" cy="268" r="30"/><circle cx="294" cy="268" r="30"/><path d="M248 268 H264"/></g>` : "") +
    `</svg>`;
  return png(svg);
}

const SYMBOLS: Record<string, string> = {
  frontend: "&lt;/&gt;",
  math: "∫ Σ",
  appdev: "APP",
  ielts: "Aa",
  dsa: "O(n)",
  backend: "{ }",
  capstone: "LIB",
  uiux: "UI",
};

/** Logo/avatar vuông 512 của nhóm. */
export async function renderWorkspaceAvatar(key: string, name: string, theme: Theme): Promise<Buffer> {
  const t = THEMES[theme];
  const symbol = SYMBOLS[key] ?? name.slice(0, 2).toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.muted}"/></linearGradient></defs>` +
    `<rect width="512" height="512" fill="url(#g)"/>` +
    `<circle cx="400" cy="110" r="150" fill="#ffffff" fill-opacity="0.10"/><circle cx="90" cy="440" r="120" fill="#ffffff" fill-opacity="0.10"/>` +
    `<text x="256" y="300" text-anchor="middle" font-family="${FONT}" font-size="${symbol.length > 4 ? 120 : 170}" font-weight="800" fill="#ffffff">${symbol}</text>` +
    `</svg>`;
  return png(svg);
}

/** Ảnh bìa nhóm 1600×600: gradient + hoạ tiết + tên nhóm. */
export async function renderWorkspaceCover(key: string, name: string, tagline: string, theme: Theme): Promise<Buffer> {
  const t = THEMES[theme];
  const r = rngFrom(`cover:${key}`);
  const bubbles = Array.from({ length: 9 }, () => `<circle cx="${Math.floor(r() * 1600)}" cy="${Math.floor(r() * 600)}" r="${40 + Math.floor(r() * 130)}" fill="#ffffff" fill-opacity="${(0.05 + r() * 0.1).toFixed(2)}"/>`).join("");
  const symbol = SYMBOLS[key] ?? "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="600">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.accent}"/><stop offset="1" stop-color="${t.muted}"/></linearGradient></defs>` +
    `<rect width="1600" height="600" fill="url(#g)"/>${bubbles}` +
    `<text x="1480" y="420" text-anchor="end" font-family="${FONT}" font-size="260" font-weight="800" fill="#ffffff" fill-opacity="0.18">${symbol}</text>` +
    `<text x="90" y="300" font-family="${FONT}" font-size="84" font-weight="800" fill="#ffffff">${esc(name.length > 34 ? name.slice(0, 33) + "…" : name)}</text>` +
    `<text x="90" y="372" font-family="${FONT}" font-size="38" fill="#ffffff" fill-opacity="0.92">${esc(tagline)}</text>` +
    `</svg>`;
  return jpeg(svg);
}
